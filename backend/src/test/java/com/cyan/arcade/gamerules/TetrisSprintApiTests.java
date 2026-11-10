package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.security.GuestPlayer;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tetris Sprint on the platform: started by name, judged by its own rules, ranked fastest first on a
 * board of its own, and paid what finishing a game earns only for a sprint that cleared its 40 lines.
 * A failed attempt (a top-out or a timeout before the goal) records nothing.
 */
@IntegrationTest
class TetrisSprintApiTests {

	/** A minute of game time, and a little more of real time: the request's way there. */
	private static final Duration ONE_MINUTE_RUN = Duration.ofSeconds(62);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	/** The Sprint board is this class's alone: every test starts it empty. */
	@BeforeEach
	void emptyTheSprintBoard() {
		String tetris = "(SELECT id FROM games WHERE slug = 'tetris')";
		this.jdbc.update("DELETE FROM scores WHERE mode = 'sprint' AND game_id = " + tetris);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode = 'sprint' AND game_id = " + tetris);
	}

	@Test
	void tetrisOffersSprintRankedFastestFirstInMilliseconds() throws Exception {
		this.mockMvc.perform(get("/api/games/tetris/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[2].id").value("sprint"))
			.andExpect(jsonPath("$[2].name").value("Sprint"))
			.andExpect(jsonPath("$[2].ranked").value(true))
			.andExpect(jsonPath("$[2].order").value("ASC"))
			.andExpect(jsonPath("$[2].unit").value("MILLISECONDS"))
			// Its limit stays on the server, like every mode's.
			.andExpect(jsonPath("$[2].maxScore").doesNotExist());
	}

	@Test
	void aFinishedSprintIsRankedByItsTimeAndEarnsTheCompletionReward() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "sprint");
		playedFor(run, ONE_MINUTE_RUN);

		finish(run, 60_000, TetrisSprintRunRulesTests.finished(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("sprint"))
			.andExpect(jsonPath("$.score").value(60_000))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			// What finishing a game earns, and nothing that is Classic's alone (bonus, achievements, challenges).
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
		board("?mode=sprint", player).andExpect(jsonPath("$.order").value("ASC"))
			.andExpect(jsonPath("$.unit").value("MILLISECONDS"))
			.andExpect(jsonPath("$.myScore").value(60_000))
			.andExpect(jsonPath("$.myRank").value(1));
		// A finish is paid once: a repeat is refused and earns nothing more.
		finish(run, 60_000, TetrisSprintRunRulesTests.finished(), player).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
	}

	@Test
	void theSprintBoardRanksFastestFirstWithTiesToWhoeverSetTheTimeFirst() throws Exception {
		MockHttpSession fastest = Players.register(this.mockMvc);
		MockHttpSession first = Players.register(this.mockMvc);
		MockHttpSession second = Players.register(this.mockMvc);
		finishSprint(fastest, 90_000);
		finishSprint(fastest, 50_000);
		finishSprint(first, 70_000);
		finishSprint(second, 70_000);
		// A Classic run's points, far "faster" than any time, stay on the Classic board.
		String classic = start(second, null);
		HonestRuns.playFor(classic);
		finish(classic, 900, HonestRuns.detailsFor("tetris", 900, Map.of()), second).andExpect(status().isOk());

		board("?mode=sprint", fastest).andExpect(jsonPath("$.mode").value("sprint"))
			.andExpect(jsonPath("$.totalEntries").value(3))
			// Each player's best (their lowest time), fastest first.
			.andExpect(jsonPath("$.entries[*].score", contains(50_000, 70_000, 70_000)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2, 3)))
			.andExpect(jsonPath("$.myScore").value(50_000))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=sprint", first).andExpect(jsonPath("$.myRank").value(2));
		board("?mode=sprint", second).andExpect(jsonPath("$.myRank").value(3));
		// Neither board holds the other's runs.
		board("", second).andExpect(jsonPath("$.mode").value("classic")).andExpect(jsonPath("$.myScore").value(900));
		board("", fastest).andExpect(jsonPath("$.myRank").value(nullValue()));
		board("?mode=ultra", fastest).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void onlyAFasterTimeIsANewBest() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		assertThat(finishSprint(player, 80_000)).isTrue();
		assertThat(finishSprint(player, 90_000)).isFalse();
		assertThat(finishSprint(player, 80_000)).isFalse();
		assertThat(finishSprint(player, 79_960)).isTrue();
		board("?mode=sprint", player).andExpect(jsonPath("$.myScore").value(79_960));
		// Every finished sprint is a completed game, within the same daily limit as any other.
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(4);
	}

	@Test
	void failedAttemptsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		// Topped out at 25 lines.
		refused(player, Duration.ofSeconds(46), 45_000, TetrisSprintRunRulesTests.details(25, 70, 45_000));
		// Timed out at five minutes with 30 lines.
		refused(player, Duration.ofSeconds(302), 300_000, TetrisSprintRunRulesTests.details(30, 90, 300_000));
		// Tetris points sent in place of the time.
		refused(player, ONE_MINUTE_RUN, 5_000, TetrisSprintRunRulesTests.finished());
		// Faster game time than the session lasted, and paused for twice the allowance.
		refused(player, Duration.ofSeconds(30), 60_000, TetrisSprintRunRulesTests.finished());
		refused(player, Duration.ofMinutes(3), 60_000, TetrisSprintRunRulesTests.finished());
		// Classic's details alone: no game time.
		refused(player, ONE_MINUTE_RUN, 60_000, Map.of("lines", 40, "level", 5, "pieces", 100));

		assertThat(sprintScores()).isZero();
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
		board("?mode=sprint", player).andExpect(jsonPath("$.totalEntries").value(0))
			.andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void aGuestsSprintIsRankedAndEarnsNothing() throws Exception {
		UUID guest = UUID.randomUUID();
		String run = startAsGuest(guest);
		playedFor(run, ONE_MINUTE_RUN);

		this.mockMvc
			.perform(finishRequest(run, 60_000, TetrisSprintRunRulesTests.finished()).header(GuestPlayer.HEADER, guest))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("sprint"))
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		this.mockMvc.perform(get("/api/leaderboards/tetris?mode=sprint").header(GuestPlayer.HEADER, guest))
			.andExpect(jsonPath("$.myScore").value(60_000));
	}

	@Test
	void anUltraRunIsRewardedAsBefore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "ultra");
		playedFor(run, Duration.ofSeconds(125));

		finish(run, 5000, TetrisUltraRunRulesTests.fullRun(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("ultra"))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5));
		// An Ultra score is not a time.
		board("?mode=sprint", player).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** Finishes a 40-line sprint in this much game time; whether it was a new best. */
	private boolean finishSprint(MockHttpSession player, int gameMs) throws Exception {
		String run = start(player, "sprint");
		playedFor(run, Duration.ofMillis(gameMs + 2_000));
		String response = finish(run, gameMs, TetrisSprintRunRulesTests.finishedIn(gameMs), player)
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.rewards.personalBest");
	}

	private void refused(MockHttpSession player, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, "sprint");
		playedFor(run, played);
		finish(run, score, details, player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	/** @param mode the mode to start in, or {@code null} for none (Classic) */
	private String start(MockHttpSession player, String mode) throws Exception {
		String body = (mode != null) ? "{\"gameSlug\":\"tetris\",\"mode\":\"%s\"}".formatted(mode)
				: "{\"gameSlug\":\"tetris\"}";
		String response = this.mockMvc
			.perform(post("/api/game-sessions").session(player).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value((mode != null) ? mode : "classic"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private String startAsGuest(UUID guest) throws Exception {
		String response = this.mockMvc
			.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, guest)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"tetris\",\"mode\":\"sprint\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private ResultActions finish(String run, int score, Map<String, Integer> details, MockHttpSession player)
			throws Exception {
		return this.mockMvc.perform(finishRequest(run, score, details).session(player));
	}

	private static MockHttpServletRequestBuilder finishRequest(String run, int score, Map<String, Integer> details) {
		return post("/api/game-sessions/{id}/finish", run).contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details)));
	}

	/** Moves the run's start back by exactly this long. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update(
				"UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toMillis() / 1000.0, run);
	}

	private ResultActions board(String query, MockHttpSession player) throws Exception {
		return this.mockMvc.perform(get("/api/leaderboards/tetris" + query).session(player)).andExpect(status().isOk());
	}

	private int sprintScores() {
		return this.jdbc.queryForObject(
				"SELECT count(*) FROM scores WHERE mode = 'sprint' AND game_id = (SELECT id FROM games WHERE slug = 'tetris')",
				Integer.class);
	}

	private int coinTransactions(MockHttpSession player, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, Players.userId(this.mockMvc, player), type);
	}

}
