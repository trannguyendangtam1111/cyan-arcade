package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The Daily Sudoku archive: past daily puzzles by UTC date (their public part only), replayed as
 * unranked runs that leave the official Daily, its leaderboard, rewards and streaks alone.
 */
@IntegrationTest
class DailyArchiveTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private DailyPuzzles dailyPuzzles;

	@Autowired
	private Clock clock;

	private LocalDate today;

	@BeforeEach
	void setUp() {
		this.today = DailySchedule.today(this.clock);
	}

	// --- The puzzle of a date ------------------------------------------------------------------------

	@Test
	void aPastDateGivesThatDaysStoredPuzzleWithoutItsSolution() throws Exception {
		LocalDate day = this.today.minusDays(40);
		String first = archive(day).andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(day.toString()))
			.andExpect(jsonPath("$.puzzleNumber").value(DailySchedule.puzzleNumber(day)))
			.andExpect(jsonPath("$.difficulty").value(DailySchedule.difficultyFor(day).name()))
			.andExpect(jsonPath("$.solution").doesNotExist())
			.andReturn()
			.getResponse()
			.getContentAsString();
		// It was made from the date and stored, as for any Daily; the answer is the stored puzzle.
		Puzzle stored = this.dailyPuzzles.stored(day).orElseThrow();
		assertThat(stored.givens()).isEqualTo(DailySchedule.generate(day).givens());
		assertThat((String) JsonPath.read(first, "$.givens")).isEqualTo(stored.givens());
		assertThat(first).doesNotContain(stored.solution());
		// The same date, again and again: the same puzzle.
		archive(day).andExpect(content().json(first, true));
		archive(day).andExpect(content().json(first, true));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM sudoku_daily_puzzles WHERE puzzle_date = ?",
				Integer.class, day)).isEqualTo(1);
	}

	@Test
	void aStoredPuzzleIsTheDatesPuzzleWhateverTheGeneratorWouldMakeNow() throws Exception {
		LocalDate day = DailySchedule.FIRST_DAY.plusDays(17);
		String givens = "1".repeat(80) + "0";
		this.jdbc.update("""
				INSERT INTO sudoku_daily_puzzles (puzzle_date, puzzle_number, difficulty, seed, givens, solution,
				                                  generator_version, created_at)
				VALUES (?, ?, 'EASY', 42, ?, ?, 1, now())
				""", day, DailySchedule.puzzleNumber(day), givens, "9".repeat(81));

		archive(day).andExpect(status().isOk())
			.andExpect(jsonPath("$.givens").value(givens))
			.andExpect(jsonPath("$.difficulty").value("EASY"))
			.andExpect(content().string(not(containsString("9".repeat(81)))));
	}

	@Test
	void todayLaterDatesAndDatesBeforeTheFirstDailyAreNotInTheArchive() throws Exception {
		for (LocalDate day : List.of(this.today, this.today.plusDays(1), this.today.plusYears(1),
				DailySchedule.FIRST_DAY.minusDays(1), LocalDate.of(2000, 1, 1))) {
			archive(day).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_IN_ARCHIVE"));
			startArchive(null, UUID.randomUUID(), day).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_IN_ARCHIVE"));
		}
		// Nothing was made or stored for them.
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM sudoku_daily_puzzles WHERE puzzle_date > ? OR puzzle_date < ?", Integer.class,
				this.today, DailySchedule.FIRST_DAY)).isZero();
		// The first Daily and yesterday are in it.
		archive(DailySchedule.FIRST_DAY).andExpect(status().isOk()).andExpect(jsonPath("$.puzzleNumber").value(1));
		archive(this.today.minusDays(1)).andExpect(status().isOk());
	}

	@Test
	void aDateThatIsNotADateIsABadRequest() throws Exception {
		for (String bad : List.of("yesterday", "2026-02-30", "2026-13-01", "20260105")) {
			this.mockMvc.perform(get("/api/sudoku/archive/{date}", bad)).andExpect(status().isBadRequest());
		}
		this.mockMvc.perform(post("/api/sudoku/archive/runs").header(PLAYER_HEADER, UUID.randomUUID())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")).andExpect(status().isBadRequest());
		this.mockMvc.perform(post("/api/sudoku/archive/runs").header(PLAYER_HEADER, UUID.randomUUID())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\":\"someday\"}")).andExpect(status().isBadRequest());
	}

	// --- Replays -------------------------------------------------------------------------------------

	@Test
	void aReplayIsAnUnrankedRunOfThatPuzzleWithNoSessionAndNoOfficialRun() throws Exception {
		LocalDate day = this.today.minusDays(3);
		UUID guest = UUID.randomUUID();
		String givens = JsonPath.read(archive(day).andReturn().getResponse().getContentAsString(), "$.givens");

		String body = startArchive(null, guest, day).andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value("ARCHIVE"))
			.andExpect(jsonPath("$.ranked").value(false))
			.andExpect(jsonPath("$.date").value(day.toString()))
			.andExpect(jsonPath("$.puzzleNumber").value(DailySchedule.puzzleNumber(day)))
			.andExpect(jsonPath("$.difficulty").value(DailySchedule.difficultyFor(day).name()))
			.andExpect(jsonPath("$.givens").value(givens))
			.andExpect(jsonPath("$.status").value("PLAYING"))
			.andExpect(jsonPath("$.mistakeRule").value("CONFLICT"))
			.andExpect(jsonPath("$.mistakeLimit").value(0))
			.andExpect(jsonPath("$.solution").value((Object) null))
			.andExpect(jsonPath("$.scored").value(false))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String runId = JsonPath.read(body, "$.id");

		Map<String, Object> row = this.jdbc.queryForMap("SELECT mode, ranked, session_id FROM sudoku_runs WHERE id = ?::uuid",
				runId);
		assertThat(row).containsEntry("mode", "ARCHIVE").containsEntry("ranked", false).containsEntry("session_id", null);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM sudoku_runs WHERE mode = 'DAILY' AND player_id = ?",
				Integer.class, guest)).isZero();
		// Today's Daily is untouched; the replay is the archive game in progress.
		as(get("/api/sudoku/today"), null, guest).andExpect(status().isOk())
			.andExpect(jsonPath("$.daily").value((Object) null))
			.andExpect(jsonPath("$.practice").value((Object) null))
			.andExpect(jsonPath("$.archive.id").value(runId))
			.andExpect(jsonPath("$.archive.solution").value((Object) null));
		// It can never be tied to a session, so it can never be scored.
		String session = startSession(null, guest, "daily");
		as(post("/api/sudoku/runs/{id}/session", runId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(session)), null, guest).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("RUN_NOT_RANKED"));
		// The database itself keeps archive runs unranked and sessionless.
		assertThatThrownBy(() -> this.jdbc.update("UPDATE sudoku_runs SET ranked = TRUE WHERE id = ?::uuid", runId))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> this.jdbc.update("UPDATE sudoku_runs SET session_id = ?::uuid WHERE id = ?::uuid",
				session, runId))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void aReplayPlaysWithMovesHintsAndPausesAndEndsWithTheSolutionButNoScoreRewardsOrStreak() throws Exception {
		LocalDate day = this.today.minusDays(2);
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		String statsBefore = as(get("/api/sudoku/stats"), player, null).andReturn().getResponse().getContentAsString();
		String historyBefore = as(get("/api/sudoku/daily/history"), player, null).andReturn()
			.getResponse()
			.getContentAsString();
		Map<String, Object> rewardsBefore = rewards(userId);

		String runId = JsonPath.read(startArchive(player, null, day).andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
		Puzzle puzzle = this.dailyPuzzles.stored(day).orElseThrow();
		int[] givens = Grid.parse(puzzle.givens());
		int[] solution = Grid.parse(puzzle.solution());
		List<int[]> rest = new ArrayList<>();
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (givens[cell] == 0) {
				rest.add(new int[] { cell, solution[cell] });
			}
		}
		// A digit, cleared again (an undo sends the same), a hint, a pause and a resume.
		int[] first = rest.get(0);
		moves(player, runId, List.of(new int[] { first[0], (first[1] % 9) + 1 }, new int[] { first[0], 0 }))
			.andExpect(status().isOk());
		as(post("/api/sudoku/runs/{id}/hints", runId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"type\":\"FIND\"}"), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.run.hintsUsed").value(1))
			.andExpect(jsonPath("$.hint.type").value("FIND"));
		as(post("/api/sudoku/runs/{id}/pause", runId), player, null).andExpect(jsonPath("$.paused").value(true))
			.andExpect(jsonPath("$.solution").value((Object) null));
		as(post("/api/sudoku/runs/{id}/resume", runId), player, null).andExpect(jsonPath("$.paused").value(false));

		moves(player, runId, rest).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("SOLVED"))
			.andExpect(jsonPath("$.ranked").value(false))
			.andExpect(jsonPath("$.result").value((Object) null))
			.andExpect(jsonPath("$.solution").value(puzzle.solution()))
			.andExpect(jsonPath("$.hintsUsed").value(1));

		// No official run, session, score or leaderboard place; no XP, coins, achievements, challenge
		// progress; the statistics, streaks and Daily history are as they were.
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM sudoku_runs WHERE user_id = ? AND (mode = 'DAILY' OR ranked OR session_id IS NOT NULL)",
				Integer.class, userId)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM game_sessions WHERE user_id = ?", Integer.class,
				userId)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE user_id = ?", Integer.class, userId))
			.isZero();
		assertThat(rewards(userId)).isEqualTo(rewardsBefore);
		as(get("/api/sudoku/stats"), player, null).andExpect(content().json(statsBefore, true))
			.andExpect(jsonPath("$.currentStreak").value(0))
			.andExpect(jsonPath("$.daily.played").value(0));
		as(get("/api/sudoku/daily/history"), player, null).andExpect(content().json(historyBefore, true));
		as(get("/api/sudoku/daily/leaderboard").param("date", day.toString()), player, null)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.myScore").value((Object) null));
		as(get("/api/sudoku/today"), player, null).andExpect(jsonPath("$.archive").value((Object) null));
	}

	@Test
	void aPuzzleCanBeReplayedAgainAndAgainAndANewReplayLeavesOnlyTheLastOne() throws Exception {
		LocalDate day = this.today.minusDays(5);
		UUID guest = UUID.randomUUID();
		String firstRun = runId(startArchive(null, guest, day).andExpect(status().isCreated()));
		String secondRun = runId(startArchive(null, guest, day).andExpect(status().isCreated()));
		String otherDay = runId(startArchive(null, guest, day.minusDays(1)).andExpect(status().isCreated()));
		String thirdRun = runId(startArchive(null, guest, day).andExpect(status().isCreated()));
		assertThat(List.of(firstRun, secondRun, otherDay, thirdRun)).doesNotHaveDuplicates();
		assertThat(statusOf(firstRun)).isEqualTo("ABANDONED");
		assertThat(statusOf(secondRun)).isEqualTo("ABANDONED");
		assertThat(statusOf(otherDay)).isEqualTo("ABANDONED");
		assertThat(statusOf(thirdRun)).isEqualTo("PLAYING");
		as(get("/api/sudoku/today"), null, guest).andExpect(jsonPath("$.archive.id").value(thirdRun));
		// A left replay takes no more moves.
		as(post("/api/sudoku/runs/{id}/moves", firstRun).contentType(MediaType.APPLICATION_JSON)
			.content("{\"moves\":[{\"cell\":0,\"digit\":0}]}"), null, guest).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("RUN_OVER"));
	}

	@Test
	void aReplayLeavesTheDailyAndPracticeGamesAloneAndTodaysDailyStillStartsRanked() throws Exception {
		UUID guest = UUID.randomUUID();
		String practice = runId(as(post("/api/sudoku/practice/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"difficulty\":\"EASY\"}"), null, guest).andExpect(status().isCreated()));
		String replay = runId(startArchive(null, guest, this.today.minusDays(1)).andExpect(status().isCreated()));

		as(get("/api/sudoku/today"), null, guest).andExpect(jsonPath("$.practice.id").value(practice))
			.andExpect(jsonPath("$.practice.status").value("PLAYING"))
			.andExpect(jsonPath("$.archive.id").value(replay))
			.andExpect(jsonPath("$.daily").value((Object) null));

		// Today's Daily, ranked as ever, with its session.
		String session = startSession(null, guest, "daily");
		as(post("/api/sudoku/daily/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(session)), null, guest).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("DAILY"))
			.andExpect(jsonPath("$.ranked").value(true))
			.andExpect(jsonPath("$.date").value(this.today.toString()))
			.andExpect(jsonPath("$.mistakeRule").value("SOLUTION"))
			.andExpect(jsonPath("$.mistakeLimit").value(3));
		// A new practice game leaves the replay alone too.
		as(post("/api/sudoku/practice/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"difficulty\":\"MEDIUM\"}"), null, guest).andExpect(status().isCreated());
		assertThat(statusOf(replay)).isEqualTo("PLAYING");
		assertThat(statusOf(practice)).isEqualTo("ABANDONED");
	}

	@Test
	void aDayWhoseRankedDailyIsStillInPlayCannotBeReplayedUntilItIsOver() throws Exception {
		LocalDate yesterday = this.today.minusDays(1);
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		Puzzle puzzle = this.dailyPuzzles.forDay(yesterday);
		UUID official = UUID.randomUUID();
		// Started before midnight UTC and still being played: it may still be finished, and ranked.
		this.jdbc.update("""
				INSERT INTO sudoku_runs (id, mode, ranked, difficulty, puzzle_date, puzzle_number, seed, givens, solution,
				                         actions, status, mistakes, hints, streak, user_id, started_at)
				VALUES (?, 'DAILY', TRUE, ?, ?, ?, ?, ?, ?, '', 'PLAYING', 0, 0, 0, ?, now() - interval '1 hour')
				""", official, puzzle.difficulty().name(), yesterday, DailySchedule.puzzleNumber(yesterday),
				puzzle.seed(), puzzle.givens(), puzzle.solution(), userId);

		startArchive(player, null, yesterday).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DAILY_IN_PROGRESS"));
		// Its clues alone are no secret: the player has them on the board already.
		archive(yesterday).andExpect(status().isOk());
		// Other days are fine.
		startArchive(player, null, yesterday.minusDays(1)).andExpect(status().isCreated());

		this.jdbc.update("UPDATE sudoku_runs SET status = 'FAILED', finished_at = now() WHERE id = ?", official);
		startArchive(player, null, yesterday).andExpect(status().isCreated());
		// The official run is still the only daily run of that day.
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM sudoku_runs WHERE user_id = ? AND mode = 'DAILY' AND puzzle_date = ?", Integer.class,
				userId, yesterday)).isOne();
	}

	@Test
	void aGuestNeedsTheirPlayerIdToStartAReplay() throws Exception {
		this.mockMvc.perform(post("/api/sudoku/archive/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\":\"%s\"}".formatted(this.today.minusDays(1))))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("PLAYER_ID_REQUIRED"));
	}

	// --- Helpers -------------------------------------------------------------------------------------

	private ResultActions archive(LocalDate day) throws Exception {
		return this.mockMvc.perform(get("/api/sudoku/archive/{date}", day.toString()));
	}

	private ResultActions startArchive(MockHttpSession session, UUID guest, LocalDate day) throws Exception {
		return as(post("/api/sudoku/archive/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\":\"%s\"}".formatted(day)), session, guest);
	}

	private ResultActions moves(MockHttpSession session, String runId, List<int[]> moves) throws Exception {
		String json = moves.stream()
			.map((move) -> "{\"cell\":%d,\"digit\":%d}".formatted(move[0], move[1]))
			.reduce((a, b) -> a + "," + b)
			.orElse("");
		return as(post("/api/sudoku/runs/{id}/moves", runId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"moves\":[" + json + "]}"), session, null);
	}

	private ResultActions as(MockHttpServletRequestBuilder request, MockHttpSession session, UUID guest)
			throws Exception {
		if (session != null) {
			request.session(session);
		}
		if (guest != null) {
			request.header(PLAYER_HEADER, guest);
		}
		return this.mockMvc.perform(request);
	}

	private String startSession(MockHttpSession session, UUID guest, String mode) throws Exception {
		String body = as(post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"sudoku\",\"mode\":\"%s\"}".formatted(mode)), session, guest)
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private static String runId(ResultActions started) throws Exception {
		return JsonPath.read(started.andReturn().getResponse().getContentAsString(), "$.id");
	}

	private String statusOf(String runId) {
		return this.jdbc.queryForObject("SELECT status FROM sudoku_runs WHERE id = ?::uuid", String.class, runId);
	}

	/** Everything a finished game could pay: XP, coins, achievements and challenge progress. */
	private Map<String, Object> rewards(long userId) {
		return this.jdbc.queryForMap("""
				SELECT (SELECT xp FROM users WHERE id = :id) AS xp,
				       (SELECT count(*) FROM coin_transactions WHERE user_id = :id) AS coins,
				       (SELECT count(*) FROM user_achievements WHERE user_id = :id) AS achievements,
				       (SELECT count(*) FROM daily_challenge_progress WHERE user_id = :id) AS challenges
				""".replace(":id", Long.toString(userId)));
	}

}
