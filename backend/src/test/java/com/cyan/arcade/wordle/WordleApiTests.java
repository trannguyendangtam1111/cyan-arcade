package com.cyan.arcade.wordle;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.wordle.daily.DailySchedule;
import com.cyan.arcade.wordle.dictionary.Dictionary;
import com.cyan.arcade.wordle.engine.Scoring;
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
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Word Guess through the API, as the browser plays it: a platform game session, a daily run tied to
 * it, guesses and hints judged by the server, and the score submitted through the platform, where
 * {@link WordleRunRules} holds it against the run the server recorded.
 */
@IntegrationTest
class WordleApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private DailySchedule schedule;

	@Autowired
	private Dictionary dictionary;

	@Autowired
	private Clock clock;

	private LocalDate today;

	private String target;

	/** Possible answers that are not today's word, for wrong guesses. */
	private List<String> wrong;

	@BeforeEach
	void todaysPuzzle() {
		this.today = DailySchedule.today(this.clock);
		this.target = this.schedule.answerFor(this.today);
		this.wrong = this.dictionary.answers().stream().filter((word) -> !word.equals(this.target)).limit(7).toList();
	}

	// --- The puzzle ------------------------------------------------------------------------------------

	@Test
	void wordGuessIsInTheCatalog() throws Exception {
		this.mockMvc.perform(get("/api/games/wordle"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Word Guess"))
			.andExpect(jsonPath("$.category").value("PUZZLE"));
	}

	@Test
	void everyoneGetsTheSameDailyPuzzleAndNoneSeesTheWordBeforeTheEnd() throws Exception {
		String asGuest = this.mockMvc.perform(get("/api/wordle/daily").header(PLAYER_HEADER, UUID.randomUUID()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.puzzleNumber").value(this.schedule.puzzleNumber(this.today)))
			.andExpect(jsonPath("$.date").value(this.today.toString()))
			.andExpect(jsonPath("$.wordLength").value(5))
			.andExpect(jsonPath("$.maxGuesses").value(6))
			.andExpect(jsonPath("$.maxHints").value(3))
			.andExpect(jsonPath("$.hintPercents", contains(100, 90, 75, 60)))
			.andExpect(jsonPath("$.run").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String asPlayer = this.mockMvc.perform(get("/api/wordle/daily").session(Players.register(this.mockMvc)))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JsonPath.<Integer>read(asPlayer, "$.puzzleNumber")).isEqualTo(JsonPath.read(asGuest, "$.puzzleNumber"));
		assertThat(asGuest).doesNotContain(this.target);

		MockHttpSession player = Players.register(this.mockMvc);
		String run = startDaily(player, null, startSession(player, null));
		String afterGuess = guess(player, null, run, this.wrong.getFirst()).andExpect(status().isOk())
			.andExpect(jsonPath("$.answer").value(nullValue()))
			.andExpect(jsonPath("$.result").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(afterGuess).doesNotContain(this.target);
		assertThat(this.mockMvc.perform(get("/api/wordle/daily").session(player)).andReturn().getResponse().getContentAsString())
			.doesNotContain(this.target);

		guess(player, null, run, this.target).andExpect(jsonPath("$.status").value("SOLVED"))
			.andExpect(jsonPath("$.answer").value(this.target));
	}

	// --- Playing and scoring -------------------------------------------------------------------------

	@Test
	void aPlayerSolvesTheDailyWordAndItsScoreIsAcceptedOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);

		guess(player, null, run, this.wrong.getFirst()).andExpect(jsonPath("$.status").value("PLAYING"))
			.andExpect(jsonPath("$.guesses", hasSize(1)))
			.andExpect(jsonPath("$.guesses[0].word").value(this.wrong.getFirst()))
			.andExpect(jsonPath("$.guesses[0].feedback", hasSize(5)));
		String solved = guess(player, null, run, this.target.toLowerCase()).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("SOLVED"))
			.andExpect(jsonPath("$.guesses[1].feedback", contains("CORRECT", "CORRECT", "CORRECT", "CORRECT", "CORRECT")))
			// Two guesses, no hint, a first-day streak: 500.
			.andExpect(jsonPath("$.result.score").value(500))
			.andExpect(jsonPath("$.result.details.speed").value(5))
			.andExpect(jsonPath("$.result.details.streak").value(1))
			.andExpect(jsonPath("$.scored").value(false))
			.andReturn()
			.getResponse()
			.getContentAsString();

		submit(player, null, session, solved).andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value("wordle"))
			.andExpect(jsonPath("$.score").value(500))
			.andExpect(jsonPath("$.rewards.achievements[*].code",
					hasItems("WORDLE_FIRST_GUESS", "WORDLE_SOLVED", "WORDLE_CLEAN_SWEEP", "WORDLE_SPEED_THINKER")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("WORDLE_STREAK_3"))));

		this.mockMvc.perform(get("/api/leaderboards/wordle?period=DAILY").session(player))
			.andExpect(jsonPath("$.entries[?(@.you == true)].score").value(500));
		this.mockMvc.perform(get("/api/wordle/daily").session(player))
			.andExpect(jsonPath("$.run.id").value(run))
			.andExpect(jsonPath("$.run.scored").value(true));

		// The same session cannot be finished again, and no new session can replay the day.
		submit(player, null, session, solved).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
		startDailyRequest(player, null, startSession(player, null)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DAILY_ALREADY_PLAYED"));
	}

	@Test
	void aGuestPlaysWithTheirPlayerIdAndGetsNoRewards() throws Exception {
		UUID guest = UUID.randomUUID();
		String session = startSession(null, guest);
		String run = startDaily(null, guest, session);
		String solved = guess(null, guest, run, this.target).andExpect(jsonPath("$.result.score").value(600))
			.andReturn()
			.getResponse()
			.getContentAsString();

		submit(null, guest, session, solved).andExpect(status().isOk()).andExpect(jsonPath("$.rewards").value(nullValue()));
		// Another browser cannot touch the run, and a guest without an id cannot play at all.
		guess(null, UUID.randomUUID(), run, this.target).andExpect(status().isNotFound());
		this.mockMvc.perform(post("/api/wordle/practice/runs")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("PLAYER_ID_REQUIRED"));
	}

	@Test
	void anUnknownWordIsRefusedWithoutUsingAGuess() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startDaily(player, null, startSession(player, null));

		guess(player, null, run, "QQQQQ").andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.code").value("WORD_NOT_IN_LIST"));
		guess(player, null, run, "AB1DE").andExpect(status().isBadRequest());
		guess(player, null, run, "TOOLONG").andExpect(status().isBadRequest());

		guess(player, null, run, this.wrong.getFirst()).andExpect(jsonPath("$.guesses", hasSize(1)));
	}

	@Test
	void sixWrongGuessesFailScoreNothingAndRevealTheWord() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);
		String failed = null;
		for (String word : this.wrong.subList(0, 6)) {
			failed = guess(player, null, run, word).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		}
		assertThat(JsonPath.<String>read(failed, "$.status")).isEqualTo("FAILED");
		assertThat(JsonPath.<String>read(failed, "$.answer")).isEqualTo(this.target);
		assertThat(JsonPath.<Integer>read(failed, "$.result.score")).isZero();

		guess(player, null, run, this.target).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RUN_OVER"));
		hint(player, null, run, "ELIMINATE_LETTERS", null).andExpect(status().isConflict());
		submit(player, null, session, failed).andExpect(status().isOk())
			.andExpect(jsonPath("$.score").value(0))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("WORDLE_FIRST_GUESS")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("WORDLE_SOLVED"))));
		this.mockMvc.perform(get("/api/wordle/stats").session(player))
			.andExpect(jsonPath("$.played").value(1))
			.andExpect(jsonPath("$.solved").value(0))
			.andExpect(jsonPath("$.currentStreak").value(0));
	}

	// --- Score integrity ------------------------------------------------------------------------------

	@Test
	void forgedSubmissionsAreRejectedWithoutSayingWhy() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);
		hint(player, null, run, "ELIMINATE_LETTERS", null).andExpect(status().isOk());
		guess(player, null, run, this.wrong.getFirst());
		guess(player, null, run, this.wrong.get(1));
		String solved = guess(player, null, run, this.target).andReturn().getResponse().getContentAsString();
		// Three guesses, one hint: 400 × 90% = 360.
		assertThat(JsonPath.<Integer>read(solved, "$.result.score")).isEqualTo(360);

		// The famous forgery: a perfect score in one guess.
		finish(player, null, session, 999999, Map.of("solved", 1, "guesses", 1)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"))
			.andExpect(jsonPath("$.detail").value("Score submission rejected."));
		// Consistent with itself, but not this run: one guess, no hint.
		finish(player, null, session, 600, detailsOf(true, 1, 0, 1)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		// The right guesses, with the hint hidden.
		finish(player, null, session, 400, detailsOf(true, 3, 0, 1)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		// A higher streak than the server worked out.
		finish(player, null, session, 370, detailsOf(true, 3, 1, 2)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		// Details that do not add up with the score.
		finish(player, null, session, 400, detailsOf(true, 3, 1, 1)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));

		// None of that left a trace: the honest result still goes through.
		submit(player, null, session, solved).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(360));
	}

	@Test
	void aRunCanOnlyBeSubmittedOnceItIsOver() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);
		guess(player, null, run, this.wrong.getFirst());

		finish(player, null, session, 0, detailsOf(false, 6, 0, 0)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	@Test
	void aWordGuessSessionWithoutADailyRunScoresNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		// A practice game is no daily run, however it ends.
		String practice = startPractice(player, null);
		assertThat(practice).isNotBlank();

		finish(player, null, session, 600, detailsOf(true, 1, 0, 1)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		finish(player, null, session, 0, detailsOf(false, 6, 0, 0)).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	@Test
	void aRunPickedUpWithANewSessionCanOnlyBeScoredThroughIt() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String first = startSession(player, null);
		String run = startDaily(player, null, first);
		guess(player, null, run, this.wrong.getFirst());

		// A reload: a new session picks the same run up, guesses and all.
		String second = startSession(player, null);
		startDailyRequest(player, null, second).andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(run))
			.andExpect(jsonPath("$.guesses", hasSize(1)));
		String solved = guess(player, null, run, this.target).andReturn().getResponse().getContentAsString();

		submit(player, null, first, solved).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		submit(player, null, second, solved).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(500));
		// Starting the same session's run twice is harmless.
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM wordle_runs WHERE id = ?::uuid", Integer.class, run))
			.isOne();
	}

	@Test
	void aRunNeedsAnUnfinishedWordGuessSessionOfTheCallersOwn() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);

		startDailyRequest(player, null, Players.startGame(this.mockMvc, player, "snake")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("WRONG_SESSION"));
		startDailyRequest(player, null, startSession(other, null)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("WRONG_SESSION"));
		startDailyRequest(player, null, UUID.randomUUID().toString()).andExpect(status().isBadRequest());
		UUID guest = UUID.randomUUID();
		startDailyRequest(null, UUID.randomUUID(), startSession(null, guest)).andExpect(status().isBadRequest());
	}

	@Test
	void someoneElsesRunCannotBePlayed() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startDaily(player, null, startSession(player, null));

		guess(Players.register(this.mockMvc), null, run, this.target).andExpect(status().isNotFound());
		hint(null, UUID.randomUUID(), run, "REVEAL_LETTER", null).andExpect(status().isNotFound());
	}

	// --- Hints ------------------------------------------------------------------------------------

	@Test
	void hintsTellTheTruthOneOfEachAndCostTheScore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);

		String revealed = hint(player, null, run, "REVEAL_LETTER", null).andExpect(status().isOk())
			.andExpect(jsonPath("$.hintsLeft").value(2))
			.andExpect(jsonPath("$.answer").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		int position = JsonPath.read(revealed, "$.hints[0].position");
		assertThat(JsonPath.<String>read(revealed, "$.hints[0].letter")).isEqualTo(String.valueOf(this.target.charAt(position)));

		char letter = 'Q';
		String checked = hint(player, null, run, "CHECK_LETTER", String.valueOf(letter)).andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JsonPath.<Boolean>read(checked, "$.hints[1].present")).isEqualTo(this.target.indexOf(letter) >= 0);

		String eliminated = hint(player, null, run, "ELIMINATE_LETTERS", null).andExpect(status().isOk())
			.andExpect(jsonPath("$.hintsLeft").value(0))
			.andExpect(jsonPath("$.availableHints", hasSize(0)))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JsonPath.<List<String>>read(eliminated, "$.hints[2].letters")).isNotEmpty()
			.allSatisfy((removed) -> assertThat(this.target).doesNotContain(removed));

		hint(player, null, run, "REVEAL_LETTER", null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("HINT_UNAVAILABLE"));
		hint(player, null, run, "CHECK_LETTER", "1").andExpect(status().isBadRequest());

		String solved = guess(player, null, run, this.target).andExpect(jsonPath("$.result.hintPercent").value(60))
			// One guess, three hints: 600 × 60% = 360.
			.andExpect(jsonPath("$.result.score").value(360))
			.andReturn()
			.getResponse()
			.getContentAsString();
		submit(player, null, session, solved).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("WORDLE_CLEAN_SWEEP"))));
	}

	@Test
	void theSameHintCannotBeTakenTwice() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startDaily(player, null, startSession(player, null));

		hint(player, null, run, "ELIMINATE_LETTERS", null).andExpect(status().isOk());
		hint(player, null, run, "ELIMINATE_LETTERS", null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("HINT_UNAVAILABLE"));
		this.mockMvc.perform(get("/api/wordle/daily").session(player)).andExpect(jsonPath("$.run.hints", hasSize(1)));
	}

	// --- Streaks and statistics ------------------------------------------------------------------------

	@Test
	void solvingDayAfterDayBuildsAStreakTheServerCounts() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long userId = Players.userId(this.mockMvc, player);
		pastDailyRun(userId, this.today.minusDays(2), true, 3);
		pastDailyRun(userId, this.today.minusDays(1), true, 4);
		this.mockMvc.perform(get("/api/wordle/stats").session(player)).andExpect(jsonPath("$.currentStreak").value(2));

		String session = startSession(player, null);
		String run = startDaily(player, null, session);
		String solved = guess(player, null, run, this.target).andExpect(jsonPath("$.result.details.streak").value(3))
			// One guess, and two days of streak bonus.
			.andExpect(jsonPath("$.result.score").value(620))
			.andReturn()
			.getResponse()
			.getContentAsString();
		submit(player, null, session, solved).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("WORDLE_STREAK_3")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("WORDLE_PERFECT_WEEK"))));

		this.mockMvc.perform(get("/api/wordle/stats").session(player))
			.andExpect(jsonPath("$.played").value(3))
			.andExpect(jsonPath("$.solved").value(3))
			.andExpect(jsonPath("$.winRate").value(100))
			.andExpect(jsonPath("$.currentStreak").value(3))
			.andExpect(jsonPath("$.bestStreak").value(3))
			.andExpect(jsonPath("$.averageGuesses").value(2.7))
			.andExpect(jsonPath("$.distribution", contains(1, 0, 1, 1, 0, 0)))
			.andExpect(jsonPath("$.lastPlayed").value(this.today.toString()));
	}

	@Test
	void aMissedDayStartsTheStreakOver() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long userId = Players.userId(this.mockMvc, player);
		pastDailyRun(userId, this.today.minusDays(3), true, 2);
		pastDailyRun(userId, this.today.minusDays(2), true, 2);

		this.mockMvc.perform(get("/api/wordle/stats").session(player))
			.andExpect(jsonPath("$.currentStreak").value(0))
			.andExpect(jsonPath("$.bestStreak").value(2));
		String run = startDaily(player, null, startSession(player, null));
		guess(player, null, run, this.target).andExpect(jsonPath("$.result.details.streak").value(1))
			.andExpect(jsonPath("$.result.score").value(600));
	}

	@Test
	void statisticsAreEmptyForSomeoneWhoHasNotPlayed() throws Exception {
		this.mockMvc.perform(get("/api/wordle/stats"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.played").value(0))
			.andExpect(jsonPath("$.averageGuesses").value(nullValue()))
			.andExpect(jsonPath("$.distribution", contains(0, 0, 0, 0, 0, 0)));
	}

	// --- Practice ---------------------------------------------------------------------------------------

	@Test
	void practiceIsNeverTodaysWordAndCountsForNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		for (int game = 0; game < 15; game++) {
			String practice = startPractice(player, null);
			String word = this.jdbc.queryForObject("SELECT target FROM wordle_runs WHERE id = ?::uuid", String.class,
					practice);
			assertThat(word).isNotEqualTo(this.target);
			assertThat(this.dictionary.isAnswer(word)).isTrue();
		}
		String practice = startPractice(player, null);
		String word = this.jdbc.queryForObject("SELECT target FROM wordle_runs WHERE id = ?::uuid", String.class, practice);
		guess(player, null, practice, word).andExpect(jsonPath("$.mode").value("PRACTICE"))
			.andExpect(jsonPath("$.status").value("SOLVED"))
			.andExpect(jsonPath("$.puzzleNumber").value(nullValue()));

		this.mockMvc.perform(get("/api/wordle/stats").session(player)).andExpect(jsonPath("$.played").value(0));
		this.mockMvc.perform(get("/api/wordle/daily").session(player)).andExpect(jsonPath("$.run").value(nullValue()));
	}

	// --- AI mode -----------------------------------------------------------------------------------------

	@Test
	void anAdminWatchesTheAiSolveThroughTheSameRules() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		String body = solve(admin, "BALANCED", null).andExpect(status().isOk())
			.andExpect(jsonPath("$.puzzleNumber").value(this.schedule.puzzleNumber(this.today)))
			.andExpect(jsonPath("$.solved").value(true))
			.andExpect(jsonPath("$.answer").value(this.target))
			.andReturn()
			.getResponse()
			.getContentAsString();
		List<String> guesses = JsonPath.read(body, "$.steps[*].guess");
		assertThat(guesses.getLast()).isEqualTo(this.target);
		assertThat(guesses).hasSizeLessThanOrEqualTo(6).allSatisfy((word) -> assertThat(this.dictionary.isAllowed(word)).isTrue());
		assertThat(JsonPath.<Integer>read(body, "$.score")).isEqualTo(100 * (7 - guesses.size()));

		// Same puzzle, same strategy: the same path, also for a past day.
		LocalDate past = this.today.minusDays(40);
		String once = solve(admin, "CONSERVATIVE", past).andExpect(jsonPath("$.answer").value(this.schedule.answerFor(past)))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String twice = solve(admin, "CONSERVATIVE", past).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<String>>read(twice, "$.steps[*].guess")).isEqualTo(JsonPath.read(once, "$.steps[*].guess"));

		// Nothing is saved, so nothing is scored.
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM wordle_runs WHERE user_id = ?", Integer.class,
				Players.userId(this.mockMvc, admin)))
			.isZero();
	}

	@Test
	void theAiIsForAdminsOnly() throws Exception {
		solve(Players.register(this.mockMvc), "BALANCED", null).andExpect(status().isForbidden());
		solve(null, "BALANCED", null).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/ai/wordle/benchmark?strategy=SPEED_SOLVER").session(Players.register(this.mockMvc)))
			.andExpect(status().isForbidden());
		// An admin by the database alone is not enough: the role comes with the sign-in.
		MockHttpSession promoted = Players.register(this.mockMvc);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", Players.userId(this.mockMvc, promoted));
		solve(promoted, "BALANCED", null).andExpect(status().isForbidden());
	}

	@Test
	void theAiNeitherSeesTheFutureNorPlaysBeforeTheFirstPuzzle() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);

		solve(admin, "BALANCED", this.today.plusDays(1)).andExpect(status().isBadRequest());
		solve(admin, "BALANCED", DailySchedule.FIRST_DAY.minusDays(1)).andExpect(status().isBadRequest());
		this.mockMvc.perform(post("/api/ai/wordle/solve").session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"strategy\":\"CHEATER\"}")).andExpect(status().isBadRequest());
	}

	@Test
	void anAdminCanBenchmarkAStrategyOverEveryAnswer() throws Exception {
		this.mockMvc.perform(get("/api/ai/wordle/benchmark?strategy=SPEED_SOLVER").session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.strategy").value("SPEED_SOLVER"))
			.andExpect(jsonPath("$.games").value(this.dictionary.answers().size()))
			.andExpect(jsonPath("$.distribution", hasSize(6)));
	}

	// --- Skins -------------------------------------------------------------------------------------------

	@Test
	void anAdminWearsWordGuessSkinsWithoutBuyingThemAndAPlayerMustBuy() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		this.mockMvc.perform(get("/api/shop/items?type=GAME_SKIN").session(player))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'wordle')].slot",
					containsInAnyOrder("tiles", "tiles", "tiles", "keyboard", "keyboard")))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'wordle')].wearable", contains(false, false, false, false, false)));
		wear(player, "WORDLE_TILES_NEON").andExpect(status().isNotFound());

		MockHttpSession admin = Players.register(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", adminId);
		wear(admin, "WORDLE_TILES_NEON").andExpect(status().isOk());
		wear(admin, "WORDLE_KEYS_MIDNIGHT").andExpect(status().isOk());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'wordle' && @.equipped == true)].code",
					containsInAnyOrder("WORDLE_TILES_NEON", "WORDLE_KEYS_MIDNIGHT")))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'wordle')].owned", contains(0, 0, 0, 0, 0)));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM purchases WHERE user_id = ?", Integer.class, adminId))
			.isZero();
	}

	// --- Helpers -----------------------------------------------------------------------------------------

	/** The details the server reports for a run with these numbers. */
	private static Map<String, Integer> detailsOf(boolean solved, int guesses, int hints, int streak) {
		return Scoring.details(solved, guesses, hints, streak);
	}

	private MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, MockHttpSession session, UUID guest) {
		if (session != null) {
			request.session(session);
		}
		if (guest != null) {
			request.header(PLAYER_HEADER, guest);
		}
		return request;
	}

	private String startSession(MockHttpSession session, UUID guest) throws Exception {
		String body = this.mockMvc.perform(as(post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"wordle\"}"), session, guest))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private ResultActions startDailyRequest(MockHttpSession session, UUID guest, String sessionId) throws Exception {
		return this.mockMvc.perform(as(post("/api/wordle/daily/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(sessionId)), session, guest));
	}

	private String startDaily(MockHttpSession session, UUID guest, String sessionId) throws Exception {
		String body = startDailyRequest(session, guest, sessionId).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("DAILY"))
			.andExpect(jsonPath("$.status").value("PLAYING"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private String startPractice(MockHttpSession session, UUID guest) throws Exception {
		String body = this.mockMvc.perform(as(post("/api/wordle/practice/runs"), session, guest))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private ResultActions guess(MockHttpSession session, UUID guest, String run, String word) throws Exception {
		return this.mockMvc.perform(as(post("/api/wordle/runs/{id}/guesses", run).contentType(MediaType.APPLICATION_JSON)
			.content("{\"word\":\"%s\"}".formatted(word)), session, guest));
	}

	private ResultActions hint(MockHttpSession session, UUID guest, String run, String type, String letter)
			throws Exception {
		String content = (letter != null) ? "{\"type\":\"%s\",\"letter\":\"%s\"}".formatted(type, letter)
				: "{\"type\":\"%s\"}".formatted(type);
		return this.mockMvc.perform(as(post("/api/wordle/runs/{id}/hints", run).contentType(MediaType.APPLICATION_JSON)
			.content(content), session, guest));
	}

	/** Finishes the session with exactly what the server said the run scored, as the browser does. */
	private ResultActions submit(MockHttpSession session, UUID guest, String sessionId, String runBody) throws Exception {
		int score = JsonPath.read(runBody, "$.result.score");
		Map<String, Integer> details = JsonPath.read(runBody, "$.result.details");
		return finish(session, guest, sessionId, score, details);
	}

	private ResultActions finish(MockHttpSession session, UUID guest, String sessionId, int score,
			Map<String, Integer> details) throws Exception {
		return this.mockMvc.perform(as(post("/api/game-sessions/{id}/finish", sessionId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details))), session, guest));
	}

	private ResultActions solve(MockHttpSession session, String strategy, LocalDate date) throws Exception {
		String content = (date != null) ? "{\"strategy\":\"%s\",\"date\":\"%s\"}".formatted(strategy, date)
				: "{\"strategy\":\"%s\"}".formatted(strategy);
		MockHttpServletRequestBuilder request = post("/api/ai/wordle/solve").contentType(MediaType.APPLICATION_JSON)
			.content(content);
		return this.mockMvc.perform(as(request, session, null));
	}

	private ResultActions wear(MockHttpSession session, String code) throws Exception {
		Long itemId = this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
		return this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId).session(session));
	}

	/** A daily puzzle the player finished on an earlier day, as the server would have recorded it. */
	private void pastDailyRun(Long userId, LocalDate day, boolean solved, int guesses) {
		List<String> played = new ArrayList<>(this.wrong.subList(0, solved ? guesses - 1 : 6));
		String word = this.schedule.answerFor(day);
		if (solved) {
			played.add(word);
		}
		this.jdbc.update("""
				INSERT INTO wordle_runs (id, mode, user_id, puzzle_date, puzzle_number, target, guesses, hints, status,
				                         streak, started_at, finished_at)
				VALUES (?, 'DAILY', ?, ?, ?, ?, ?, '', ?, 0, now(), now())
				""", UUID.randomUUID(), userId, day, this.schedule.puzzleNumber(day), word, String.join(",", played),
				solved ? "SOLVED" : "FAILED");
	}

}
