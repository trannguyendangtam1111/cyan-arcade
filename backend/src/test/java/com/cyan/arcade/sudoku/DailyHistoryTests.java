package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.sudoku.SudokuViews.DailyHistoryResponse;
import com.cyan.arcade.sudoku.SudokuViews.DayStatus;
import com.cyan.arcade.sudoku.SudokuViews.HistoryDay;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Difficulty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The Daily Sudoku history: each of the last 30 UTC dates, from the server's own run records, for
 * the signed-in player only. Runs are written straight to the table, so each status and number is
 * exactly what the test says.
 */
@IntegrationTest
class DailyHistoryTests {

	private static final String HISTORY = "/api/sudoku/daily/history";

	/** Any 81 digits do: nothing here plays the board. */
	private static final String GRID = "1".repeat(81);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private SudokuRunStore store;

	@Autowired
	private Clock clock;

	private LocalDate today;

	@BeforeEach
	void setUp() {
		this.today = DailySchedule.today(this.clock);
	}

	@Test
	void anonymousCallersAndGuestsAreRefused() throws Exception {
		this.mockMvc.perform(get(HISTORY))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
		// A guest's id is only a header anyone could send: no history for it.
		this.mockMvc.perform(get(HISTORY).header("X-Player-Id", UUID.randomUUID().toString()))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void aPlayerWithNoRunsHasThirtyDaysNotAttempted() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		history(player).andExpect(status().isOk())
			.andExpect(jsonPath("$.today").value(this.today.toString()))
			.andExpect(jsonPath("$.from").value(this.today.minusDays(29).toString()))
			.andExpect(jsonPath("$.days", hasSize(30)))
			.andExpect(jsonPath("$.days[0].date").value(this.today.minusDays(29).toString()))
			.andExpect(jsonPath("$.days[29].date").value(this.today.toString()))
			.andExpect(jsonPath("$.days[*].status", everyItem(is("NOT_ATTEMPTED"))))
			.andExpect(jsonPath("$.days[*].seconds", everyItem(nullValue())))
			.andExpect(jsonPath("$.days[*].mistakes", everyItem(nullValue())))
			.andExpect(jsonPath("$.days[29].puzzleNumber").value(DailySchedule.puzzleNumber(this.today)))
			.andExpect(jsonPath("$.days[29].difficulty").value(DailySchedule.difficultyFor(this.today).name()));
	}

	@Test
	void eachRunLandsOnItsPuzzleDateWithItsStatusAndNumbers() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		// Today: started, not over. Two days back: solved in 125 s less a 5 s pause. Five back: failed.
		dailyRun(userId, this.today, Difficulty.HARD, "PLAYING", 2, 1, 0, null, 0);
		dailyRun(userId, this.today.minusDays(2), Difficulty.EASY, "SOLVED", 1, 2, 4, 125_000L, 5_000);
		dailyRun(userId, this.today.minusDays(5), Difficulty.EXPERT, "FAILED", 3, 0, 0, 61_900L, 0);
		// Outside the window, and a practice game: neither shows.
		dailyRun(userId, this.today.minusDays(30), Difficulty.EASY, "SOLVED", 0, 0, 1, 60_000L, 0);
		practiceRun(userId);

		history(player).andExpect(status().isOk())
			.andExpect(jsonPath("$.days", hasSize(30)))
			.andExpect(jsonPath("$.days[29].status").value("IN_PROGRESS"))
			.andExpect(jsonPath("$.days[29].difficulty").value("HARD"))
			.andExpect(jsonPath("$.days[29].mistakes").value(2))
			.andExpect(jsonPath("$.days[29].hints").value(1))
			.andExpect(jsonPath("$.days[29].seconds").value(nullValue()))
			.andExpect(jsonPath("$.days[29].streak").value(nullValue()))
			.andExpect(jsonPath("$.days[27].date").value(this.today.minusDays(2).toString()))
			.andExpect(jsonPath("$.days[27].status").value("COMPLETED"))
			.andExpect(jsonPath("$.days[27].difficulty").value("EASY"))
			.andExpect(jsonPath("$.days[27].puzzleNumber").value(DailySchedule.puzzleNumber(this.today.minusDays(2))))
			.andExpect(jsonPath("$.days[27].seconds").value(120))
			.andExpect(jsonPath("$.days[27].mistakes").value(1))
			.andExpect(jsonPath("$.days[27].hints").value(2))
			.andExpect(jsonPath("$.days[27].streak").value(4))
			.andExpect(jsonPath("$.days[24].status").value("FAILED"))
			.andExpect(jsonPath("$.days[24].difficulty").value("EXPERT"))
			.andExpect(jsonPath("$.days[24].seconds").value(61))
			.andExpect(jsonPath("$.days[24].mistakes").value(3))
			.andExpect(jsonPath("$.days[24].streak").value(nullValue()))
			.andExpect(jsonPath("$.days[28].status").value("NOT_ATTEMPTED"))
			.andExpect(jsonPath("$.days[0].status").value("NOT_ATTEMPTED"))
			.andExpect(jsonPath("$.days[?(@.status != 'NOT_ATTEMPTED')]", hasSize(3)));
	}

	@Test
	void aPlayerSeesOnlyTheirOwnRuns() throws Exception {
		MockHttpSession alice = Players.register(this.mockMvc);
		MockHttpSession bob = Players.register(this.mockMvc);
		dailyRun(Players.userId(this.mockMvc, bob), this.today.minusDays(3), Difficulty.MEDIUM, "SOLVED", 0, 0, 1,
				90_000L, 0);

		history(alice).andExpect(jsonPath("$.days[*].status", everyItem(is("NOT_ATTEMPTED"))));
		history(bob).andExpect(jsonPath("$.days[26].status").value("COMPLETED"))
			.andExpect(jsonPath("$.days[?(@.status != 'NOT_ATTEMPTED')]", hasSize(1)));
	}

	@Test
	void theHistoryLeavesTheStreaksAsTheStatisticsCountThem() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		// Solved yesterday and the day before, failed the day before that, three solved earlier on.
		dailyRun(userId, this.today.minusDays(1), Difficulty.EASY, "SOLVED", 0, 0, 5, 60_000L, 0);
		dailyRun(userId, this.today.minusDays(2), Difficulty.EASY, "SOLVED", 0, 0, 4, 60_000L, 0);
		dailyRun(userId, this.today.minusDays(3), Difficulty.EASY, "FAILED", 3, 0, 0, 60_000L, 0);
		for (int back = 4; back <= 6; back++) {
			dailyRun(userId, this.today.minusDays(back), Difficulty.EASY, "SOLVED", 0, 0, 7 - back, 60_000L, 0);
		}

		stats(player).andExpect(jsonPath("$.currentStreak").value(2)).andExpect(jsonPath("$.bestStreak").value(3));
		history(player).andExpect(status().isOk())
			.andExpect(jsonPath("$.days[?(@.status == 'COMPLETED')]", hasSize(5)));
		// Asking for the history changes nothing.
		stats(player).andExpect(jsonPath("$.currentStreak").value(2))
			.andExpect(jsonPath("$.bestStreak").value(3))
			.andExpect(jsonPath("$.daily.played").value(6))
			.andExpect(jsonPath("$.daily.completed").value(5));
	}

	@Test
	void datesFollowUtcAndDaysBeforeTheFirstDailyHaveNoPuzzle() throws Exception {
		long userId = Players.userId(this.mockMvc, Players.register(this.mockMvc));
		LocalDate day = DailySchedule.FIRST_DAY.plusDays(9);
		dailyRun(userId, day, Difficulty.EASY, "SOLVED", 0, 0, 1, 60_000L, 0);
		dailyRun(userId, day.plusDays(1), Difficulty.EASY, "SOLVED", 0, 0, 2, 60_000L, 0);

		// The last millisecond of the tenth Daily's UTC day, and the first of the next.
		Instant lastMoment = day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().minusMillis(1);
		DailyHistoryResponse late = new DailyHistory(this.store, Clock.fixed(lastMoment, ZoneOffset.UTC)).of(userId);
		assertThat(late.today()).isEqualTo(day);
		assertThat(late.from()).isEqualTo(day.minusDays(29));
		List<HistoryDay> days = late.days();
		assertThat(days).hasSize(30);
		assertThat(days.subList(0, 20)).allSatisfy((none) -> {
			assertThat(none.status()).isEqualTo(DayStatus.NO_PUZZLE);
			assertThat(none.puzzleNumber()).isNull();
			assertThat(none.difficulty()).isNull();
			assertThat(none.date()).isBefore(DailySchedule.FIRST_DAY);
		});
		assertThat(days.get(20).date()).isEqualTo(DailySchedule.FIRST_DAY);
		assertThat(days.get(20).puzzleNumber()).isEqualTo(1);
		assertThat(days.get(20).status()).isEqualTo(DayStatus.NOT_ATTEMPTED);
		assertThat(days.get(29).status()).isEqualTo(DayStatus.COMPLETED);
		assertThat(days.get(29).puzzleNumber()).isEqualTo(10);
		// The next day's run is not in a history that ends before its day.
		assertThat(days).extracting(HistoryDay::streak).containsOnlyOnce(1).doesNotContain(2);

		DailyHistoryResponse next = new DailyHistory(this.store, Clock.fixed(lastMoment.plusMillis(1), ZoneOffset.UTC))
			.of(userId);
		assertThat(next.today()).isEqualTo(day.plusDays(1));
		assertThat(next.days().get(29).streak()).isEqualTo(2);
		assertThat(next.days().get(28).streak()).isEqualTo(1);
		assertThat(next.days()).filteredOn((d) -> d.status() == DayStatus.NO_PUZZLE).hasSize(19);
	}

	private ResultActions history(MockHttpSession player) throws Exception {
		return this.mockMvc.perform(get(HISTORY).session(player));
	}

	private ResultActions stats(MockHttpSession player) throws Exception {
		return this.mockMvc.perform(get("/api/sudoku/stats").session(player)).andExpect(status().isOk());
	}

	/**
	 * A daily run of the given date. {@code activeMs} is the span from start to finish, {@code null}
	 * for a run still being played.
	 */
	private void dailyRun(long userId, LocalDate date, Difficulty difficulty, String status, int mistakes, int hints,
			int streak, Long activeMs, long pausedMs) {
		OffsetDateTime started = OffsetDateTime.now(ZoneOffset.UTC).minusHours(1);
		OffsetDateTime finished = (activeMs != null) ? started.plusNanos(activeMs * 1_000_000) : null;
		this.jdbc.update("""
				INSERT INTO sudoku_runs (id, mode, ranked, difficulty, puzzle_date, puzzle_number, seed, givens, solution,
				                         actions, status, mistakes, hints, streak, user_id, started_at, finished_at, paused_ms)
				VALUES (?, 'DAILY', TRUE, ?, ?, ?, 1, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
				""", UUID.randomUUID(), difficulty.name(), date, DailySchedule.puzzleNumber(date), GRID, GRID, status,
				mistakes, hints, streak, userId, started, finished, pausedMs);
	}

	private void practiceRun(long userId) {
		OffsetDateTime started = OffsetDateTime.now(ZoneOffset.UTC).minusHours(1);
		this.jdbc.update("""
				INSERT INTO sudoku_runs (id, mode, ranked, difficulty, seed, givens, solution, actions, status, mistakes,
				                         hints, streak, user_id, started_at, finished_at)
				VALUES (?, 'PRACTICE', TRUE, 'EASY', 1, ?, ?, '', 'SOLVED', 0, 0, 0, ?, ?, ?)
				""", UUID.randomUUID(), GRID, GRID, userId, started, started.plusMinutes(2));
	}

}
