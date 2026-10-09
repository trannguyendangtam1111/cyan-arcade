package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Scoring;
import com.cyan.arcade.sudoku.engine.Solver;
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
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sudoku through the API, as the browser plays it: a platform game session, a run tied to it, every
 * digit and hint judged by the server, and the score submitted through the platform, where
 * {@link SudokuRunRules} holds it against the run the server recorded.
 */
@IntegrationTest
class SudokuApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private Clock clock;

	private LocalDate today;

	@BeforeEach
	void noSudokuChallengeToday() {
		this.today = DailySchedule.today(this.clock);
		clearChallenge();
	}

	// --- The puzzle ------------------------------------------------------------------------------------

	@Test
	void sudokuIsInTheCatalog() throws Exception {
		this.mockMvc.perform(get("/api/games/sudoku"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Sudoku"))
			.andExpect(jsonPath("$.category").value("PUZZLE"));
	}

	@Test
	void everyoneGetsTheSameDailyPuzzleAndNobodySeesTheSolutionBeforeTheEnd() throws Exception {
		String asGuest = this.mockMvc.perform(get("/api/sudoku/today").header(PLAYER_HEADER, UUID.randomUUID()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.puzzleNumber").value(DailySchedule.puzzleNumber(this.today)))
			.andExpect(jsonPath("$.date").value(this.today.toString()))
			.andExpect(jsonPath("$.difficulty").value(DailySchedule.difficultyFor(this.today).name()))
			.andExpect(jsonPath("$.maxHints").value(3))
			.andExpect(jsonPath("$.mistakeLimit").value(3))
			.andExpect(jsonPath("$.hintPercents", contains(100, 90, 75, 60)))
			.andExpect(jsonPath("$.difficulties[*].id", contains("EASY", "MEDIUM", "HARD", "EXPERT")))
			.andExpect(jsonPath("$.daily").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String solution = this.jdbc.queryForObject("SELECT solution FROM sudoku_daily_puzzles WHERE puzzle_date = ?",
				String.class, this.today);
		assertThat(asGuest).doesNotContain(solution);

		MockHttpSession one = Players.register(this.mockMvc);
		MockHttpSession two = Players.register(this.mockMvc);
		String first = startDaily(one, null, startSession(one, null));
		String second = startDaily(two, null, startSession(two, null));
		assertThat(JsonPath.<String>read(first, "$.givens")).isEqualTo(JsonPath.read(second, "$.givens"));
		assertThat(first).doesNotContain(solution);
		assertThat(JsonPath.<Object>read(first, "$.solution")).isNull();
		// The stored puzzle is the day's: what the schedule makes of the date.
		assertThat(JsonPath.<String>read(first, "$.givens")).isEqualTo(DailySchedule.generate(this.today).givens());

		String afterAMove = move(one, null, id(first), firstEmpty(first), solutionOf(first)[firstEmpty(first)])
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(afterAMove).doesNotContain(solution);
		String solved = solve(one, null, afterAMove);
		assertThat(JsonPath.<String>read(solved, "$.solution")).isEqualTo(solution);
	}

	// --- Playing and scoring -------------------------------------------------------------------------

	@Test
	void aPlayerSolvesTheDailyAndItsScoreIsAcceptedOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);
		String solved = solve(player, null, run);
		assertThat(JsonPath.<String>read(solved, "$.status")).isEqualTo("SOLVED");
		int score = JsonPath.read(solved, "$.result.score");
		Map<String, Integer> details = JsonPath.read(solved, "$.result.details");
		assertThat(details).hasSize(10)
			.containsEntry("solvedLevel", DailySchedule.difficultyFor(this.today).level())
			.containsEntry("dailyGrade", 3 + (details.get("seconds") <= DailySchedule.difficultyFor(this.today).parSeconds() ? 1 : 0))
			.containsEntry("mistakes", 0)
			.containsEntry("hints", 0)
			.containsEntry("streak", 1);
		assertThat(score).isEqualTo(Scoring.score(new Scoring.Summary(true, true, DailySchedule.difficultyFor(this.today),
				details.get("seconds"), 0, 0, 1)));

		submit(player, null, session, solved).andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value("sudoku"))
			.andExpect(jsonPath("$.score").value(score))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("SUDOKU_FIRST_SOLVE")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("SUDOKU_DAILY_STREAK"))));

		this.mockMvc.perform(get("/api/leaderboards/sudoku?period=DAILY").session(player))
			.andExpect(jsonPath("$.entries[?(@.you == true)].score").value(score));
		this.mockMvc.perform(get("/api/sudoku/today").session(player))
			.andExpect(jsonPath("$.daily.id").value(id(run)))
			.andExpect(jsonPath("$.daily.scored").value(true));

		// The same session cannot be finished again, and no new session can replay the day.
		submit(player, null, session, solved).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
		startDailyRequest(player, null, startSession(player, null)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DAILY_ALREADY_PLAYED"));
		bind(player, null, id(run), startSession(player, null)).andExpect(status().isConflict());
	}

	@Test
	void forgedScoresHintsMistakesAndTimesAreRejected() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startPractice(player, null, "EASY", session);
		// Five minutes of play, one mistake, one hint, then the rest.
		this.jdbc.update("UPDATE sudoku_runs SET started_at = started_at - interval '5 minutes' WHERE id = ?::uuid", id(run));
		int cell = firstEmpty(run);
		int right = solutionOf(run)[cell];
		move(player, null, id(run), cell, (right % 9) + 1).andExpect(jsonPath("$.mistakes").value(1))
			.andExpect(jsonPath("$.wrong", contains(cell)));
		hint(player, null, id(run), "REVEAL", cell).andExpect(status().isOk());
		String solved = solve(player, null, run);
		int score = JsonPath.read(solved, "$.result.score");
		Map<String, Integer> details = new HashMap<>(JsonPath.read(solved, "$.result.details"));
		assertThat(details).containsEntry("mistakes", 1).containsEntry("hints", 1).containsEntry("dailyGrade", 0);
		assertThat(details.get("seconds")).isBetween(300, 310);

		finish(player, session, score + 1, details).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"))
			.andExpect(jsonPath("$.detail").value("Score submission rejected."));
		// A perfect run, consistent with itself, but not the run that was played.
		Map<String, Integer> perfect = Scoring.details(new Scoring.Summary(true, false,
				Difficulty.EASY, details.get("seconds"), 0, 0, 0));
		int perfectScore = Scoring.score(new Scoring.Summary(true, false, Difficulty.EASY,
				details.get("seconds"), 0, 0, 0));
		finish(player, session, perfectScore, perfect).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		Map<String, Integer> noHints = withDetails(details, "hints", 0, "cleanSolve", 1);
		finish(player, session, Scoring.score(new Scoring.Summary(true, false, Difficulty.EASY, details.get("seconds"), 1, 0, 0)),
				Scoring.details(new Scoring.Summary(true, false, Difficulty.EASY, details.get("seconds"), 1, 0, 0)))
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		finish(player, session, score, noHints).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		Map<String, Integer> noMistakes = withDetails(details, "mistakes", 0, "flawless", 0);
		finish(player, session, score, noMistakes).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		Map<String, Integer> faster = withDetails(details, "seconds", 0);
		finish(player, session, score, faster).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		Map<String, Integer> daily = withDetails(details, "streak", 1, "dailyGrade", 1);
		finish(player, session, score, daily).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		finish(player, session, Scoring.MAX_SCORE + 1, details).andExpect(status().isBadRequest());

		// The honest one is still accepted: a rejection leaves the session open.
		submit(player, null, session, solved).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(score));
	}

	@Test
	void aRunCannotBeScoredBeforeItIsOverOrWithoutOne() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		startDaily(player, null, session);
		Map<String, Integer> claimed = Scoring.details(new Scoring.Summary(true, true,
				DailySchedule.difficultyFor(this.today), 60, 0, 0, 1));
		int claimedScore = Scoring.score(new Scoring.Summary(true, true, DailySchedule.difficultyFor(this.today), 60, 0,
				0, 1));
		finish(player, session, claimedScore, claimed).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		// A session with no run at all.
		finish(player, startSession(player, null), claimedScore, claimed)
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	@Test
	void aGuestPlaysWithTheirPlayerIdAndGetsNoRewards() throws Exception {
		UUID guest = UUID.randomUUID();
		String session = startSession(null, guest);
		String run = startDaily(null, guest, session);
		String solved = solve(null, guest, run);
		submit(null, guest, session, solved).andExpect(status().isOk()).andExpect(jsonPath("$.rewards").value(nullValue()));

		// Another browser cannot touch the run, and a guest without an id cannot play at all.
		move(null, UUID.randomUUID(), id(run), 0, 0).andExpect(status().isNotFound());
		this.mockMvc.perform(post("/api/sudoku/practice/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"difficulty\":\"EASY\"}")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("PLAYER_ID_REQUIRED"));
		this.mockMvc.perform(get("/api/sudoku/stats").header(PLAYER_HEADER, guest))
			.andExpect(jsonPath("$.daily.completed").value(1))
			.andExpect(jsonPath("$.currentStreak").value(1));
	}

	@Test
	void sessionsAndRunsBelongToTheirPlayer() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);
		startDailyRequest(player, null, startSession(other, null)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("WRONG_SESSION"));
		String snake = Players.startGame(this.mockMvc, player, "snake");
		startDailyRequest(player, null, snake).andExpect(jsonPath("$.code").value("WRONG_SESSION"));

		String run = startDaily(player, null, startSession(player, null));
		move(other, null, id(run), firstEmpty(run), 1).andExpect(status().isNotFound());
		hint(other, null, id(run), "FIND", null).andExpect(status().isNotFound());
		this.mockMvc.perform(post("/api/sudoku/runs/{id}/pause", id(run)).session(other))
			.andExpect(status().isNotFound());
	}

	@Test
	void cluesAreLockedAndMovesAreChecked() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, "MEDIUM", startSession(player, null));
		int clue = JsonPath.<String>read(run, "$.givens").replace('0', '.').indexOf(firstClueChar(run));
		move(player, null, id(run), clue, 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CELL_LOCKED"));
		move(player, null, id(run), clue, 0).andExpect(jsonPath("$.code").value("CELL_LOCKED"));
		move(player, null, id(run), 81, 1).andExpect(status().isBadRequest());
		move(player, null, id(run), firstEmpty(run), 10).andExpect(status().isBadRequest());
		// A refused move changes nothing.
		this.mockMvc.perform(get("/api/sudoku/today").session(player))
			.andExpect(jsonPath("$.practice.values").value(JsonPath.<String>read(run, "$.givens")));
	}

	@Test
	void theThirdWrongDigitEndsTheRunAndItScoresNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startDaily(player, null, session);
		int cell = firstEmpty(run);
		int right = solutionOf(run)[cell];
		List<int[]> wrong = new ArrayList<>();
		for (int digit = 1; wrong.size() < 3; digit++) {
			if (digit != right) {
				wrong.add(new int[] { cell, digit });
			}
		}
		String failed = moves(player, null, id(run), wrong).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("FAILED"))
			.andExpect(jsonPath("$.mistakes").value(3))
			.andExpect(jsonPath("$.result.score").value(0))
			.andExpect(jsonPath("$.result.details.solvedLevel").value(0))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JsonPath.<String>read(failed, "$.solution")).hasSize(81);
		move(player, null, id(run), cell, right).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("RUN_OVER"));

		submit(player, null, session, failed).andExpect(status().isOk())
			.andExpect(jsonPath("$.score").value(0))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("SUDOKU_FIRST_SOLVE"))));
		this.mockMvc.perform(get("/api/sudoku/stats").session(player))
			.andExpect(jsonPath("$.daily.played").value(1))
			.andExpect(jsonPath("$.daily.completed").value(0))
			.andExpect(jsonPath("$.currentStreak").value(0));
	}

	@Test
	void threeHintsEachLowerTheScoreAndNeverGiveAwayTheBoard() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startPractice(player, null, "HARD", session);
		int[] solution = solutionOf(run);

		String revealed = hint(player, null, id(run), "REVEAL", null).andExpect(status().isOk())
			.andExpect(jsonPath("$.hint.type").value("REVEAL"))
			.andExpect(jsonPath("$.run.hintsUsed").value(1))
			.andExpect(jsonPath("$.run.revealed", hasSize(1)))
			.andReturn()
			.getResponse()
			.getContentAsString();
		int cell = JsonPath.read(revealed, "$.hint.cell");
		assertThat(JsonPath.<Integer>read(revealed, "$.hint.digit")).isEqualTo(solution[cell]);
		assertThat(Grid.filled(Grid.parse(JsonPath.read(revealed, "$.run.values"))))
			.isEqualTo(Grid.filled(Grid.parse(JsonPath.read(run, "$.givens"))) + 1);
		// A revealed cell is locked like a clue.
		move(player, null, id(run), cell, 0).andExpect(jsonPath("$.code").value("CELL_LOCKED"));

		hint(player, null, id(run), "FIND", null).andExpect(jsonPath("$.hint.digit").value(0))
			.andExpect(jsonPath("$.hint.technique").isNotEmpty());
		hint(player, null, id(run), "EXPLAIN", null).andExpect(jsonPath("$.hint.explanation").isNotEmpty())
			.andExpect(jsonPath("$.run.hintsLeft").value(0));
		hint(player, null, id(run), "FIND", null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("HINT_UNAVAILABLE"));

		String solved = solve(player, null, revealedRunOf(player));
		this.mockMvc.perform(get("/api/sudoku/today").session(player)).andExpect(status().isOk());
		assertThat(JsonPath.<Integer>read(solved, "$.result.hintPercent")).isEqualTo(60);
		submit(player, null, session, solved).andExpect(status().isOk());
	}

	@Test
	void aHintThatCannotBeGivenCostsNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, "EASY", startSession(player, null));
		int clue = JsonPath.<String>read(run, "$.givens").replace('0', '.').indexOf(firstClueChar(run));
		hint(player, null, id(run), "REVEAL", clue).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("HINT_UNAVAILABLE"));
		int cell = firstEmpty(run);
		move(player, null, id(run), cell, solutionOf(run)[cell]);
		hint(player, null, id(run), "REVEAL", cell).andExpect(jsonPath("$.code").value("HINT_UNAVAILABLE"));
		this.mockMvc.perform(get("/api/sudoku/today").session(player))
			.andExpect(jsonPath("$.practice.hintsUsed").value(0))
			.andExpect(jsonPath("$.practice.hintsLeft").value(3));
	}

	@Test
	void pausedTimeDoesNotCount() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String session = startSession(player, null);
		String run = startPractice(player, null, "EASY", session);
		this.mockMvc.perform(post("/api/sudoku/runs/{id}/pause", id(run)).session(player))
			.andExpect(jsonPath("$.paused").value(true));
		// Started ten minutes ago, paused for the last six.
		this.jdbc.update("UPDATE sudoku_runs SET started_at = started_at - interval '10 minutes', "
				+ "paused_at = paused_at - interval '6 minutes' WHERE id = ?::uuid", id(run));
		String resumed = this.mockMvc.perform(post("/api/sudoku/runs/{id}/resume", id(run)).session(player))
			.andExpect(jsonPath("$.paused").value(false))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JsonPath.<Number>read(resumed, "$.elapsedMs").longValue()).isBetween(240_000L, 250_000L);

		// A move while paused starts the clock again by itself.
		this.mockMvc.perform(post("/api/sudoku/runs/{id}/pause", id(run)).session(player));
		move(player, null, id(run), firstEmpty(run), solutionOf(run)[firstEmpty(run)])
			.andExpect(jsonPath("$.paused").value(false));
		String solved = solve(player, null, run);
		assertThat(JsonPath.<Integer>read(solved, "$.result.seconds")).isBetween(240, 250);
		submit(player, null, session, solved).andExpect(status().isOk());
	}

	// --- Modes -----------------------------------------------------------------------------------------

	@Test
	void relaxedPracticeIsNeverScoredOrCounted() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, "MEDIUM", null);
		assertThat(JsonPath.<Boolean>read(run, "$.ranked")).isFalse();
		assertThat(JsonPath.<String>read(run, "$.mistakeRule")).isEqualTo("CONFLICT");
		assertThat(JsonPath.<Integer>read(run, "$.mistakeLimit")).isZero();

		int cell = firstEmpty(run);
		int right = solutionOf(run)[cell];
		// A wrong digit that repeats nothing is no mistake here, and nobody says it is wrong.
		int[] givens = Grid.parse(JsonPath.read(run, "$.givens"));
		int quiet = 0;
		for (int digit = 1; digit <= 9 && quiet == 0; digit++) {
			if (digit != right && !Grid.conflictsWith(givens, cell, digit)) {
				quiet = digit;
			}
		}
		if (quiet != 0) {
			move(player, null, id(run), cell, quiet).andExpect(jsonPath("$.mistakes").value(0))
				.andExpect(jsonPath("$.wrong", hasSize(0)));
		}
		String solved = solve(player, null, run);
		assertThat(JsonPath.<Object>read(solved, "$.result")).isNull();
		bind(player, null, id(run), startSession(player, null)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("RUN_NOT_RANKED"));
		this.mockMvc.perform(get("/api/sudoku/stats").session(player))
			.andExpect(jsonPath("$.practice.played").value(0))
			.andExpect(jsonPath("$.daily.played").value(0));
	}

	@Test
	void rankedPracticeScoresButNeverCountsAsADaily() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		giveChallenge("dailyGrade");
		String session = startSession(player, null);
		String run = startPractice(player, null, "EASY", session);
		assertThat(JsonPath.<Boolean>read(run, "$.ranked")).isTrue();
		assertThat(JsonPath.<Object>read(run, "$.puzzleNumber")).isNull();
		String solved = solve(player, null, run);
		assertThat(JsonPath.<Map<String, Integer>>read(solved, "$.result.details")).containsEntry("dailyGrade", 0)
			.containsEntry("streak", 0);
		submit(player, null, session, solved).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.bonuses[*].type", not(hasItem("DAILY_CHALLENGE"))));
		assertThat(completions(playerId)).isZero();

		this.mockMvc.perform(get("/api/sudoku/stats").session(player))
			.andExpect(jsonPath("$.practice.played").value(1))
			.andExpect(jsonPath("$.practice.completed").value(1))
			.andExpect(jsonPath("$.practice.winRate").value(100))
			.andExpect(jsonPath("$.practice.bestSeconds.EASY").isNumber())
			.andExpect(jsonPath("$.practice.bestSeconds.HARD").value(nullValue()))
			.andExpect(jsonPath("$.daily.played").value(0))
			.andExpect(jsonPath("$.currentStreak").value(0));
	}

	@Test
	void aNewPracticeGameLeavesTheOldOneAsPlayedButNotCompleted() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String first = startPractice(player, null, "EASY", startSession(player, null));
		this.mockMvc.perform(get("/api/sudoku/today").session(player))
			.andExpect(jsonPath("$.practice.id").value(id(first)));
		String second = startPractice(player, null, "HARD", startSession(player, null));
		this.mockMvc.perform(get("/api/sudoku/today").session(player))
			.andExpect(jsonPath("$.practice.id").value(id(second)))
			.andExpect(jsonPath("$.practice.difficulty").value("HARD"));
		move(player, null, id(first), firstEmpty(first), 1).andExpect(jsonPath("$.code").value("RUN_OVER"));
		this.mockMvc.perform(get("/api/sudoku/stats").session(player))
			.andExpect(jsonPath("$.practice.played").value(1))
			.andExpect(jsonPath("$.practice.completed").value(0));
	}

	@Test
	void aRunIsPickedUpWithANewSessionAfterAReload() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startDaily(player, null, startSession(player, null));
		int cell = firstEmpty(run);
		move(player, null, id(run), cell, solutionOf(run)[cell]);

		// The page is reloaded: a new session, the same run where it was.
		String session = startSession(player, null);
		String picked = startDaily(player, null, session);
		assertThat(id(picked)).isEqualTo(id(run));
		assertThat(JsonPath.<String>read(picked, "$.values").charAt(cell)).isEqualTo((char) ('0' + solutionOf(run)[cell]));
		String solved = solve(player, null, picked);
		submit(player, null, session, solved).andExpect(status().isOk());

		String practice = startPractice(player, null, "EASY", startSession(player, null));
		String practiceSession = startSession(player, null);
		bind(player, null, id(practice), practiceSession).andExpect(status().isOk());
		submit(player, null, practiceSession, solve(player, null, practice)).andExpect(status().isOk());
	}

	// --- Streaks, challenges, achievements ---------------------------------------------------------------

	@Test
	void theStreakIsWorkedOutByTheServerAndADayCountsOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		pastDailyRun(playerId, this.today.minusDays(2), true);
		pastDailyRun(playerId, this.today.minusDays(1), true);
		this.mockMvc.perform(get("/api/sudoku/stats").session(player))
			.andExpect(jsonPath("$.currentStreak").value(2))
			.andExpect(jsonPath("$.bestStreak").value(2));

		String session = startSession(player, null);
		String solved = solve(player, null, startDaily(player, null, session));
		assertThat(JsonPath.<Integer>read(solved, "$.result.details.streak")).isEqualTo(3);
		submit(player, null, session, solved).andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("SUDOKU_DAILY_STREAK")));

		// More games today, of any kind, do not add to it.
		String practiceSession = startSession(player, null);
		submit(player, null, practiceSession, solve(player, null, startPractice(player, null, "EASY", practiceSession)))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("SUDOKU_DAILY_STREAK"))));
		this.mockMvc.perform(get("/api/sudoku/stats").session(player))
			.andExpect(jsonPath("$.currentStreak").value(3))
			.andExpect(jsonPath("$.bestStreak").value(3))
			.andExpect(jsonPath("$.lastDaily").value(this.today.toString()))
			.andExpect(jsonPath("$.daily.played").value(3))
			.andExpect(jsonPath("$.practice.played").value(1));
	}

	@Test
	void theDailyChallengeIsCompletedOnceByTheServersRun() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		giveChallenge("dailyGrade");
		String session = startSession(player, null);
		String solved = solve(player, null, startDaily(player, null, session));
		submit(player, null, session, solved).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.bonuses[?(@.type == 'DAILY_CHALLENGE')].title", contains("Grid of the Day")));
		assertThat(completions(playerId)).isEqualTo(1);
		// The day cannot be played again, so the challenge cannot be earned again.
		startDailyRequest(player, null, startSession(player, null)).andExpect(jsonPath("$.code").value("DAILY_ALREADY_PLAYED"));
		assertThat(completions(playerId)).isEqualTo(1);
	}

	@Test
	void anAchievementIsEarnedOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String first = startSession(player, null);
		submit(player, null, first, solve(player, null, startPractice(player, null, "EASY", first)))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("SUDOKU_FIRST_SOLVE")));
		String second = startSession(player, null);
		submit(player, null, second, solve(player, null, startPractice(player, null, "EASY", second)))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("SUDOKU_FIRST_SOLVE"))));
		Long playerId = Players.userId(this.mockMvc, player);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM user_achievements WHERE user_id = ? AND achievement_code = 'SUDOKU_FIRST_SOLVE'",
				Integer.class, playerId)).isEqualTo(1);
	}

	// --- AI mode -----------------------------------------------------------------------------------------

	@Test
	void anAdminWatchesTheAiSolveWithEachStrategyAndNothingIsSaved() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);
		String coinsBefore = this.mockMvc.perform(get("/api/users/me/coins").session(admin)).andReturn().getResponse().getContentAsString();
		int runsBefore = this.jdbc.queryForObject("SELECT count(*) FROM sudoku_runs WHERE user_id = ?", Integer.class, adminId);
		int scoresBefore = this.jdbc.queryForObject("SELECT count(*) FROM scores s JOIN game_sessions g ON g.id = s.game_session_id WHERE g.user_id = ?",
				Integer.class, adminId);
		this.mockMvc.perform(get("/api/sudoku/today").session(admin)).andExpect(status().isOk());
		String dailyGivens = this.jdbc.queryForObject("SELECT givens FROM sudoku_daily_puzzles WHERE puzzle_date = ?",
				String.class, this.today);

		for (String strategy : List.of("STEP_BY_STEP", "FAST", "TEACHING")) {
			String body = aiSolve(admin, "{\"strategy\":\"%s\"}".formatted(strategy)).andExpect(status().isOk())
				.andExpect(jsonPath("$.strategy").value(strategy))
				.andExpect(jsonPath("$.date").value(this.today.toString()))
				.andExpect(jsonPath("$.givens").value(dailyGivens))
				.andReturn()
				.getResponse()
				.getContentAsString();
			String solution = JsonPath.read(body, "$.solution");
			assertThat(Solver.solve(Grid.parse(dailyGivens)).map(Grid::format)).contains(solution);
			// Same puzzle and strategy, same moves.
			String again = aiSolve(admin, "{\"strategy\":\"%s\"}".formatted(strategy)).andReturn().getResponse().getContentAsString();
			assertThat(JsonPath.<List<Object>>read(again, "$.moves")).isEqualTo(JsonPath.read(body, "$.moves"));
		}
		aiSolve(admin, "{\"strategy\":\"TEACHING\",\"difficulty\":\"EXPERT\",\"seed\":7}").andExpect(status().isOk())
			.andExpect(jsonPath("$.difficulty").value("EXPERT"))
			.andExpect(jsonPath("$.seed").value(7))
			.andExpect(jsonPath("$.moves[*].kind", hasItem("ELIMINATE")));

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM sudoku_runs WHERE user_id = ?", Integer.class, adminId))
			.isEqualTo(runsBefore);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores s JOIN game_sessions g ON g.id = s.game_session_id WHERE g.user_id = ?",
				Integer.class, adminId)).isEqualTo(scoresBefore);
		assertThat(this.mockMvc.perform(get("/api/users/me/coins").session(admin)).andReturn().getResponse().getContentAsString())
			.isEqualTo(coinsBefore);
	}

	@Test
	void theAiIsForAdminsOnly() throws Exception {
		aiSolve(Players.register(this.mockMvc), "{\"strategy\":\"FAST\"}").andExpect(status().isForbidden());
		aiSolve(null, "{\"strategy\":\"FAST\"}").andExpect(status().isUnauthorized());
		// An admin by the database alone is not enough: the role comes with the sign-in.
		MockHttpSession promoted = Players.register(this.mockMvc);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", Players.userId(this.mockMvc, promoted));
		aiSolve(promoted, "{\"strategy\":\"FAST\"}").andExpect(status().isForbidden());
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		aiSolve(admin, "{\"strategy\":\"FAST\",\"date\":\"%s\"}".formatted(this.today.plusDays(1)))
			.andExpect(status().isBadRequest());
		aiSolve(admin, "{\"strategy\":\"CHEAT\"}").andExpect(status().isBadRequest());
	}

	// --- Skins -------------------------------------------------------------------------------------------

	@Test
	void anAdminWearsSudokuSkinsWithoutBuyingThemAndAPlayerMustBuy() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		this.mockMvc.perform(get("/api/shop/items?type=GAME_SKIN").session(player))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'sudoku')].slot", containsInAnyOrder("board", "board", "board", "pad")))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'sudoku')].wearable", everyItem(is(false))));
		wear(player, "SUDOKU_PAD_CANDY").andExpect(status().isNotFound());
		Players.grantCoins(this.mockMvc, playerId, 300);
		this.mockMvc.perform(post("/api/shop/purchases").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId("SUDOKU_PAD_CANDY"), UUID.randomUUID())))
			.andExpect(status().is2xxSuccessful());
		wear(player, "SUDOKU_PAD_CANDY").andExpect(status().isOk());

		MockHttpSession admin = Players.register(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", adminId);
		wear(admin, "SUDOKU_BOARD_MIDNIGHT").andExpect(status().isOk());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.code == 'SUDOKU_BOARD_MIDNIGHT')].equipped", contains(true)))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'sudoku')].owned", contains(0, 0, 0, 0)));
		this.mockMvc.perform(get("/api/users/me/coins").session(admin)).andExpect(jsonPath("$.balance").value(0));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM purchases WHERE user_id = ?", Integer.class, adminId))
			.isZero();
		// Unrelated or unknown items are still refused.
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", 999_999).session(admin))
			.andExpect(status().isNotFound());
	}

	// --- Helpers -----------------------------------------------------------------------------------------

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
			.content("{\"gameSlug\":\"sudoku\"}"), session, guest))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private ResultActions startDailyRequest(MockHttpSession session, UUID guest, String sessionId) throws Exception {
		return this.mockMvc.perform(as(post("/api/sudoku/daily/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(sessionId)), session, guest));
	}

	private String startDaily(MockHttpSession session, UUID guest, String sessionId) throws Exception {
		return startDailyRequest(session, guest, sessionId).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("DAILY"))
			.andExpect(jsonPath("$.ranked").value(true))
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	private String startPractice(MockHttpSession session, UUID guest, String difficulty, String sessionId)
			throws Exception {
		String content = (sessionId != null) ? "{\"difficulty\":\"%s\",\"sessionId\":\"%s\"}".formatted(difficulty, sessionId)
				: "{\"difficulty\":\"%s\"}".formatted(difficulty);
		return this.mockMvc.perform(as(post("/api/sudoku/practice/runs").contentType(MediaType.APPLICATION_JSON)
			.content(content), session, guest))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value("PRACTICE"))
			.andExpect(jsonPath("$.difficulty").value(difficulty))
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	private ResultActions bind(MockHttpSession session, UUID guest, String runId, String sessionId) throws Exception {
		return this.mockMvc.perform(as(post("/api/sudoku/runs/{id}/session", runId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(sessionId)), session, guest));
	}

	private ResultActions move(MockHttpSession session, UUID guest, String runId, int cell, int digit) throws Exception {
		return moves(session, guest, runId, List.<int[]>of(new int[] { cell, digit }));
	}

	private ResultActions moves(MockHttpSession session, UUID guest, String runId, List<int[]> moves) throws Exception {
		String json = moves.stream()
			.map((move) -> "{\"cell\":%d,\"digit\":%d}".formatted(move[0], move[1]))
			.reduce((a, b) -> a + "," + b)
			.orElse("");
		return this.mockMvc.perform(as(post("/api/sudoku/runs/{id}/moves", runId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"moves\":[" + json + "]}"), session, guest));
	}

	private ResultActions hint(MockHttpSession session, UUID guest, String runId, String type, Integer cell)
			throws Exception {
		String content = (cell != null) ? "{\"type\":\"%s\",\"cell\":%d}".formatted(type, cell)
				: "{\"type\":\"%s\"}".formatted(type);
		return this.mockMvc.perform(as(post("/api/sudoku/runs/{id}/hints", runId).contentType(MediaType.APPLICATION_JSON)
			.content(content), session, guest));
	}

	/** Fills every cell that is not right yet with its solution digit, as one batch. Returns the run after it. */
	private String solve(MockHttpSession session, UUID guest, String runBody) throws Exception {
		String current = latest(session, guest, runBody);
		int[] solution = solutionOf(current);
		int[] values = Grid.parse(JsonPath.read(current, "$.values"));
		List<Integer> revealed = JsonPath.read(current, "$.revealed");
		int[] givens = Grid.parse(JsonPath.read(current, "$.givens"));
		List<int[]> moves = new ArrayList<>();
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (givens[cell] == 0 && !revealed.contains(cell) && values[cell] != solution[cell]) {
				moves.add(new int[] { cell, solution[cell] });
			}
		}
		return moves(session, guest, id(runBody), moves).andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	/** The run as the server has it now: the player's daily or practice game with that id. */
	private String latest(MockHttpSession session, UUID guest, String runBody) throws Exception {
		String today = this.mockMvc.perform(as(get("/api/sudoku/today"), session, guest))
			.andReturn()
			.getResponse()
			.getContentAsString();
		for (String key : List.of("$.daily", "$.practice")) {
			Map<String, Object> run = JsonPath.read(today, key);
			if (run != null && id(runBody).equals(run.get("id"))) {
				return JsonPath.parse(run).jsonString();
			}
		}
		return runBody;
	}

	private String revealedRunOf(MockHttpSession player) throws Exception {
		String today = this.mockMvc.perform(get("/api/sudoku/today").session(player)).andReturn().getResponse().getContentAsString();
		return JsonPath.parse(JsonPath.<Map<String, Object>>read(today, "$.practice")).jsonString();
	}

	/** Finishes the session with exactly what the server said the run scored, as the browser does. */
	private ResultActions submit(MockHttpSession session, UUID guest, String sessionId, String runBody) throws Exception {
		int score = JsonPath.read(runBody, "$.result.score");
		Map<String, Integer> details = JsonPath.read(runBody, "$.result.details");
		return this.mockMvc.perform(as(post("/api/game-sessions/{id}/finish", sessionId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details))), session, guest));
	}

	private ResultActions finish(MockHttpSession session, String sessionId, int score, Map<String, Integer> details)
			throws Exception {
		return this.mockMvc.perform(post("/api/game-sessions/{id}/finish", sessionId).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details))));
	}

	private ResultActions aiSolve(MockHttpSession session, String content) throws Exception {
		return this.mockMvc.perform(as(post("/api/ai/sudoku/solve").contentType(MediaType.APPLICATION_JSON).content(content),
				session, null));
	}

	private ResultActions wear(MockHttpSession session, String code) throws Exception {
		return this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId(code)).session(session));
	}

	private Long itemId(String code) {
		return this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
	}

	private static String id(String runBody) {
		return JsonPath.read(runBody, "$.id");
	}

	/** The run's solution, worked out from its clues as anyone could: the server never sends it before the end. */
	private static int[] solutionOf(String runBody) {
		return Solver.solve(Grid.parse(JsonPath.read(runBody, "$.givens"))).orElseThrow();
	}

	private static int firstEmpty(String runBody) {
		return JsonPath.<String>read(runBody, "$.givens").indexOf('0');
	}

	private static char firstClueChar(String runBody) {
		return (char) JsonPath.<String>read(runBody, "$.givens").chars().filter((ch) -> ch != '0').findFirst().orElseThrow();
	}

	private static Map<String, Integer> withDetails(Map<String, Integer> details, Object... changes) {
		Map<String, Integer> changed = new HashMap<>(details);
		for (int index = 0; index < changes.length; index += 2) {
			changed.put((String) changes[index], (Integer) changes[index + 1]);
		}
		return changed;
	}

	/** A daily puzzle the player solved or failed on an earlier day, as the server would have recorded it. */
	private void pastDailyRun(Long userId, LocalDate day, boolean solved) {
		var puzzle = DailySchedule.generate(day);
		this.jdbc.update("""
				INSERT INTO sudoku_runs (id, mode, ranked, difficulty, puzzle_date, puzzle_number, seed, givens, solution,
				                         actions, status, mistakes, hints, streak, user_id, started_at, finished_at)
				VALUES (?, 'DAILY', TRUE, ?, ?, ?, ?, ?, ?, '', ?, ?, 0, 0, ?, now() - interval '1 day', now() - interval '1 day')
				""", UUID.randomUUID(), puzzle.difficulty().name(), day, DailySchedule.puzzleNumber(day), puzzle.seed(),
				puzzle.givens(), puzzle.solution(), solved ? "SOLVED" : "FAILED", solved ? 0 : 3, userId);
	}

	private void giveChallenge(String detail) {
		clearChallenge();
		this.jdbc.update("""
				INSERT INTO daily_challenges (challenge_date, game_id, title, description, goal, detail, target, xp_reward,
				                              coin_reward, created_at)
				VALUES (?, (SELECT id FROM games WHERE slug = 'sudoku'), 'Grid of the Day', 'Solve today''s Daily Sudoku.',
				        'DETAIL', ?, 1, 30, 60, now())
				""", this.today, detail);
	}

	private void clearChallenge() {
		String ids = "SELECT id FROM daily_challenges WHERE challenge_date = ? AND game_id = (SELECT id FROM games WHERE slug = 'sudoku')";
		this.jdbc.update("DELETE FROM daily_challenge_completions WHERE daily_challenge_id IN (" + ids + ")", this.today);
		this.jdbc.update("DELETE FROM daily_challenge_progress WHERE daily_challenge_id IN (" + ids + ")", this.today);
		this.jdbc.update("DELETE FROM daily_challenges WHERE challenge_date = ? AND game_id = (SELECT id FROM games WHERE slug = 'sudoku')",
				this.today);
	}

	private int completions(Long userId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions WHERE user_id = ?", Integer.class,
				userId);
	}

}
