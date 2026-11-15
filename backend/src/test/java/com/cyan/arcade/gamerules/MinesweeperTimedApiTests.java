package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
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
 * Minesweeper's timed modes on the platform: Beginner, Intermediate and Expert are started by name,
 * judged by their own rules, ranked fastest first on boards of their own, and paid what finishing a
 * game earns (never Classic's personal-best bonus, achievements or daily challenges). Only a cleared
 * board is recorded. Classic is unchanged.
 */
@IntegrationTest
class MinesweeperTimedApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	/** The timed boards are this class's alone: every test starts them empty. */
	@BeforeEach
	void emptyTheTimedBoards() {
		String minesweeper = "(SELECT id FROM games WHERE slug = 'minesweeper')";
		String timed = "mode IN ('beginner', 'intermediate', 'expert')";
		this.jdbc.update("DELETE FROM scores WHERE " + timed + " AND game_id = " + minesweeper);
		this.jdbc.update("DELETE FROM game_sessions WHERE " + timed + " AND game_id = " + minesweeper);
	}

	@Test
	void minesweeperOffersClassicAndThreeTimedModesRankedFastestFirst() throws Exception {
		this.mockMvc.perform(get("/api/games/minesweeper/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].id", contains("classic", "beginner", "intermediate", "expert")))
			.andExpect(jsonPath("$[*].name", contains("Classic", "Beginner", "Intermediate", "Expert")))
			.andExpect(jsonPath("$[0].order").value("DESC"))
			.andExpect(jsonPath("$[0].unit").value("POINTS"))
			.andExpect(jsonPath("$[?(@.id != 'classic')].ranked", contains(true, true, true)))
			.andExpect(jsonPath("$[?(@.id != 'classic')].order", contains("ASC", "ASC", "ASC")))
			.andExpect(jsonPath("$[?(@.id != 'classic')].unit", contains("MILLISECONDS", "MILLISECONDS", "MILLISECONDS")))
			// Limits stay on the server.
			.andExpect(jsonPath("$[1].maxScore").doesNotExist());
	}

	@Test
	void aClearedBoardInEachTimedModeIsRankedByItsTimeAndEarnsTheCompletionRewardOnly() throws Exception {
		Map<String, MinesweeperBoard> boards = Map.of("beginner", MinesweeperBoard.BEGINNER, "intermediate",
				MinesweeperBoard.INTERMEDIATE, "expert", MinesweeperBoard.EXPERT);
		for (Map.Entry<String, MinesweeperBoard> entry : boards.entrySet()) {
			String mode = entry.getKey();
			MockHttpSession player = Players.register(this.mockMvc);
			String run = start(player, mode);
			playedFor(run, Duration.ofSeconds(100));

			finish(run, 100_000, cleared(entry.getValue(), 100_000), player).andExpect(status().isOk())
				.andExpect(jsonPath("$.mode").value(mode))
				.andExpect(jsonPath("$.score").value(100_000))
				.andExpect(jsonPath("$.rewards.personalBest").value(true))
				// What finishing a game earns, and nothing that is Classic's alone.
				.andExpect(jsonPath("$.rewards.xpEarned").value(10))
				.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
				.andExpect(jsonPath("$.rewards.achievements", empty()))
				.andExpect(jsonPath("$.rewards.bonuses", empty()));

			assertThat(coinTransactions(player, "GAME_COMPLETION")).as(mode).isEqualTo(1);
			assertThat(coinTransactions(player, "HIGH_SCORE")).as(mode).isZero();
			assertThat(allCoinTransactions(player)).as(mode).isEqualTo(1);
			board("?mode=" + mode, player).andExpect(jsonPath("$.order").value("ASC"))
				.andExpect(jsonPath("$.unit").value("MILLISECONDS"))
				.andExpect(jsonPath("$.myScore").value(100_000))
				.andExpect(jsonPath("$.myRank").value(1));
			// The Classic board does not hold it.
			board("", player).andExpect(jsonPath("$.myRank").value(nullValue()));
		}
	}

	@Test
	void eachTimedBoardRanksFastestFirstWithTiesToWhoeverSetTheTimeFirst() throws Exception {
		MockHttpSession fastest = Players.register(this.mockMvc);
		MockHttpSession first = Players.register(this.mockMvc);
		MockHttpSession second = Players.register(this.mockMvc);
		clear(fastest, "beginner", 40_000);
		clear(fastest, "beginner", 20_000);
		clear(first, "beginner", 30_000);
		clear(second, "beginner", 30_000);
		// Another timed mode's time stays on its own board.
		clear(second, "intermediate", 10_000);

		board("?mode=beginner", fastest).andExpect(jsonPath("$.mode").value("beginner"))
			.andExpect(jsonPath("$.totalEntries").value(3))
			.andExpect(jsonPath("$.entries[*].score", contains(20_000, 30_000, 30_000)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2, 3)))
			.andExpect(jsonPath("$.myScore").value(20_000));
		board("?mode=beginner", first).andExpect(jsonPath("$.myRank").value(2));
		board("?mode=beginner", second).andExpect(jsonPath("$.myRank").value(3));
		board("?mode=intermediate", second).andExpect(jsonPath("$.totalEntries").value(1))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=expert", second).andExpect(jsonPath("$.totalEntries").value(0));
	}

	@Test
	void onlyALowerTimeIsANewBest() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		assertThat(clear(player, "expert", 80_000)).isTrue();
		assertThat(clear(player, "expert", 90_000)).isFalse();
		assertThat(clear(player, "expert", 80_000)).isFalse();
		assertThat(clear(player, "expert", 79_999)).isTrue();
		board("?mode=expert", player).andExpect(jsonPath("$.myScore").value(79_999));
		// Every cleared board is a completed game, within the daily limit, and none earns the bonus.
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(4);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
	}

	@Test
	void lossesAndImpossibleRunsAreRefusedAndEarnNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		MinesweeperBoard beginner = MinesweeperBoard.BEGINNER;
		Map<String, Integer> win = cleared(beginner, 30_000);
		Duration thirty = Duration.ofSeconds(30);
		// A loss: a mine hit after 40 cells.
		refused(player, "beginner", thirty, 30_000, with(with(win, "won", 0), "revealedCells", 40));
		// Classic's points in place of the time, and Classic's details.
		refused(player, "beginner", thirty, 1220, win);
		refused(player, "beginner", thirty, 30_000,
				MinesweeperRunRulesTests.details(beginner, 71, 0, true, 20, 30));
		// Another mode's board.
		refused(player, "expert", thirty, 30_000, win);
		// Fewer moves than the board's 3BV, more than its safe cells.
		refused(player, "beginner", thirty, 30_000, with(win, "moves", win.get("moves") - 1));
		refused(player, "beginner", thirty, 30_000, with(win, "moves", 72));
		// More mines flagged than there are, a first cell off the board.
		refused(player, "beginner", thirty, 30_000, with(win, "flagsUsed", 11));
		refused(player, "beginner", thirty, 30_000, with(win, "firstCell", 81));
		// Game time out of the limit, and against the server's clock.
		refused(player, "beginner", Duration.ofSeconds(1001), 1_000_000, with(win, "gameMs", 1_000_000));
		refused(player, "beginner", Duration.ofSeconds(10), 30_000, win);
		refused(player, "beginner", Duration.ofSeconds(40), 30_000, win);

		assertThat(timedScores()).isZero();
		assertThat(allCoinTransactions(player)).isZero();
		board("?mode=beginner", player).andExpect(jsonPath("$.totalEntries").value(0));
	}

	@Test
	void malformedDetailsAreRefusedBeforeTheRules() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		// A negative seed is not a detail the platform takes: the game sends seeds below 2^31.
		String run = start(player, "beginner");
		playedFor(run, Duration.ofSeconds(30));
		finish(run, 30_000, with(cleared(MinesweeperBoard.BEGINNER, 30_000), "seed", -5), player)
			.andExpect(status().isBadRequest());
		// A missing detail.
		Map<String, Integer> noSeed = new HashMap<>(cleared(MinesweeperBoard.BEGINNER, 30_000));
		noSeed.remove("seed");
		refused(player, "beginner", Duration.ofSeconds(30), 30_000, noSeed);
		assertThat(timedScores()).isZero();
	}

	@Test
	void aGuestsClearIsRankedAndEarnsNothing() throws Exception {
		UUID guest = UUID.randomUUID();
		String response = this.mockMvc
			.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, guest)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"minesweeper\",\"mode\":\"intermediate\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		String run = JsonPath.read(response, "$.id");
		playedFor(run, Duration.ofSeconds(60));

		this.mockMvc
			.perform(finishRequest(run, 60_000, cleared(MinesweeperBoard.INTERMEDIATE, 60_000))
				.header(GuestPlayer.HEADER, guest))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("intermediate"))
			.andExpect(jsonPath("$.rewards").value(nullValue()));
	}

	@Test
	void classicIsScoredAndRewardedAsBefore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		HonestRuns.playFor(run);
		finish(run, 1210, HonestRuns.detailsFor("minesweeper", 1210, Map.of()), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.score").value(1210))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			// The completion reward, the personal-best bonus and the "All Clear" achievement, as before.
			.andExpect(jsonPath("$.rewards.xpEarned").value(org.hamcrest.Matchers.greaterThan(10)))
			.andExpect(jsonPath("$.rewards.achievements[*].code",
					org.hamcrest.Matchers.hasItem("MINESWEEPER_CLEAR")));
		board("", player).andExpect(jsonPath("$.order").value("DESC")).andExpect(jsonPath("$.myScore").value(1210));
		board("?mode=beginner", player).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** A cleared board laid from the tests' seed around its middle cell, in exactly its 3BV moves. */
	static Map<String, Integer> cleared(MinesweeperBoard board, int gameMs) {
		int first = board.cells() / 2;
		return MinesweeperRunRulesTests.timedWin(board, first, MinesweeperRunRulesTests.threeBV(board, first), 0,
				gameMs);
	}

	private static Map<String, Integer> with(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	/** Clears the mode's board in this much game time; whether it was a new best. */
	private boolean clear(MockHttpSession player, String mode, int gameMs) throws Exception {
		MinesweeperBoard board = MinesweeperRunRules.boardFor(mode).orElseThrow();
		String run = start(player, mode);
		playedFor(run, Duration.ofMillis(gameMs));
		String response = finish(run, gameMs, cleared(board, gameMs), player).andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.rewards.personalBest");
	}

	private void refused(MockHttpSession player, String mode, Duration played, int score,
			Map<String, Integer> details) throws Exception {
		String run = start(player, mode);
		playedFor(run, played);
		finish(run, score, details, player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	/** @param mode the mode to start in, or {@code null} for none (Classic) */
	private String start(MockHttpSession player, String mode) throws Exception {
		String body = (mode != null) ? "{\"gameSlug\":\"minesweeper\",\"mode\":\"%s\"}".formatted(mode)
				: "{\"gameSlug\":\"minesweeper\"}";
		String response = this.mockMvc
			.perform(post("/api/game-sessions").session(player).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value((mode != null) ? mode : "classic"))
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
		return this.mockMvc.perform(get("/api/leaderboards/minesweeper" + query).session(player))
			.andExpect(status().isOk());
	}

	private int timedScores() {
		return this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE mode IN ('beginner', 'intermediate', 'expert')"
				+ " AND game_id = (SELECT id FROM games WHERE slug = 'minesweeper')", Integer.class);
	}

	private int coinTransactions(MockHttpSession player, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, Players.userId(this.mockMvc, player), type);
	}

	private int allCoinTransactions(MockHttpSession player) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ?", Integer.class,
				Players.userId(this.mockMvc, player));
	}

}
