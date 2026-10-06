package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.score.RunRules;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Minesweeper, the reference for adding a game: a catalog row and a {@link RunRules} bean are all
 * it brings to the server, and sessions, scores, leaderboards, rewards, achievements and statistics
 * work for it as they do for every game.
 */
@IntegrationTest
class MinesweeperApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private List<RunRules> rules;

	// --- Registration -------------------------------------------------------------------------------

	@Test
	void minesweeperIsInTheCatalogAndCanBePlayed() throws Exception {
		this.mockMvc.perform(get("/api/games/minesweeper"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Minesweeper"))
			.andExpect(jsonPath("$.category").value("PUZZLE"))
			.andExpect(jsonPath("$.thumbnailUrl").value("/thumbnails/minesweeper.svg"));
		this.mockMvc.perform(get("/api/games")).andExpect(jsonPath("$[*].slug", hasItem("minesweeper")));

		start(Players.register(this.mockMvc), null);
	}

	@Test
	void everyGameInTheCatalogHasItsRules() {
		List<String> catalog = this.jdbc.queryForList("SELECT slug FROM games WHERE active ORDER BY slug", String.class);
		assertThat(this.rules.stream().map(RunRules::gameSlug).sorted().toList()).containsAll(catalog);
	}

	// --- Runs ----------------------------------------------------------------------------------------

	@Test
	void aLostGameIsRecordedAndRanked() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(20));

		// Twelve safe cells in three clicks, then a mine: 120 points.
		finish(run, 120, result(12, 1, false, 4, 20), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value("minesweeper"))
			.andExpect(jsonPath("$.score").value(120))
			.andExpect(jsonPath("$.rewards.personalBest").value(true));

		String username = JsonPath.read(this.mockMvc.perform(get("/api/users/me").session(player)).andReturn()
			.getResponse().getContentAsString(), "$.username");
		this.mockMvc.perform(get("/api/leaderboards/minesweeper?period=DAILY&size=100").session(player))
			.andExpect(jsonPath("$.myScore").value(120))
			.andExpect(jsonPath("$.entries[?(@.you == true)].player.username", hasItem(username)));
		this.mockMvc.perform(get("/api/users/me/stats").session(player))
			.andExpect(jsonPath("$.games[?(@.slug == 'minesweeper')].bestScore", hasItem(120)))
			.andExpect(jsonPath("$.games[?(@.slug == 'minesweeper')].gamesPlayed", hasItem(1)));
	}

	@Test
	void aClearedBoardEarnsItsTimeBonusTheAchievementAndTheUsualRewards() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(90));

		// 710 for the cells, 500 for the win, 600 − 90 = 510 for the time.
		finish(run, 1720, result(71, 6, true, 30, 90), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("MINESWEEPER_CLEAR")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")))
			// 5 for playing, 15 for a best, 100 for "First Coin", 150 for "All Clear".
			.andExpect(jsonPath("$.rewards.coinsEarned").value(270));

		// A lower score later is no best.
		String second = start(player, null);
		playedFor(second, Duration.ofSeconds(20));
		finish(second, 50, result(5, 0, false, 2, 20), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.personalBest").value(false));
	}

	@Test
	void aGuestPlaysAsForAnyGame() throws Exception {
		UUID browser = UUID.randomUUID();
		String run = start(null, browser);
		playedFor(run, Duration.ofSeconds(30));

		finish(run, 40, result(4, 0, false, 2, 30), null, UUID.randomUUID()).andExpect(status().isForbidden());
		finish(run, 40, result(4, 0, false, 2, 30), null, browser).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		finish(run, 40, result(4, 0, false, 2, 30), null, browser).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
		this.mockMvc.perform(get("/api/leaderboards/minesweeper?period=DAILY&size=100").header(PLAYER_HEADER, browser))
			.andExpect(jsonPath("$.myScore").value(40));
	}

	// --- What a run cannot be -------------------------------------------------------------------------

	@Test
	void resultsThatCannotHaveHappenedAreRejectedAndEarnNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(90));

		// Each with the score its numbers would give, so only the broken rule can refuse it.
		List<Map.Entry<Integer, String>> impossible = List.of(
				// Another game's details instead of Minesweeper's.
				Map.entry(1720, "{\"length\":15,\"level\":3}"),
				// A bigger board, with more mines, than the game has.
				Map.entry(1720, result(71, 0, true, 30, 90).replace("\"rows\":9,\"columns\":9,\"mines\":10",
						"\"rows\":16,\"columns\":16,\"mines\":40")),
				// A win with a safe cell still covered.
				Map.entry(1710, result(70, 0, true, 30, 90)),
				// More flags than mines.
				Map.entry(1720, result(71, 11, true, 30, 90)),
				// A lost game that never got past its first click, which is always safe.
				Map.entry(0, result(0, 0, false, 1, 90)),
				// Far more clicks than cells they uncovered.
				Map.entry(100, result(10, 0, false, 50, 90)));
		for (Map.Entry<Integer, String> attempt : impossible) {
			finish(run, attempt.getKey(), attempt.getValue(), player, null).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		}
		// The right details with a score they do not give.
		finish(run, 1810, result(71, 0, true, 30, 90), player, null).andExpect(status().isBadRequest());
		// A cleared board claiming to have taken 5 seconds, when the server saw 90: the time bonus is the server's.
		finish(run, 1305, result(71, 0, true, 30, 5), player, null).andExpect(status().isBadRequest());

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid",
				Integer.class, run)).isZero();
		this.mockMvc.perform(get("/api/users/me").session(player))
			.andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.coins").value(0));

		// The honest result of the same run is still accepted.
		finish(run, 1720, result(71, 0, true, 30, 90), player, null).andExpect(status().isOk());
	}

	@Test
	void clicksFasterThanAPersonCanMakeAreRejected() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(1));

		// Sixty clicks in a second.
		finish(run, 600, result(60, 0, false, 60, 1), player, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	// --- Helpers ------------------------------------------------------------------------------------

	/** A Beginner board's result, as the game reports it. */
	private static String result(int revealedCells, int flagsUsed, boolean won, int moves, int seconds) {
		return "{\"rows\":9,\"columns\":9,\"mines\":10,\"revealedCells\":%d,\"flagsUsed\":%d,\"won\":%d,\"moves\":%d,\"seconds\":%d}"
			.formatted(revealedCells, flagsUsed, won ? 1 : 0, moves, seconds);
	}

	private String start(MockHttpSession session, UUID playerId) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"minesweeper\"}");
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return JsonPath.read(this.mockMvc.perform(request)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.gameSlug").value("minesweeper"))
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
	}

	private ResultActions finish(String run, int score, String details, MockHttpSession session, UUID playerId)
			throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions/{id}/finish", run)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, details));
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return this.mockMvc.perform(request);
	}

	/** Moves a run's start back, as if it had been played for that long. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update("UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toSeconds(), run);
	}

}
