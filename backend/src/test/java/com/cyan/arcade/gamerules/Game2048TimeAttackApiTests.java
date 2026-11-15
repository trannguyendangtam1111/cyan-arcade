package com.cyan.arcade.gamerules;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
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
 * 2048 Time Attack on the platform: started by name, judged by its clock against the session's real
 * time and by Classic's checks, ranked on a board of its own, and paid what finishing a game earns only
 * for a run whose time ran out. A run stuck earlier is saved and ranked, with no completion reward.
 */
@IntegrationTest
class Game2048TimeAttackApiTests {

	private static final String TIME_ATTACK = "time-attack";

	/** Two minutes of game time, with a few seconds of pauses and requests on top. */
	private static final Duration PLAYED = Duration.ofSeconds(125);

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

	/** The Time Attack board, and any 2048 challenge, are this class's alone: every test starts without them. */
	@BeforeEach
	void emptyTheTimeAttackBoard() {
		this.jdbc.update("DELETE FROM scores WHERE mode = 'time-attack' AND game_id = " + GAME_2048);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode = 'time-attack' AND game_id = " + GAME_2048);
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
	void twentyFortyEightOffersTimeAttackRankedHighestFirst() throws Exception {
		this.mockMvc.perform(get("/api/games/2048/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].id", contains("classic", "moves", "time-attack", "puzzle-1", "puzzle-2", "puzzle-3", "puzzle-4", "puzzle-5", "puzzle-6")))
			.andExpect(jsonPath("$[2].name").value("Time Attack"))
			.andExpect(jsonPath("$[2].ranked").value(true))
			.andExpect(jsonPath("$[2].order").value("DESC"))
			.andExpect(jsonPath("$[2].unit").value("POINTS"))
			// Its limits stay on the server.
			.andExpect(jsonPath("$[2].maxScore").doesNotExist());
	}

	@Test
	void aRunWhoseTimeRanOutIsRankedAndEarnsTheCompletionRewardOnly() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, TIME_ATTACK, 6000, Game2048TimeAttackRunRulesTests.timeUp()).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("time-attack"))
			.andExpect(jsonPath("$.score").value(6000))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			// What finishing a game earns, and nothing that is Classic's alone (bonus, achievements, challenges).
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
		board("?mode=time-attack", player).andExpect(jsonPath("$.myScore").value(6000))
			.andExpect(jsonPath("$.myRank").value(1));
	}

	@Test
	void aRunStuckBeforeTheTimeIsUpIsSavedAndRankedButEarnsNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, TIME_ATTACK, 600, Game2048TimeAttackRunRulesTests.stuck(), Duration.ofSeconds(50))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("time-attack"))
			.andExpect(jsonPath("$.score").value(600))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
		assertThat(scoresIn(TIME_ATTACK)).isEqualTo(1);
		board("?mode=time-attack", player).andExpect(jsonPath("$.myScore").value(600));
	}

	@Test
	void theTimeAttackBoardRanksHighestFirstAndHoldsTimeAttackRunsOnly() throws Exception {
		MockHttpSession high = Players.register(this.mockMvc);
		MockHttpSession low = Players.register(this.mockMvc);
		play(high, TIME_ATTACK, 5000, Game2048TimeAttackRunRulesTests.timeUp()).andExpect(status().isOk());
		play(high, TIME_ATTACK, 6400, Game2048TimeAttackRunRulesTests.timeUp()).andExpect(status().isOk());
		play(low, TIME_ATTACK, 5600, Game2048TimeAttackRunRulesTests.timeUp()).andExpect(status().isOk());
		// A Classic run and a Moves Limit run above all of them stay on their own boards.
		play(low, null, 20_480, Game2048MovesRunRulesTests.details(2048, 1200)).andExpect(status().isOk());
		play(low, "moves", 7000, Game2048MovesRunRulesTests.details(512, 300), Duration.ofMinutes(5))
			.andExpect(status().isOk());

		board("?mode=time-attack", high).andExpect(jsonPath("$.mode").value("time-attack"))
			.andExpect(jsonPath("$.order").value("DESC"))
			.andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.entries[*].score", contains(6400, 5600)))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=time-attack", low).andExpect(jsonPath("$.myScore").value(5600));
		board("", low).andExpect(jsonPath("$.mode").value("classic")).andExpect(jsonPath("$.myScore").value(20_480));
		board("?mode=moves", low).andExpect(jsonPath("$.myScore").value(7000));
		board("", high).andExpect(jsonPath("$.myRank").value(nullValue()));
		board("?mode=moves", high).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void theTimeIsUpAtExactlyTwoMinutesOfGameTime() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, TIME_ATTACK, 6000, Game2048TimeAttackRunRulesTests.details(512, 400, 120_000, 1))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5));
		// The last step before the limit is a stuck run, which completes nothing.
		play(player, TIME_ATTACK, 6000, Game2048TimeAttackRunRulesTests.details(512, 400, 119_990, 0))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0));
		// Past the limit, or the limit without the time up, or the time up before the limit.
		refused(player, PLAYED, 6000, Game2048TimeAttackRunRulesTests.details(512, 400, 120_010, 1));
		refused(player, PLAYED, 6000, Game2048TimeAttackRunRulesTests.details(512, 400, 120_000, 0));
		refused(player, PLAYED, 6000, Game2048TimeAttackRunRulesTests.details(512, 400, 119_990, 1));

		assertThat(scoresIn(TIME_ATTACK)).isEqualTo(2);
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
	}

	@Test
	void impossibleTimeAttackRunsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// Game time that is no game time, out of step, or a timeUp that is not 0 or 1.
		refused(player, PLAYED, 600, Game2048TimeAttackRunRulesTests.details(64, 120, 0, 0));
		refused(player, PLAYED, 600, Game2048TimeAttackRunRulesTests.details(64, 120, 45_005, 0));
		refused(player, PLAYED, 6000, Game2048TimeAttackRunRulesTests.details(512, 400, 120_000, 2));
		// Two minutes of game time in a one-minute session.
		refused(player, Duration.ofSeconds(60), 6000, Game2048TimeAttackRunRulesTests.timeUp());
		// Paused far beyond the minute allowed: two minutes of game time over three and a half minutes.
		refused(player, Duration.ofSeconds(210), 6000, Game2048TimeAttackRunRulesTests.timeUp());
		// Faster than 15 moves a second of game time.
		refused(player, PLAYED, 10_000, Game2048TimeAttackRunRulesTests.details(1024, 1831, 120_000, 1));
		refused(player, Duration.ofSeconds(12), 600, Game2048TimeAttackRunRulesTests.details(64, 200, 10_000, 0));
		// Classic's checks: a tile and a score the moves cannot make, and a score that is not a 2048 one.
		refused(player, PLAYED, 20_480, Game2048TimeAttackRunRulesTests.details(2048, 400, 120_000, 1));
		refused(player, PLAYED, 6002, Game2048TimeAttackRunRulesTests.timeUp());
		// Too few moves for a stuck board, and above the mode's highest score.
		refused(player, PLAYED, 0, Game2048TimeAttackRunRulesTests.details(4, 10, 30_000, 0));
		refused(player, PLAYED, 80_612, Game2048TimeAttackRunRulesTests.details(4096, 1830, 120_000, 1));
		// Without its game time: a Classic run's details.
		refused(player, PLAYED, 6000, Game2048MovesRunRulesTests.details(512, 400));

		assertThat(scoresIn(TIME_ATTACK)).isZero();
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
	}

	@Test
	void timeUpRunsShareTheDailyLimitOfPaidGamesWithEveryOtherMode() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		for (int game = 0; game < this.gamesPaidPerDay; game++) {
			play(player, TIME_ATTACK, 5000 + 4 * game, Game2048TimeAttackRunRulesTests.timeUp())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
				.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		}
		// Past it, no run pays completion coins; the XP for finishing is still earned.
		play(player, TIME_ATTACK, 5000, Game2048TimeAttackRunRulesTests.timeUp()).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		// Nor does a Moves Limit one: the limit counts every mode together.
		play(player, "moves", 4500, Game2048MovesRunRulesTests.fullRun(), Duration.ofMinutes(5))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(this.gamesPaidPerDay);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
	}

	@Test
	void aTimeAttackRunIsNotTheFirstGameForTheAchievementNorCompletesAChallenge() throws Exception {
		this.jdbc.update("""
				INSERT INTO daily_challenges (challenge_date, game_id, title, description, goal, detail, target, xp_reward,
				                              coin_reward, created_at)
				VALUES (?, (SELECT id FROM games WHERE slug = '2048'), 'Warm-up Round', 'Finish a game.', 'PLAY',
				        NULL, 1, 20, 40, now())
				""", this.today);
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, TIME_ATTACK, 6000, Game2048TimeAttackRunRulesTests.timeUp()).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));
		assertThat(challengeCompletions(player)).isZero();

		// Classic is rewarded as before: completion, a first best, the first-game achievement and the challenge.
		play(player, null, 600, Game2048MovesRunRulesTests.details(64, 120)).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")))
			.andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Warm-up Round")));
		assertThat(challengeCompletions(player)).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
		// A Classic run never needs a game time, as before.
		Map<String, Integer> classic = new HashMap<>(Game2048MovesRunRulesTests.details(2048, 1200));
		play(player, null, 20_480, classic).andExpect(status().isOk());
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** A run of this score, played for {@link #PLAYED} in Time Attack, five minutes in Moves Limit, an hour in Classic. */
	private ResultActions play(MockHttpSession player, String mode, int score, Map<String, Integer> details)
			throws Exception {
		return play(player, mode, score, details, (mode == null) ? Duration.ofHours(1) : PLAYED);
	}

	private ResultActions play(MockHttpSession player, String mode, int score, Map<String, Integer> details,
			Duration played) throws Exception {
		String run = start(player, mode);
		playedFor(run, played);
		return finish(run, score, details, player);
	}

	private void refused(MockHttpSession player, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, TIME_ATTACK);
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
