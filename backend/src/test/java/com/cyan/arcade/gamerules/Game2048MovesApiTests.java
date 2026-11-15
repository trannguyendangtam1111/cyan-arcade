package com.cyan.arcade.gamerules;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 2048 Moves Limit on the platform: started by name, judged by its own limit and Classic's checks,
 * ranked on a board of its own, and paid what finishing a game earns only for a run that used all 300
 * moves. A run stuck earlier is saved and ranked, with no completion reward.
 */
@IntegrationTest
class Game2048MovesApiTests {

	private static final String MOVES = "moves";

	private static final Duration FIVE_MINUTES = Duration.ofMinutes(5);

	private static final String GAME_2048 = "(SELECT id FROM games WHERE slug = '2048')";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private Clock clock;

	@Value("${app.rewards.rewarded-games-per-day}")
	private int gamesPaidPerDay;

	private LocalDate today;

	/** The Moves Limit board, and any 2048 challenge, are this class's alone: every test starts without them. */
	@BeforeEach
	void emptyTheMovesBoard() {
		this.jdbc.update("DELETE FROM scores WHERE mode = 'moves' AND game_id = " + GAME_2048);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode = 'moves' AND game_id = " + GAME_2048);
		this.today = LocalDate.ofInstant(this.clock.instant(), ZoneOffset.UTC);
		clearChallenge();
	}

	@AfterEach
	void clearChallenge() {
		String ids = "SELECT id FROM daily_challenges WHERE challenge_date = ? AND game_id = " + GAME_2048;
		this.jdbc.update("DELETE FROM daily_challenge_completions WHERE daily_challenge_id IN (" + ids + ")", this.today);
		this.jdbc.update("DELETE FROM daily_challenge_progress WHERE daily_challenge_id IN (" + ids + ")", this.today);
		this.jdbc.update("DELETE FROM daily_challenges WHERE challenge_date = ? AND game_id = " + GAME_2048, this.today);
	}

	@Test
	void twentyFortyEightOffersClassicThenMovesLimit() throws Exception {
		this.mockMvc.perform(get("/api/games/2048/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].id", contains("classic", "moves", "time-attack", "puzzle-1", "puzzle-2", "puzzle-3", "puzzle-4", "puzzle-5", "puzzle-6")))
			.andExpect(jsonPath("$[1].name").value("Moves Limit"))
			.andExpect(jsonPath("$[1].ranked").value(true))
			.andExpect(jsonPath("$[1].order").value("DESC"))
			.andExpect(jsonPath("$[1].unit").value("POINTS"))
			// Its limits stay on the server.
			.andExpect(jsonPath("$[1].maxScore").doesNotExist());
	}

	@Test
	void aRunOfAModeThatIsNotDeclaredIsNeverStarted() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		this.mockMvc.perform(post("/api/game-sessions").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"2048\",\"mode\":\"puzzle-7\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"));
		this.mockMvc.perform(get("/api/leaderboards/2048?mode=puzzle-7").session(player))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"));
	}

	@Test
	void aFullRunIsRankedAndEarnsTheCompletionRewardOnly() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, MOVES, 4500, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("moves"))
			.andExpect(jsonPath("$.score").value(4500))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			// What finishing a game earns, and nothing that is Classic's alone (bonus, achievements, challenges).
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
		board("?mode=moves", player).andExpect(jsonPath("$.myScore").value(4500)).andExpect(jsonPath("$.myRank").value(1));
	}

	@Test
	void aRunStuckBeforeTheLimitIsSavedAndRankedButEarnsNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, MOVES, 600, Game2048MovesRunRulesTests.stuck()).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("moves"))
			.andExpect(jsonPath("$.score").value(600))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
		assertThat(scoresIn(MOVES)).isEqualTo(1);
		board("?mode=moves", player).andExpect(jsonPath("$.myScore").value(600));
	}

	@Test
	void theMovesBoardRanksHighestFirstAndHoldsMovesLimitRunsOnly() throws Exception {
		MockHttpSession high = Players.register(this.mockMvc);
		MockHttpSession low = Players.register(this.mockMvc);
		play(high, MOVES, 4000, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk());
		play(high, MOVES, 4800, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk());
		play(low, MOVES, 4400, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk());
		// A Classic run far above any of them stays on the Classic board.
		play(low, null, 20_480, Game2048MovesRunRulesTests.details(2048, 1200)).andExpect(status().isOk());

		board("?mode=moves", high).andExpect(jsonPath("$.mode").value("moves"))
			.andExpect(jsonPath("$.order").value("DESC"))
			.andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.entries[*].score", contains(4800, 4400)))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=moves", low).andExpect(jsonPath("$.myScore").value(4400));
		board("", low).andExpect(jsonPath("$.mode").value("classic")).andExpect(jsonPath("$.myScore").value(20_480));
		board("", high).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void impossibleMovesLimitRunsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// Past the limit, a Classic run's length, and too few moves for a run to have ended.
		refused(player, FIVE_MINUTES, 4500, Game2048MovesRunRulesTests.details(256, 301));
		refused(player, Duration.ofHours(1), 20_480, Game2048MovesRunRulesTests.details(2048, 1200));
		refused(player, FIVE_MINUTES, 0, Game2048MovesRunRulesTests.details(4, 5));
		// A tile and a score 300 moves cannot make, and a score that is not a 2048 one.
		refused(player, FIVE_MINUTES, 20_480, Game2048MovesRunRulesTests.details(2048, 300));
		refused(player, FIVE_MINUTES, 10_000, Game2048MovesRunRulesTests.fullRun());
		refused(player, FIVE_MINUTES, 4502, Game2048MovesRunRulesTests.fullRun());
		refused(player, FIVE_MINUTES, 4500, Game2048MovesRunRulesTests.details(300, 300));
		// Above the mode's highest score.
		refused(player, FIVE_MINUTES, 10_876, Game2048MovesRunRulesTests.details(1024, 300));
		// 300 moves in five seconds.
		refused(player, Duration.ofSeconds(5), 4500, Game2048MovesRunRulesTests.fullRun());
		// Without its details.
		refused(player, FIVE_MINUTES, 4500, Map.of("highestTile", 256));

		assertThat(scoresIn(MOVES)).isZero();
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
	}

	@Test
	void fullRunsShareTheDailyLimitOfPaidGamesWithEveryOtherMode() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		for (int game = 0; game < this.gamesPaidPerDay; game++) {
			play(player, MOVES, 4000 + 4 * game, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk())
				.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
				.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		}
		// Past it, no full run pays completion coins; the XP for finishing is still earned.
		play(player, MOVES, 4000, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		// Nor does a Classic one: the limit counts every mode together. Its first best still pays.
		play(player, null, 600, Game2048MovesRunRulesTests.details(64, 120)).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.personalBest").value(true));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(this.gamesPaidPerDay);
		// The one best-score bonus is that Classic run's; none of the Moves Limit bests paid one.
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
	}

	@Test
	void aClassicRunIsRewardedAsBefore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// The first game ever: completion, a first best and the first-game achievement, as always.
		play(player, null, 600, Game2048MovesRunRulesTests.details(64, 120)).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
		// Classic's own checks are unchanged: past 300 moves, and stuck after very few, both still count.
		play(player, null, 20_480, Game2048MovesRunRulesTests.details(2048, 1200)).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("REACH_2048")));
		play(player, null, 0, Game2048MovesRunRulesTests.details(4, 1)).andExpect(status().isOk());
		board("?mode=moves", player).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void aMovesLimitRunIsNotTheFirstGameForTheAchievementNorCompletesAChallenge() throws Exception {
		this.jdbc.update("""
				INSERT INTO daily_challenges (challenge_date, game_id, title, description, goal, detail, target, xp_reward,
				                              coin_reward, created_at)
				VALUES (?, (SELECT id FROM games WHERE slug = '2048'), 'Warm-up Round', 'Finish a game.', 'PLAY',
				        NULL, 1, 20, 40, now())
				""", this.today);
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, MOVES, 4500, Game2048MovesRunRulesTests.fullRun()).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));
		assertThat(challengeCompletions(player)).isZero();

		play(player, null, 600, Game2048MovesRunRulesTests.details(64, 120)).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")))
			.andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Warm-up Round")));
		assertThat(challengeCompletions(player)).isEqualTo(1);
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** A run of this score played for five minutes in the mode ({@code null}: none, Classic). */
	private ResultActions play(MockHttpSession player, String mode, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, mode);
		playedFor(run, (mode == null) ? Duration.ofHours(1) : FIVE_MINUTES);
		return finish(run, score, details, player);
	}

	private void refused(MockHttpSession player, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, MOVES);
		playedFor(run, played);
		finish(run, score, details, player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

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
		return com.jayway.jsonpath.JsonPath.read(response, "$.id");
	}

	private ResultActions finish(String run, int score, Map<String, Integer> details, MockHttpSession player)
			throws Exception {
		return this.mockMvc.perform(post("/api/game-sessions/{id}/finish", run).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details))));
	}

	/** Moves the run's start back by exactly this long. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update(
				"UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toMillis() / 1000.0, run);
	}

	private ResultActions board(String query, MockHttpSession player) throws Exception {
		return this.mockMvc.perform(get("/api/leaderboards/2048" + query).session(player)).andExpect(status().isOk());
	}

	private int scoresIn(String mode) {
		return this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE mode = ? AND game_id = " + GAME_2048,
				Integer.class, mode);
	}

	private int coinTransactions(MockHttpSession player, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, Players.userId(this.mockMvc, player), type);
	}

	private int challengeCompletions(MockHttpSession player) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions WHERE user_id = ?",
				Integer.class, Players.userId(this.mockMvc, player));
	}

}
