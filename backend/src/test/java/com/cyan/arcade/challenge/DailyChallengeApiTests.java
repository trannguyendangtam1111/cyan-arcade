package com.cyan.arcade.challenge;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.platform.PlayerActivity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Daily challenges end to end: they are created, listed, completed by playing through the real
 * score flow, and rewarded once.
 *
 * <p>Nothing generates challenges in the test context, so each test sets up exactly the ones it
 * is about and the tables are emptied again afterwards.
 */
@IntegrationTest
class DailyChallengeApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private DailyChallengeStore store;

	@Autowired
	private DailyChallengeGenerator generator;

	@Autowired
	private Clock clock;

	private LocalDate today;

	@BeforeEach
	@AfterEach
	void clearChallenges() {
		this.jdbc.update("DELETE FROM daily_challenge_completions");
		this.jdbc.update("DELETE FROM daily_challenge_progress");
		this.jdbc.update("DELETE FROM daily_challenges");
		this.today = LocalDate.now(this.clock);
	}

	// --- Listing ---------------------------------------------------------------------------------

	@Test
	void anyoneCanSeeTodaysChallenges() throws Exception {
		given(this.today, "tetris", "Tidy Up", ChallengeGoal.DETAIL, "lines", 5, 30);

		this.mockMvc.perform(get("/api/daily-challenges"))
			.andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
			.andExpect(jsonPath("$.date").value(this.today.toString()))
			.andExpect(jsonPath("$.resetsAt").value(this.today.plusDays(1) + "T00:00:00Z"))
			.andExpect(jsonPath("$.challenges", hasSize(1)))
			.andExpect(jsonPath("$.challenges[0].id").isNumber())
			.andExpect(jsonPath("$.challenges[0].title").value("Tidy Up"))
			.andExpect(jsonPath("$.challenges[0].description").value("Tidy Up in tetris"))
			.andExpect(jsonPath("$.challenges[0].game.slug").value("tetris"))
			.andExpect(jsonPath("$.challenges[0].game.name").value("Tetris"))
			.andExpect(jsonPath("$.challenges[0].target").value(5))
			.andExpect(jsonPath("$.challenges[0].xpReward").value(30))
			.andExpect(jsonPath("$.challenges[0].coinReward").value(60))
			.andExpect(jsonPath("$.challenges[0].date").value(this.today.toString()))
			// Nobody's progress is part of the public list, and neither is how a challenge is checked.
			.andExpect(jsonPath("$.challenges[0].completed").doesNotExist())
			.andExpect(jsonPath("$.challenges[0].goal").doesNotExist())
			.andExpect(jsonPath("$.challenges[0].detail").doesNotExist());
	}

	@Test
	void onlyTodaysChallengesAreListed() throws Exception {
		given(this.today.minusDays(1), "snake", "Yesterday", ChallengeGoal.PLAY, null, 1, 20);
		given(this.today, "snake", "Today", ChallengeGoal.PLAY, null, 1, 20);
		given(this.today.plusDays(1), "snake", "Tomorrow", ChallengeGoal.PLAY, null, 1, 20);

		this.mockMvc.perform(get("/api/daily-challenges"))
			.andExpect(jsonPath("$.challenges[*].title", contains("Today")));
	}

	@Test
	void aDayWithoutChallengesIsAnEmptyListNotAnError() throws Exception {
		this.mockMvc.perform(get("/api/daily-challenges"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(this.today.toString()))
			.andExpect(jsonPath("$.challenges").isEmpty());
	}

	@Test
	void aPlayersProgressNeedsASignedInSession() throws Exception {
		this.mockMvc.perform(get("/api/daily-challenges/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
	}

	@Test
	void aPlayerStartsTheDayWithNothingCompleted() throws Exception {
		given(this.today, "tetris", "Tidy Up", ChallengeGoal.DETAIL, "lines", 5, 30);
		MockHttpSession session = Players.register(this.mockMvc);

		mine(session).andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(this.today.toString()))
			.andExpect(jsonPath("$.resetsAt").value(this.today.plusDays(1) + "T00:00:00Z"))
			.andExpect(jsonPath("$.completedCount").value(0))
			.andExpect(jsonPath("$.challenges[0].title").value("Tidy Up"))
			.andExpect(jsonPath("$.challenges[0].game.slug").value("tetris"))
			.andExpect(jsonPath("$.challenges[0].target").value(5))
			.andExpect(jsonPath("$.challenges[0].xpReward").value(30))
			.andExpect(jsonPath("$.challenges[0].completed").value(false))
			.andExpect(jsonPath("$.challenges[0].completedAt").value(nullValue()));
	}

	// --- Completing ------------------------------------------------------------------------------

	@Test
	void aRunThatReachesTheTargetCompletesTheChallengeAndEarnsItsReward() throws Exception {
		given(this.today, "tetris", "Tidy Up", ChallengeGoal.DETAIL, "lines", 5, 30);
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "tetris", 300, Map.of("lines", 6))
			.andExpect(jsonPath("$.rewards.bonuses", hasSize(1)))
			.andExpect(jsonPath("$.rewards.bonuses[0].type").value("DAILY_CHALLENGE"))
			.andExpect(jsonPath("$.rewards.bonuses[0].title").value("Tidy Up"))
			.andExpect(jsonPath("$.rewards.bonuses[0].xp").value(30))
			.andExpect(jsonPath("$.rewards.bonuses[0].coins").value(60))
			// What is rewarded stays on the server.
			.andExpect(jsonPath("$.rewards.bonuses[0].reference").doesNotExist())
			// 10 for finishing + 25 for a best + 50 for "First Coin" + 30 for the challenge.
			.andExpect(jsonPath("$.rewards.xpEarned").value(115))
			// 5 for finishing + 15 for a best + 100 for "First Coin" + 60 for the challenge.
			.andExpect(jsonPath("$.rewards.coinsEarned").value(180))
			.andExpect(jsonPath("$.rewards.coinBalance").value(180))
			.andExpect(jsonPath("$.rewards.totalXp").value(115))
			.andExpect(jsonPath("$.rewards.level").value(2))
			.andExpect(jsonPath("$.rewards.leveledUp").value(true));

		mine(session).andExpect(jsonPath("$.completedCount").value(1))
			.andExpect(jsonPath("$.challenges[0].completed").value(true))
			.andExpect(jsonPath("$.challenges[0].completedAt").isNotEmpty());
		// The reward is part of the player's XP and of what the run earned in their history.
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(jsonPath("$.xp").value(115));
		this.mockMvc.perform(get("/api/users/me/game-history").session(session))
			.andExpect(jsonPath("$.entries[0].xpEarned").value(115));
	}

	@Test
	void aRunThatFallsShortCompletesNothing() throws Exception {
		given(this.today, "tetris", "Tidy Up", ChallengeGoal.DETAIL, "lines", 5, 30);
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "tetris", 300, Map.of("lines", 4))
			.andExpect(jsonPath("$.rewards.bonuses").isEmpty())
			.andExpect(jsonPath("$.rewards.xpEarned").value(85));

		mine(session).andExpect(jsonPath("$.completedCount").value(0))
			.andExpect(jsonPath("$.challenges[0].completed").value(false));
	}

	@Test
	void aChallengeIsRewardedOnlyOnce() throws Exception {
		given(this.today, "tetris", "Tidy Up", ChallengeGoal.DETAIL, "lines", 5, 30);
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "tetris", 300, Map.of("lines", 6));

		// Reaching the target again the same day: just the 10 XP for finishing a game.
		Players.play(this.mockMvc, session, "tetris", 200, Map.of("lines", 9))
			.andExpect(jsonPath("$.rewards.bonuses").isEmpty())
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));

		mine(session).andExpect(jsonPath("$.completedCount").value(1));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions", Integer.class))
			.isEqualTo(1);
	}

	@Test
	void aScoreChallengeIsCompletedByReachingTheScore() throws Exception {
		given(this.today, "snake", "Snack Time", ChallengeGoal.SCORE, null, 10, 35);
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "snake", 9).andExpect(jsonPath("$.rewards.bonuses").isEmpty());
		Players.play(this.mockMvc, session, "snake", 10)
			.andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Snack Time")));
	}

	@Test
	void aPlayChallengeIsCompletedByFinishingAnyGameOfIt() throws Exception {
		given(this.today, "2048", "Warm-up Round", ChallengeGoal.PLAY, null, 1, 20);
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "2048", 0)
			.andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Warm-up Round")))
			.andExpect(jsonPath("$.rewards.bonuses[0].xp").value(20));
	}

	@Test
	void aChallengeCanOnlyBeCompletedInItsOwnGame() throws Exception {
		given(this.today, "tetris", "Tidy Up", ChallengeGoal.DETAIL, "lines", 5, 30);
		given(this.today, "snake", "Warm-up Round", ChallengeGoal.PLAY, null, 1, 20);
		MockHttpSession session = Players.register(this.mockMvc);

		// A game of 2048 that claims to have cleared lines completes neither.
		Players.play(this.mockMvc, session, "2048", 500, Map.of("lines", 50))
			.andExpect(jsonPath("$.rewards.bonuses").isEmpty());
		// A game of Snake completes Snake's challenge and leaves Tetris's alone.
		Players.play(this.mockMvc, session, "snake", 3, Map.of("lines", 50))
			.andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Warm-up Round")));

		mine(session).andExpect(jsonPath("$.completedCount").value(1))
			.andExpect(jsonPath("$.challenges[?(@.game.slug == 'tetris')].completed", contains(false)))
			.andExpect(jsonPath("$.challenges[?(@.game.slug == 'snake')].completed", contains(true)));
	}

	@Test
	void everyPlayerHasTheirOwnProgress() throws Exception {
		given(this.today, "snake", "Warm-up Round", ChallengeGoal.PLAY, null, 1, 20);
		MockHttpSession first = Players.register(this.mockMvc);
		MockHttpSession second = Players.register(this.mockMvc);
		Players.play(this.mockMvc, first, "snake", 1);

		mine(first).andExpect(jsonPath("$.challenges[0].completed").value(true));
		mine(second).andExpect(jsonPath("$.completedCount").value(0))
			.andExpect(jsonPath("$.challenges[0].completed").value(false));
		// And the second player can still earn it.
		Players.play(this.mockMvc, second, "snake", 1)
			.andExpect(jsonPath("$.rewards.bonuses[*].title", contains("Warm-up Round")));
	}

	@Test
	void guestsCompleteNothing() throws Exception {
		given(this.today, "snake", "Warm-up Round", ChallengeGoal.PLAY, null, 1, 20);

		Players.play(this.mockMvc, null, "snake", 5).andExpect(jsonPath("$.rewards").value(nullValue()));

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions", Integer.class))
			.isZero();
	}

	@Test
	void onlyTodaysChallengeCanBeCompleted() throws Exception {
		given(this.today.minusDays(1), "snake", "Yesterday", ChallengeGoal.PLAY, null, 1, 20);
		given(this.today.plusDays(1), "snake", "Tomorrow", ChallengeGoal.PLAY, null, 1, 20);
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "snake", 5).andExpect(jsonPath("$.rewards.bonuses").isEmpty());
	}

	// --- Generating ------------------------------------------------------------------------------

	@Test
	void generatingADayGivesEveryGameAndEveryActivityOneChallengeAndIsSafeToRepeat() {
		LocalDate day = LocalDate.of(2031, 3, 14);
		int activeGames = this.jdbc.queryForObject("SELECT count(*) FROM games WHERE active", Integer.class);
		int activities = new ChallengeTemplates().activities().size();

		assertThat(this.generator.generateFor(day)).isEqualTo(activeGames + activities);
		List<DailyChallenge> generated = this.store.findByDate(day);
		assertThat(this.generator.generateFor(day)).isZero();

		assertThat(this.store.findByDate(day)).isEqualTo(generated);
		assertThat(generated).hasSize(activeGames + activities);
		assertThat(generated).filteredOn(DailyChallenge::isAboutAGame)
			.hasSize(activeGames)
			.extracting(DailyChallenge::gameId)
			.doesNotHaveDuplicates();
		assertThat(generated).filteredOn((challenge) -> !challenge.isAboutAGame())
			.extracting(DailyChallenge::activity, DailyChallenge::goal)
			.containsExactly(tuple(PlayerActivity.TCG_PACK_OPENED, ChallengeGoal.COUNT));
		assertThat(generated).allSatisfy((challenge) -> {
			assertThat(challenge.date()).isEqualTo(day);
			assertThat(challenge.title()).isNotBlank();
			assertThat(challenge.description()).isNotBlank().doesNotContain("%s");
			assertThat(challenge.xpReward()).isPositive();
			assertThat(challenge.coinReward()).isPositive();
		});
	}

	@Test
	void everyGameGetsADifferentChallengeTheNextDay() {
		LocalDate day = LocalDate.of(2031, 3, 14);
		this.generator.generateFor(day);
		this.generator.generateFor(day.plusDays(1));

		List<DailyChallenge> first = this.store.findByDate(day);
		List<DailyChallenge> second = this.store.findByDate(day.plusDays(1));

		assertThat(second).hasSameSizeAs(first);
		for (DailyChallenge challenge : first) {
			DailyChallenge next = second.stream()
				.filter((candidate) -> Objects.equals(candidate.gameId(), challenge.gameId())
						&& Objects.equals(candidate.activity(), challenge.activity()))
				.findFirst()
				.orElseThrow();
			assertThat(next.title()).isNotEqualTo(challenge.title());
		}
	}

	@Test
	void generatedChallengesAreServedByTheApi() throws Exception {
		this.generator.generateFor(this.today);

		this.mockMvc.perform(get("/api/daily-challenges"))
			.andExpect(jsonPath("$.challenges", hasSize(4)))
			.andExpect(jsonPath("$.challenges[0:3].game.slug", contains("snake", "2048", "tetris")))
			.andExpect(jsonPath("$.challenges[3].game").value(nullValue()))
			.andExpect(jsonPath("$.challenges[3].activity.code").value("TCG_PACK_OPENED"))
			.andExpect(jsonPath("$.challenges[3].activity.name").value("Card packs"));
	}

	@Test
	void theScheduledJobPreparesTodayAndTomorrow() {
		Clock someMorning = Clock.fixed(Instant.parse("2031-05-05T09:30:00Z"), ZoneOffset.UTC);
		DailyChallengeScheduler scheduler = new DailyChallengeScheduler(this.generator, someMorning);

		scheduler.atMidnight();
		// Startup does the same, and finds nothing left to do.
		scheduler.onStartup();

		assertThat(this.store.findByDate(LocalDate.of(2031, 5, 5))).isNotEmpty();
		assertThat(this.store.findByDate(LocalDate.of(2031, 5, 6))).hasSameSizeAs(
				this.store.findByDate(LocalDate.of(2031, 5, 5)));
		assertThat(this.store.findByDate(LocalDate.of(2031, 5, 7))).isEmpty();
	}

	/** Gives a game a known challenge on a day. */
	private void given(LocalDate date, String gameSlug, String title, ChallengeGoal goal, String detail, int target,
			int xpReward) {
		Long gameId = this.jdbc.queryForObject("SELECT id FROM games WHERE slug = ?", Long.class, gameSlug);
		// Coins are twice the XP, as in the arcade's own templates.
		ChallengeTemplate template = new ChallengeTemplate(title, "", goal, detail, target, xpReward, xpReward * 2);
		assertThat(this.store.insertIfAbsent(date, gameId, template, title + " in " + gameSlug, this.clock.instant()))
			.isTrue();
	}

	private ResultActions mine(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/daily-challenges/me").session(session));
	}

}
