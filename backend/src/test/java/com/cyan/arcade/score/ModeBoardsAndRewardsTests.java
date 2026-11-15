package com.cyan.arcade.score;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.security.GuestPlayer;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
 * Leaderboards, bests, profiles and rewards once a game has more than Classic. The one real mode,
 * Tetris Ultra, ranks highest first, so the test-only game of {@link ModeLab} is put in the catalog for these tests, with a ranked
 * time trial (lowest first) and an unranked practice mode besides Classic, and taken out afterwards.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ModeBoardsAndRewardsTests {

	static final String GAME = ModeLab.GAME;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Value("${app.rewards.rewarded-games-per-day}")
	private int gamesPaidPerDay;

	private long gameId;

	@BeforeAll
	void putTheTestGameInTheCatalog() {
		this.jdbc.update("""
				INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
				VALUES (?, 'Mode Lab', 'A game for tests only.', 'PUZZLE', '/thumbnails/mode-lab.svg', '#123456', 999, 1000)
				ON CONFLICT (slug) DO UPDATE SET active = TRUE
				""", GAME);
		this.gameId = this.jdbc.queryForObject("SELECT id FROM games WHERE slug = ?", Long.class, GAME);
	}

	@BeforeEach
	void startEveryTestWithEmptyBoards() {
		this.jdbc.update("DELETE FROM scores WHERE game_id = ?", this.gameId);
		this.jdbc.update("DELETE FROM game_sessions WHERE game_id = ?", this.gameId);
		this.jdbc.update("""
				DELETE FROM daily_challenge_completions
				WHERE daily_challenge_id IN (SELECT id FROM daily_challenges WHERE game_id = ?)
				""", this.gameId);
		this.jdbc.update("DELETE FROM daily_challenges WHERE game_id = ?", this.gameId);
	}

	/** Other tests share this database and expect the real catalog. */
	@AfterAll
	void takeTheTestGameOutOfTheCatalog() {
		startEveryTestWithEmptyBoards();
		this.jdbc.update("UPDATE games SET active = FALSE WHERE id = ?", this.gameId);
	}

	// --- Boards ---------------------------------------------------------------------------------------

	@Test
	void eachModeHasABoardOfItsOwnAndTheyNeverMix() throws Exception {
		MockHttpSession classicPlayer = Players.register(this.mockMvc);
		MockHttpSession trialPlayer = Players.register(this.mockMvc);
		play(classicPlayer, "classic", 500);
		play(trialPlayer, "trial", 30_000);
		play(trialPlayer, "practice", 900);

		board("", classicPlayer).andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.totalEntries").value(1))
			.andExpect(jsonPath("$.entries[*].score", contains(500)))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=trial", trialPlayer).andExpect(jsonPath("$.mode").value("trial"))
			.andExpect(jsonPath("$.totalEntries").value(1))
			.andExpect(jsonPath("$.entries[*].score", contains(30_000)))
			.andExpect(jsonPath("$.myRank").value(1));
		// Neither player stands on the other's board.
		board("", trialPlayer).andExpect(jsonPath("$.myRank").value(nullValue()));
		board("?mode=trial", classicPlayer).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void aBoardWithoutAModeIsClassicRankedHighestFirstByEachPlayersHighest() throws Exception {
		MockHttpSession first = Players.register(this.mockMvc);
		MockHttpSession second = Players.register(this.mockMvc);
		play(first, "classic", 100);
		play(first, "classic", 300);
		play(second, "classic", 200);

		board("", first).andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.order").value("DESC"))
			.andExpect(jsonPath("$.unit").value("POINTS"))
			.andExpect(jsonPath("$.entries[*].score", contains(300, 200)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2)))
			.andExpect(jsonPath("$.myScore").value(300));
	}

	@Test
	void aTimeTrialRanksLowestFirstByEachPlayersLowest() throws Exception {
		MockHttpSession quick = Players.register(this.mockMvc);
		MockHttpSession steady = Players.register(this.mockMvc);
		UUID guest = UUID.randomUUID();
		play(quick, "trial", 40_000);
		play(quick, "trial", 35_000);
		play(quick, "trial", 60_000);
		play(steady, "trial", 38_000);
		playAsGuest(guest, "trial", 50_000);

		board("?mode=trial", quick).andExpect(jsonPath("$.order").value("ASC"))
			.andExpect(jsonPath("$.unit").value("MILLISECONDS"))
			.andExpect(jsonPath("$.totalEntries").value(3))
			.andExpect(jsonPath("$.entries[*].score", contains(35_000, 38_000, 50_000)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2, 3)))
			.andExpect(jsonPath("$.entries[0].you").value(true))
			.andExpect(jsonPath("$.myRank").value(1))
			.andExpect(jsonPath("$.myScore").value(35_000));
		this.mockMvc.perform(get("/api/leaderboards/{game}?mode=trial", GAME).header(GuestPlayer.HEADER, guest))
			.andExpect(jsonPath("$.myRank").value(3))
			.andExpect(jsonPath("$.myScore").value(50_000));
	}

	@Test
	void equalTimesGoToWhoeverSetThemFirstAndPagesNeitherOverlapNorSkip() throws Exception {
		Instant start = Instant.now().minus(Duration.ofHours(1)).truncatedTo(ChronoUnit.MILLIS);
		String[] runs = new String[5];
		for (int i = 0; i < runs.length; i++) {
			runs[i] = playAsGuest(UUID.randomUUID(), "trial", (i == 4) ? 20_000 : 30_000);
		}
		// Set out of order, so only the timestamps can explain the result.
		recordedAt(runs[0], start.plusSeconds(30));
		recordedAt(runs[1], start.plusSeconds(10));
		recordedAt(runs[2], start.plusSeconds(40));
		recordedAt(runs[3], start.plusSeconds(20));
		recordedAt(runs[4], start.plusSeconds(50));

		List<String> order = List.of(runs[4], runs[1], runs[3], runs[0], runs[2]);
		List<String> seen = new ArrayList<>();
		for (int page = 0; page < 3; page++) {
			String body = board("?mode=trial&size=2&page=" + page, null).andExpect(jsonPath("$.totalPages").value(3))
				.andExpect(jsonPath("$.totalEntries").value(5))
				.andReturn()
				.getResponse()
				.getContentAsString();
			List<String> achievedAt = JsonPath.read(body, "$.entries[*].achievedAt");
			List<Integer> ranks = JsonPath.read(body, "$.entries[*].rank");
			assertThat(ranks).containsExactlyElementsOf(
					List.of(page * 2 + 1, page * 2 + 2).subList(0, (page < 2) ? 2 : 1));
			seen.addAll(achievedAt);
		}
		assertThat(seen).containsExactlyElementsOf(order.stream().map(this::recordedAtOf).toList());
	}

	@Test
	void aPeriodBoardOnlyCountsTimesSetInThePeriod() throws Exception {
		MockHttpSession earlier = Players.register(this.mockMvc);
		MockHttpSession today = Players.register(this.mockMvc);
		String old = playedRun(earlier, "trial", 20_000);
		recordedAt(old, Instant.now().minus(Duration.ofDays(2)));
		play(today, "trial", 40_000);

		board("?mode=trial&period=DAILY", earlier).andExpect(jsonPath("$.entries[*].score", contains(40_000)))
			.andExpect(jsonPath("$.myRank").value(nullValue()));
		board("?mode=trial&period=ALL_TIME", earlier).andExpect(jsonPath("$.entries[*].score", contains(20_000, 40_000)))
			.andExpect(jsonPath("$.myRank").value(1));
	}

	@ParameterizedTest
	@ValueSource(strings = { "practice", "ultra", "sprint" })
	void aModeWithoutABoardIsNotFound(String mode) throws Exception {
		this.mockMvc.perform(get("/api/leaderboards/{game}?mode={mode}", GAME, mode))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"))
			.andExpect(jsonPath("$.detail").value("Mode Lab has no leaderboard for mode '" + mode + "'"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "Trial", "time_trial", "1v1" })
	void aMalformedModeIsABadRequest(String mode) throws Exception {
		this.mockMvc.perform(get("/api/leaderboards/{game}?mode={mode}", GAME, mode))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
	}

	@Test
	void theTestGameOffersItsDeclaredModes() throws Exception {
		this.mockMvc.perform(get("/api/games/{game}/modes", GAME))
			.andExpect(jsonPath("$[*].id", contains("classic", "trial", "practice")))
			.andExpect(jsonPath("$[*].ranked", contains(true, true, false)))
			.andExpect(jsonPath("$[*].order", contains("DESC", "ASC", "DESC")));
	}

	// --- Profiles -------------------------------------------------------------------------------------

	@Test
	void profileStatisticsAndRanksCountClassicOnly() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		play(player, "trial", 30_000);
		play(player, "practice", 900);

		this.mockMvc.perform(get("/api/users/me/stats").session(player))
			.andExpect(jsonPath("$.gamesPlayed").value(0))
			.andExpect(jsonPath("$.totalScore").value(0))
			.andExpect(jsonPath("$.games", empty()));
		this.mockMvc.perform(get("/api/users/me/ranks").session(player))
			.andExpect(jsonPath("$.bestRank").value(nullValue()))
			.andExpect(jsonPath("$.games[?(@.game.slug == 'mode-lab')].allTime", contains(nullValue())));

		play(player, "classic", 120);

		this.mockMvc.perform(get("/api/users/me/stats").session(player))
			.andExpect(jsonPath("$.gamesPlayed").value(1))
			.andExpect(jsonPath("$.totalScore").value(120))
			.andExpect(jsonPath("$.games[*].bestScore", contains(120)));
		this.mockMvc.perform(get("/api/users/me/ranks").session(player))
			.andExpect(jsonPath("$.games[?(@.game.slug == 'mode-lab')].allTime.score", contains(120)));
		// The history still lists every run, with its mode.
		this.mockMvc.perform(get("/api/users/me/game-history").session(player))
			.andExpect(jsonPath("$.entries[*].mode", contains("classic", "practice", "trial")));
	}

	// --- Rewards --------------------------------------------------------------------------------------

	@Test
	void aBestInAnotherModeFollowsItsOrderButEarnsNoBonus() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, "trial", 40_000).andExpect(jsonPath("$.mode").value("trial"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		play(player, "trial", 45_000).andExpect(jsonPath("$.rewards.personalBest").value(false));
		play(player, "trial", 35_000).andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));

		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
		assertThat(storedBests(player)).containsExactly(true, false, true);
	}

	@Test
	void aClassicBestStillEarnsItsBonusAndIsNotSetByAnotherMode() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		play(player, "practice", 900);

		// 900 in practice is not a Classic best to beat: 50 is the first Classic best.
		play(player, "classic", 50).andExpect(jsonPath("$.rewards.personalBest").value(true));
		play(player, "classic", 40).andExpect(jsonPath("$.rewards.personalBest").value(false));

		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
	}

	@Test
	void runsOfOtherModesUnlockNoAchievementsAndDoNotCountAsGamesPlayed() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, "trial", 30_000).andExpect(jsonPath("$.rewards.achievements", empty()));
		play(player, "practice", 900).andExpect(jsonPath("$.rewards.achievements", empty()));
		assertThat(coinTransactions(player, "ACHIEVEMENT")).isZero();

		// The first Classic game is the player's first game, whatever came before.
		play(player, "classic", 10).andExpect(jsonPath("$.rewards.achievements[*].code", contains("FIRST_GAME")));
	}

	@Test
	void runsOfOtherModesCompleteNoDailyChallenge() throws Exception {
		this.jdbc.update("""
				INSERT INTO daily_challenges (challenge_date, game_id, title, description, goal, target, xp_reward,
				                              coin_reward, created_at)
				VALUES (?, ?, 'Lab day', 'Finish a game of Mode Lab.', 'PLAY', 1, 30, 60, now())
				""", LocalDate.now(ZoneOffset.UTC), this.gameId);
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, "trial", 30_000).andExpect(jsonPath("$.rewards.bonuses", empty()));
		play(player, "practice", 900).andExpect(jsonPath("$.rewards.bonuses", empty()));
		assertThat(coinTransactions(player, "DAILY_CHALLENGE")).isZero();

		play(player, "classic", 10).andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Lab day")));
		assertThat(coinTransactions(player, "DAILY_CHALLENGE")).isEqualTo(1);
	}

	@Test
	void everyModeEarnsTheCompletionRewardUnderTheSameDailyLimit() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// Each paid in coins, until the day's limit, counted over every mode together.
		for (int game = 0; game < this.gamesPaidPerDay; game++) {
			boolean trial = game % 2 == 0;
			// Practice keeps the catalog's limit (1,000); the trial has its own.
			play(player, trial ? "trial" : "practice", trial ? 30_000 + game : 100 + game)
				.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
				.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		}
		// Past it, no game pays completion coins, in any mode; the XP for finishing is still earned.
		play(player, "trial", 50_000).andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		play(player, "practice", 10).andExpect(jsonPath("$.rewards.coinsEarned").value(0));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(this.gamesPaidPerDay);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
	}

	// --- Helpers --------------------------------------------------------------------------------------

	private ResultActions board(String query, MockHttpSession player) throws Exception {
		MockHttpServletRequestBuilder request = get("/api/leaderboards/" + GAME + query);
		return this.mockMvc.perform((player != null) ? request.session(player) : request).andExpect(status().isOk());
	}

	/** Plays a validated run as a signed-in player; the result is the finish response. */
	private ResultActions play(MockHttpSession player, String mode, int score) throws Exception {
		String id = start(post("/api/game-sessions").session(player), mode);
		return finish(post("/api/game-sessions/{id}/finish", id).session(player), id, score);
	}

	/** @return the run's session id */
	private String playAsGuest(UUID guest, String mode, int score) throws Exception {
		String id = start(post("/api/game-sessions").header(GuestPlayer.HEADER, guest), mode);
		finish(post("/api/game-sessions/{id}/finish", id).header(GuestPlayer.HEADER, guest), id, score);
		return id;
	}

	private String start(MockHttpServletRequestBuilder request, String mode) throws Exception {
		String body = this.mockMvc
			.perform(request.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"%s\",\"mode\":\"%s\"}".formatted(GAME, mode)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value(mode))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String id = JsonPath.read(body, "$.id");
		HonestRuns.playFor(id);
		return id;
	}

	/** Plays a validated run as a signed-in player; the result is the run's session id. */
	private String playedRun(MockHttpSession player, String mode, int score) throws Exception {
		String id = start(post("/api/game-sessions").session(player), mode);
		finish(post("/api/game-sessions/{id}/finish", id).session(player), id, score);
		return id;
	}

	private ResultActions finish(MockHttpServletRequestBuilder request, String id, int score) throws Exception {
		return this.mockMvc.perform(request.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":{}}".formatted(score))).andExpect(status().isOk());
	}

	private void recordedAt(String sessionId, Instant at) {
		this.jdbc.update("UPDATE scores SET created_at = ? WHERE game_session_id = ?::uuid", Timestamp.from(at),
				sessionId);
	}

	private String recordedAtOf(String sessionId) {
		Timestamp at = this.jdbc.queryForObject("SELECT created_at FROM scores WHERE game_session_id = ?::uuid",
				Timestamp.class, sessionId);
		return at.toInstant().toString();
	}

	private List<Boolean> storedBests(MockHttpSession player) throws Exception {
		return this.jdbc.queryForList("SELECT personal_best FROM scores WHERE user_id = ? ORDER BY id", Boolean.class,
				Players.userId(this.mockMvc, player));
	}

	private int coinTransactions(MockHttpSession player, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, Players.userId(this.mockMvc, player), type);
	}

}
