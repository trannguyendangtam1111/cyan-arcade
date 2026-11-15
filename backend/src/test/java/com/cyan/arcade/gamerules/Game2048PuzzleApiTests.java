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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 2048 Puzzle on the platform: each stage started by its own mode, judged by its own rules, kept in the
 * player's history under that mode, on no leaderboard, and paid nothing (no XP, no coins, no best bonus,
 * achievement or challenge). A refused clear records nothing.
 */
@IntegrationTest
class Game2048PuzzleApiTests {

	private static final Duration ONE_MINUTE = Duration.ofMinutes(1);

	/** A real clear of each stage: the recorded line of {@code game2048Puzzle.test.ts}, as moves and points. */
	private static final int[][] CLEARS = { { 128, 39, 576 }, { 256, 12, 536 }, { 128, 12, 480 }, { 512, 21, 1092 },
			{ 512, 6, 612 }, { 1024, 20, 2172 } };

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void forgetEveryPuzzleRun() {
		String game = "(SELECT id FROM games WHERE slug = '2048')";
		this.jdbc.update("DELETE FROM scores WHERE mode LIKE 'puzzle-%' AND game_id = " + game);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode LIKE 'puzzle-%' AND game_id = " + game);
	}

	@Test
	void twentyFortyEightOffersTheSixStagesAfterTheRankedModesUnranked() throws Exception {
		ResultActions modes = this.mockMvc.perform(get("/api/games/2048/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(9));
		for (int stage = 1; stage <= 6; stage++) {
			String at = "$[%d]".formatted(stage + 2);
			modes.andExpect(jsonPath(at + ".id").value("puzzle-" + stage))
				.andExpect(jsonPath(at + ".ranked").value(false))
				.andExpect(jsonPath(at + ".order").value("DESC"))
				.andExpect(jsonPath(at + ".unit").value("POINTS"))
				// Limits stay on the server.
				.andExpect(jsonPath(at + ".maxScore").doesNotExist());
		}
		modes.andExpect(jsonPath("$[3].name").value("Puzzle 1: First Steps"))
			.andExpect(jsonPath("$[8].name").value("Puzzle 6: Endgame"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aClearIsKeptUnderItsStageAndEarnsNothing(int stage) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int score = CLEARS[stage - 1][2];
		int coinsBefore = coinTransactions(player);
		int xpBefore = xpOf(player);

		clearStage(player, stage).andExpect(jsonPath("$.mode").value("puzzle-" + stage))
			.andExpect(jsonPath("$.score").value(score))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()))
			.andExpect(jsonPath("$.rewards.totalXp").value(xpBefore));

		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
		assertThat(xpOf(player)).isEqualTo(xpBefore);
		assertThat(puzzleScores()).isEqualTo(1);
		this.mockMvc.perform(get("/api/users/me/game-history").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[0].gameSlug").value("2048"))
			.andExpect(jsonPath("$.entries[0].mode").value("puzzle-" + stage))
			.andExpect(jsonPath("$.entries[0].score").value(score))
			.andExpect(jsonPath("$.entries[0].xpEarned").value(0));
	}

	@Test
	void aClearOnTheLastAllowedMoveIsKept() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "puzzle-5");
		playedFor(run, ONE_MINUTE);
		finish(run, 612, clear(512, 10), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("puzzle-5"))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0));
	}

	@Test
	void repeatedAndHigherClearsStillEarnNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int coinsBefore = coinTransactions(player);
		int xpBefore = xpOf(player);
		for (int attempt = 0; attempt < 3; attempt++) {
			clearStage(player, 2).andExpect(jsonPath("$.rewards.xpEarned").value(0))
				.andExpect(jsonPath("$.rewards.coinsEarned").value(0));
		}
		// A higher score than the first: still no best-score bonus.
		String run = start(player, "puzzle-2");
		playedFor(run, ONE_MINUTE);
		finish(run, 600, clear(256, 15), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
		assertThat(xpOf(player)).isEqualTo(xpBefore);
	}

	@Test
	void aClearIsNotTheFirstGameForTheAchievement() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		clearStage(player, 1).andExpect(jsonPath("$.rewards.achievements", empty()));
		String classic = start(player, null);
		playedFor(classic, ONE_MINUTE);
		finish(classic, 600, Game2048MovesRunRulesTests.stuck(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")));
	}

	@ParameterizedTest
	@ValueSource(strings = { "puzzle-1", "puzzle-6" })
	void noStageHasALeaderboard(String mode) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		clearStage(player, 1);
		clearStage(player, 6);

		this.mockMvc.perform(get("/api/leaderboards/2048?mode={mode}", mode).session(player))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"));
		// Nor is a clear on any other board.
		for (String board : new String[] { "", "?mode=moves", "?mode=time-attack" }) {
			this.mockMvc.perform(get("/api/leaderboards/2048" + board).session(player))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.myRank").value(nullValue()));
		}
	}

	/** Each is refused with SCORE_REJECTED and leaves nothing behind. */
	@ParameterizedTest
	@CsvSource({
			// Short of the target: the moves ran out on stage 1 with a 64 at most.
			"1, 64, 60, 400",
			// Stage 1's clear sent as a stage 4 clear, whose target is 512; stage 4's sent as stage 1's.
			"4, 128, 39, 576", "1, 512, 21, 1092",
			// One move past stage 5's budget, and past stage 2's.
			"5, 512, 11, 612", "2, 256, 21, 600",
			// Stage 6 cleared in 7 moves: its board holds 998, and a 1024 needs 7 spawns first.
			"6, 1024, 7, 1100",
			// Points no clear in these moves can score: below building the target, above the board, not a multiple of 4.
			"2, 256, 12, 476", "2, 256, 12, 720", "2, 256, 12, 538",
			// No move at all.
			"5, 512, 0, 512" })
	void impossibleClearsAreRefusedAndRecordNothing(int stage, int highestTile, int moves, int score) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int coinsBefore = coinTransactions(player);
		String run = start(player, "puzzle-" + stage);
		playedFor(run, ONE_MINUTE);
		finish(run, score, clear(highestTile, moves), player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));

		assertThat(puzzleScores()).isZero();
		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
	}

	@Test
	void movesFasterThanAPersonPlaysAreRefused() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		// 60 moves at 25 a second take 2.4 s, and the platform allows 2 s of latency: an instant clear is not one.
		String run = start(player, "puzzle-1");
		finish(run, 616, clear(128, 60), player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(puzzleScores()).isZero();
	}

	@Test
	void aClearWithoutItsDetailsIsRefused() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "puzzle-1");
		playedFor(run, ONE_MINUTE);
		finish(run, 576, Map.of("highestTile", 128), player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(puzzleScores()).isZero();
	}

	@Test
	void aStageThatIsNotDeclaredIsNeverStarted() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		this.mockMvc.perform(post("/api/game-sessions").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"2048\",\"mode\":\"puzzle-7\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"));
	}

	@Test
	void aGuestsClearIsKeptAndEarnsNothing() throws Exception {
		UUID guest = UUID.randomUUID();
		String response = this.mockMvc
			.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, guest)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"2048\",\"mode\":\"puzzle-3\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		String run = JsonPath.read(response, "$.id");
		playedFor(run, ONE_MINUTE);

		this.mockMvc.perform(finishRequest(run, 480, clear(128, 12)).header(GuestPlayer.HEADER, guest))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("puzzle-3"))
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		assertThat(puzzleScores()).isEqualTo(1);
	}

	@Test
	void classicIsRewardedAsBeforeAlongsidePuzzle() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		clearStage(player, 1);

		String classic = start(player, null);
		playedFor(classic, ONE_MINUTE);
		finish(classic, 600, Game2048MovesRunRulesTests.stuck(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.coinsEarned", greaterThanOrEqualTo(1)));
		this.mockMvc.perform(get("/api/leaderboards/2048").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.myScore").value(600));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	private static Map<String, Integer> clear(int highestTile, int moves) {
		return Game2048MovesRunRulesTests.details(highestTile, moves);
	}

	/** Clears a stage with its real clear ({@link #CLEARS}), a minute after it started. */
	private ResultActions clearStage(MockHttpSession player, int stage) throws Exception {
		int[] clear = CLEARS[stage - 1];
		String run = start(player, "puzzle-" + stage);
		playedFor(run, ONE_MINUTE);
		return finish(run, clear[2], clear(clear[0], clear[1]), player).andExpect(status().isOk());
	}

	/** @param mode the mode to start in, or {@code null} for none (Classic) */
	private String start(MockHttpSession player, String mode) throws Exception {
		String body = (mode != null) ? "{\"gameSlug\":\"2048\",\"mode\":\"%s\"}".formatted(mode)
				: "{\"gameSlug\":\"2048\"}";
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

	private int puzzleScores() {
		return this.jdbc.queryForObject(
				"SELECT count(*) FROM scores WHERE mode LIKE 'puzzle-%' AND game_id = (SELECT id FROM games WHERE slug = '2048')",
				Integer.class);
	}

	private int coinTransactions(MockHttpSession player) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ?", Integer.class,
				Players.userId(this.mockMvc, player));
	}

	private int xpOf(MockHttpSession player) throws Exception {
		return this.jdbc.queryForObject("SELECT xp FROM users WHERE id = ?", Integer.class,
				Players.userId(this.mockMvc, player));
	}

}
