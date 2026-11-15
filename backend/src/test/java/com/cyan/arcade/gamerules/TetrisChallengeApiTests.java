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
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tetris Challenge on the platform: each stage started by its own mode, judged by its own rules, kept
 * in the player's history under that mode, on no leaderboard, and paid nothing (no XP, no coins, no
 * best bonus, achievement or challenge). A failed attempt records nothing.
 */
@IntegrationTest
class TetrisChallengeApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void forgetEveryChallengeRun() {
		String tetris = "(SELECT id FROM games WHERE slug = 'tetris')";
		this.jdbc.update("DELETE FROM scores WHERE mode LIKE 'challenge-%' AND game_id = " + tetris);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode LIKE 'challenge-%' AND game_id = " + tetris);
	}

	@Test
	void tetrisOffersTheSixStagesUnrankedAsTimes() throws Exception {
		ResultActions modes = this.mockMvc.perform(get("/api/games/tetris/modes")).andExpect(status().isOk());
		for (int stage = 1; stage <= 6; stage++) {
			String at = "$[%d]".formatted(stage + 2);
			modes.andExpect(jsonPath(at + ".id").value("challenge-" + stage))
				.andExpect(jsonPath(at + ".ranked").value(false))
				.andExpect(jsonPath(at + ".order").value("ASC"))
				.andExpect(jsonPath(at + ".unit").value("MILLISECONDS"))
				.andExpect(jsonPath(at + ".maxScore").doesNotExist());
		}
		modes.andExpect(jsonPath("$[3].name").value("Challenge 1: Clean-up"))
			.andExpect(jsonPath("$[8].name").value("Challenge 6: Last stand"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aClearIsKeptUnderItsStageAndEarnsNothing(int stage) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Map<String, Integer> clear = TetrisChallengeRunRulesTests.cleared(stage);
		int coinsBefore = coinTransactions(player);
		int xpBefore = xpOf(player);
		int gameMs = clear.get("gameMs");
		String run = start(player, "challenge-" + stage);
		playedFor(run, Duration.ofMillis(gameMs + 2_000));

		finish(run, gameMs, clear, player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("challenge-" + stage))
			.andExpect(jsonPath("$.score").value(gameMs))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()))
			.andExpect(jsonPath("$.rewards.totalXp").value(xpBefore));

		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
		assertThat(xpOf(player)).isEqualTo(xpBefore);
		assertThat(challengeScores()).isEqualTo(1);
		// In the history, as a time under its stage's mode.
		this.mockMvc.perform(get("/api/users/me/game-history").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[0].gameSlug").value("tetris"))
			.andExpect(jsonPath("$.entries[0].mode").value("challenge-" + stage))
			.andExpect(jsonPath("$.entries[0].score").value(gameMs))
			.andExpect(jsonPath("$.entries[0].xpEarned").value(0));
	}

	@Test
	void repeatedClearsStillEarnNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int coinsBefore = coinTransactions(player);
		int xpBefore = xpOf(player);
		for (int clear = 0; clear < 3; clear++) {
			clearStage(player, 1).andExpect(jsonPath("$.rewards.xpEarned").value(0))
				.andExpect(jsonPath("$.rewards.coinsEarned").value(0));
		}
		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
		assertThat(xpOf(player)).isEqualTo(xpBefore);
	}

	@ParameterizedTest
	@ValueSource(strings = { "challenge-1", "challenge-6" })
	void noStageHasALeaderboard(String mode) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		clearStage(player, 1);

		this.mockMvc.perform(get("/api/leaderboards/tetris?mode={mode}", mode).session(player))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"));
		// Nor is a clear on any other board.
		for (String board : new String[] { "", "?mode=ultra", "?mode=sprint" }) {
			this.mockMvc.perform(get("/api/leaderboards/tetris" + board).session(player))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.myRank").value(nullValue()));
		}
	}

	@Test
	void failedAttemptsAndImpossibleClearsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int coinsBefore = coinTransactions(player);
		// Topped out on stage 1 with a garbage row left.
		refused(player, 1, Duration.ofSeconds(12), 9_680, TetrisChallengeRunRulesTests.details(5, 12, 9_680, 3));
		// Timed out on stage 2 at two minutes, short of the goal.
		refused(player, 2, Duration.ofSeconds(122), 120_000, TetrisChallengeRunRulesTests.details(8, 60, 120_000, 4));
		// Stage 2's numbers sent as a stage 3 clear: its ten rows were not all dug.
		refused(player, 3, Duration.ofSeconds(15), 12_880, TetrisChallengeRunRulesTests.cleared(2));
		// More game time than the session lasted; paused for twice the allowance; too fast a pace.
		refused(player, 3, Duration.ofSeconds(30), 48_720, TetrisChallengeRunRulesTests.cleared(3));
		refused(player, 3, Duration.ofMinutes(3), 48_720, TetrisChallengeRunRulesTests.cleared(3));
		refused(player, 3, Duration.ofSeconds(5), 3_000,
				TetrisChallengeRunRulesTests.details(30, 55, 3_000, 10));
		// Sprint's details: no garbage.
		refused(player, 1, Duration.ofSeconds(12), 9_680, Map.of("lines", 6, "level", 1, "pieces", 10, "gameMs", 9_680));

		assertThat(challengeScores()).isZero();
		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
	}

	@Test
	void aGuestsClearIsKeptAndEarnsNothing() throws Exception {
		UUID guest = UUID.randomUUID();
		String response = this.mockMvc
			.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, guest)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"tetris\",\"mode\":\"challenge-2\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		String run = JsonPath.read(response, "$.id");
		playedFor(run, Duration.ofSeconds(15));

		this.mockMvc
			.perform(finishRequest(run, 12_880, TetrisChallengeRunRulesTests.cleared(2)).header(GuestPlayer.HEADER, guest))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("challenge-2"))
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		assertThat(challengeScores()).isEqualTo(1);
	}

	@Test
	void classicUltraAndSprintAreRewardedAsBeforeAlongsideChallenge() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		clearStage(player, 1);

		String sprint = start(player, "sprint");
		playedFor(sprint, Duration.ofSeconds(62));
		finish(sprint, 60_000, TetrisSprintRunRulesTests.finished(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5));

		String ultra = start(player, "ultra");
		playedFor(ultra, Duration.ofSeconds(125));
		finish(ultra, 5000, TetrisUltraRunRulesTests.fullRun(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5));

		// A first Classic run: completion and a new best, as always.
		String classic = start(player, null);
		HonestRuns.playFor(classic);
		finish(classic, 900, HonestRuns.detailsFor("tetris", 900, Map.of()), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.xpEarned", greaterThanOrEqualTo(35)));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** Clears a stage with its plausible clear (`TetrisChallengeRunRulesTests.cleared`). */
	private ResultActions clearStage(MockHttpSession player, int stage) throws Exception {
		Map<String, Integer> clear = TetrisChallengeRunRulesTests.cleared(stage);
		String run = start(player, "challenge-" + stage);
		playedFor(run, Duration.ofMillis(clear.get("gameMs") + 2_000));
		return finish(run, clear.get("gameMs"), clear, player).andExpect(status().isOk());
	}

	private void refused(MockHttpSession player, int stage, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, "challenge-" + stage);
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

	private int challengeScores() {
		return this.jdbc.queryForObject(
				"SELECT count(*) FROM scores WHERE mode LIKE 'challenge-%' AND game_id = (SELECT id FROM games WHERE slug = 'tetris')",
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
