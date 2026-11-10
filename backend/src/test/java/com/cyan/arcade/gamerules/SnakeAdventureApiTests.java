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
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Snake Adventure on the platform: each stage started by its own mode, judged by its own rules, kept
 * in the player's history under that mode as a time, on no leaderboard, and paid nothing (no XP, no
 * coins, no best bonus, achievement or challenge). A failed attempt records nothing.
 */
@IntegrationTest
class SnakeAdventureApiTests {

	private static final Duration HALF_HOUR = Duration.ofMinutes(30);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void forgetEveryAdventureRun() {
		String snake = "(SELECT id FROM games WHERE slug = 'snake')";
		this.jdbc.update("DELETE FROM scores WHERE mode LIKE 'adventure-%' AND game_id = " + snake);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode LIKE 'adventure-%' AND game_id = " + snake);
	}

	@Test
	void snakeOffersTheSixStagesAfterTheMapsUnrankedAsTimes() throws Exception {
		ResultActions modes = this.mockMvc.perform(get("/api/games/snake/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(10));
		for (int stage = 1; stage <= 6; stage++) {
			String at = "$[%d]".formatted(stage + 3);
			modes.andExpect(jsonPath(at + ".id").value("adventure-" + stage))
				.andExpect(jsonPath(at + ".ranked").value(false))
				.andExpect(jsonPath(at + ".order").value("ASC"))
				.andExpect(jsonPath(at + ".unit").value("MILLISECONDS"))
				// Limits stay on the server.
				.andExpect(jsonPath(at + ".maxScore").doesNotExist());
		}
		modes.andExpect(jsonPath("$[4].name").value("Adventure 1: Open"))
			.andExpect(jsonPath("$[9].name").value("Adventure 6: Rooms"));
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aClearIsKeptUnderItsStageAndEarnsNothing(int stage) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Map<String, Integer> clear = SnakeAdventureRunRulesTests.cleared(stage);
		int gameMs = clear.get("gameMs");
		int coinsBefore = coinTransactions(player);
		int xpBefore = xpOf(player);

		clearStage(player, stage).andExpect(jsonPath("$.mode").value("adventure-" + stage))
			.andExpect(jsonPath("$.score").value(gameMs))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()))
			.andExpect(jsonPath("$.rewards.totalXp").value(xpBefore));

		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
		assertThat(xpOf(player)).isEqualTo(xpBefore);
		assertThat(adventureScores()).isEqualTo(1);
		// In the history, as a time under its stage's mode.
		this.mockMvc.perform(get("/api/users/me/game-history").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[0].gameSlug").value("snake"))
			.andExpect(jsonPath("$.entries[0].mode").value("adventure-" + stage))
			.andExpect(jsonPath("$.entries[0].score").value(gameMs))
			.andExpect(jsonPath("$.entries[0].xpEarned").value(0));
	}

	@Test
	void repeatedAndFasterClearsStillEarnNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int coinsBefore = coinTransactions(player);
		int xpBefore = xpOf(player);
		for (int clear = 0; clear < 3; clear++) {
			clearStage(player, 1).andExpect(jsonPath("$.rewards.xpEarned").value(0))
				.andExpect(jsonPath("$.rewards.coinsEarned").value(0));
		}
		// A faster clear than the first: still no best-score bonus.
		int fastest = SnakeRunRules.fastestGameMs(178, 10);
		String run = start(player, "adventure-1");
		playedFor(run, Duration.ofMillis(fastest + 2_000));
		finish(run, fastest, SnakeAdventureRunRulesTests.details(10, 178, fastest), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
		assertThat(xpOf(player)).isEqualTo(xpBefore);
	}

	@Test
	void aClearIsNotTheFirstGameForTheAchievement() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		clearStage(player, 3).andExpect(jsonPath("$.rewards.achievements", empty()));
		String classic = start(player, null);
		playedFor(classic, HALF_HOUR);
		finish(classic, 5, SnakeMapsRunRulesTests.details(5), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")));
	}

	@ParameterizedTest
	@ValueSource(strings = { "adventure-1", "adventure-6" })
	void noStageHasALeaderboard(String mode) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		clearStage(player, 1);

		this.mockMvc.perform(get("/api/leaderboards/snake?mode={mode}", mode).session(player))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"));
		// Nor is a clear on any other board.
		for (String board : new String[] { "", "?mode=map-pillars", "?mode=map-tunnels", "?mode=map-rooms" }) {
			this.mockMvc.perform(get("/api/leaderboards/snake" + board).session(player))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.myRank").value(nullValue()));
		}
	}

	@Test
	void failedAttemptsAndImpossibleClearsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int coinsBefore = coinTransactions(player);
		// A crash on stage 1 with 7 of its 10 apples.
		refused(player, 1, HALF_HOUR, 60, SnakeAdventureRunRulesTests.details(7, 60, SnakeRunRules.fastestGameMs(60, 7)));
		// Stage 4's 400 moves used up with 14 of 15 apples; then a run claiming a 401st move.
		refused(player, 4, HALF_HOUR, SnakeRunRules.fastestGameMs(400, 14),
				SnakeAdventureRunRulesTests.details(14, 400, SnakeRunRules.fastestGameMs(400, 14)));
		refused(player, 4, HALF_HOUR, SnakeRunRules.fastestGameMs(401, 15),
				SnakeAdventureRunRulesTests.details(15, 401, SnakeRunRules.fastestGameMs(401, 15)));
		// Stage 2's clear sent as a stage 3 clear: five apples short of its objective.
		Map<String, Integer> stage2 = SnakeAdventureRunRulesTests.cleared(2);
		refused(player, 3, HALF_HOUR, stage2.get("gameMs"), stage2);
		// More game time than the session lasted.
		Map<String, Integer> stage5 = SnakeAdventureRunRulesTests.cleared(5);
		refused(player, 5, Duration.ofSeconds(30), stage5.get("gameMs"), stage5);
		// A game time the moves cannot add up to, and a score that is not the game time.
		refused(player, 6, HALF_HOUR, 20_000, SnakeAdventureRunRulesTests.details(30, 425, 20_000));
		Map<String, Integer> stage6 = SnakeAdventureRunRulesTests.cleared(6);
		refused(player, 6, HALF_HOUR, 1_000, stage6);
		// Classic's details: no apples, moves or game time.
		refused(player, 1, HALF_HOUR, 25_920, SnakeMapsRunRulesTests.details(10));

		assertThat(adventureScores()).isZero();
		assertThat(coinTransactions(player)).isEqualTo(coinsBefore);
	}

	@Test
	void aGuestsClearIsKeptAndEarnsNothing() throws Exception {
		UUID guest = UUID.randomUUID();
		String response = this.mockMvc
			.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, guest)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"snake\",\"mode\":\"adventure-2\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		String run = JsonPath.read(response, "$.id");
		Map<String, Integer> clear = SnakeAdventureRunRulesTests.cleared(2);
		playedFor(run, Duration.ofMillis(clear.get("gameMs") + 2_000));

		this.mockMvc.perform(finishRequest(run, clear.get("gameMs"), clear).header(GuestPlayer.HEADER, guest))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("adventure-2"))
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		assertThat(adventureScores()).isEqualTo(1);
	}

	@Test
	void classicAndTheMapsAreRewardedAsBeforeAlongsideAdventure() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		clearStage(player, 1);

		String map = start(player, "map-pillars");
		playedFor(map, HALF_HOUR);
		finish(map, 40, SnakeMapsRunRulesTests.details(40), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5));

		// A first Classic run: completion and a new best, as always.
		String classic = start(player, null);
		playedFor(classic, HALF_HOUR);
		finish(classic, 12, SnakeMapsRunRulesTests.details(12), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.coinsEarned", greaterThanOrEqualTo(20)));
		this.mockMvc.perform(get("/api/leaderboards/snake?mode=map-pillars").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.myScore").value(40));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** Clears a stage with its real clear (`SnakeAdventureRunRulesTests.cleared`), in its game time and 2 s. */
	private ResultActions clearStage(MockHttpSession player, int stage) throws Exception {
		Map<String, Integer> clear = SnakeAdventureRunRulesTests.cleared(stage);
		String run = start(player, "adventure-" + stage);
		playedFor(run, Duration.ofMillis(clear.get("gameMs") + 2_000));
		return finish(run, clear.get("gameMs"), clear, player).andExpect(status().isOk());
	}

	private void refused(MockHttpSession player, int stage, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, "adventure-" + stage);
		playedFor(run, played);
		finish(run, score, details, player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	/** @param mode the mode to start in, or {@code null} for none (Classic) */
	private String start(MockHttpSession player, String mode) throws Exception {
		String body = (mode != null) ? "{\"gameSlug\":\"snake\",\"mode\":\"%s\"}".formatted(mode)
				: "{\"gameSlug\":\"snake\"}";
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

	private int adventureScores() {
		return this.jdbc.queryForObject(
				"SELECT count(*) FROM scores WHERE mode LIKE 'adventure-%' AND game_id = (SELECT id FROM games WHERE slug = 'snake')",
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
