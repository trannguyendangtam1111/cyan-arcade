package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.sudoku.SudokuRunStore.DailyRun;
import com.cyan.arcade.sudoku.SudokuViews.DailyHistoryResponse;
import com.cyan.arcade.sudoku.SudokuViews.DayStatus;
import com.cyan.arcade.sudoku.SudokuViews.HistoryDay;
import com.cyan.arcade.sudoku.daily.DailySchedule;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A signed-in player's Daily Sudoku, date by date, for the last {@value #DAYS} UTC dates up to
 * today: completed, failed, still in progress, or not attempted. It reads the server's records of
 * the player's own runs (one query for the whole span), and nothing the browser says. Streaks are
 * not worked out here: the statistics keep doing that, as before.
 */
@Service
class DailyHistory {

	static final int DAYS = 30;

	private final SudokuRunStore store;

	private final Clock clock;

	DailyHistory(SudokuRunStore store, Clock clock) {
		this.store = store;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public DailyHistoryResponse of(long userId) {
		LocalDate today = DailySchedule.today(this.clock);
		LocalDate from = today.minusDays(DAYS - 1);
		Map<LocalDate, DailyRun> runs = this.store.dailyRuns(userId, from, today)
			.stream()
			.collect(Collectors.toMap(DailyRun::puzzleDate, Function.identity()));
		List<HistoryDay> days = new ArrayList<>(DAYS);
		for (LocalDate date = from; !date.isAfter(today); date = date.plusDays(1)) {
			days.add(day(date, runs.get(date)));
		}
		return new DailyHistoryResponse(from, today, days);
	}

	private static HistoryDay day(LocalDate date, DailyRun run) {
		if (!DailySchedule.hasPuzzle(date)) {
			return new HistoryDay(date, null, null, DayStatus.NO_PUZZLE, null, null, null, null);
		}
		int number = DailySchedule.puzzleNumber(date);
		if (run == null) {
			return new HistoryDay(date, number, DailySchedule.difficultyFor(date), DayStatus.NOT_ATTEMPTED, null, null,
					null, null);
		}
		DayStatus status = switch (run.status()) {
			case SOLVED -> DayStatus.COMPLETED;
			case FAILED -> DayStatus.FAILED;
			// A daily run is never abandoned; were one, it was started and not finished.
			case PLAYING, ABANDONED -> DayStatus.IN_PROGRESS;
		};
		boolean over = status == DayStatus.COMPLETED || status == DayStatus.FAILED;
		Integer seconds = (over && run.activeMs() != null) ? (int) (run.activeMs() / 1000) : null;
		return new HistoryDay(date, number, run.difficulty(), status, seconds, run.mistakes(), run.hints(),
				(status == DayStatus.COMPLETED) ? run.streak() : null);
	}

}
