package com.cyan.arcade.sudoku.daily;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Puzzle;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** Daily Sudoku: the date alone decides the puzzle, in UTC. */
class DailyScheduleTests {

	@Test
	void theDayIsTheUtcDay() {
		// 23:30 in New York on the 8th is already the 9th in UTC.
		Clock lateInNewYork = Clock.fixed(Instant.parse("2026-10-09T03:30:00Z"), ZoneId.of("America/New_York"));
		assertThat(DailySchedule.today(lateInNewYork)).isEqualTo(LocalDate.of(2026, 10, 9));
		assertThat(DailySchedule.nextPuzzleAt(lateInNewYork)).isEqualTo(Instant.parse("2026-10-10T00:00:00Z"));
		assertThat(DailySchedule.today(Clock.fixed(Instant.parse("2026-10-09T23:59:59Z"), ZoneOffset.UTC)))
			.isEqualTo(LocalDate.of(2026, 10, 9));
	}

	@Test
	void puzzlesAreNumberedFromTheFirstDay() {
		assertThat(DailySchedule.puzzleNumber(DailySchedule.FIRST_DAY)).isEqualTo(1);
		assertThat(DailySchedule.puzzleNumber(LocalDate.of(2026, 10, 9))).isEqualTo(282);
		assertThat(DailySchedule.hasPuzzle(DailySchedule.FIRST_DAY.minusDays(1))).isFalse();
		assertThatIllegalArgumentException().isThrownBy(() -> DailySchedule.seedFor(LocalDate.of(2025, 12, 31)));
	}

	@Test
	void theWeekdaySetsTheDifficulty() {
		// 2026-10-05 is a Monday.
		LocalDate monday = LocalDate.of(2026, 10, 5);
		assertThat(DailySchedule.difficultyFor(monday)).isEqualTo(Difficulty.EASY);
		assertThat(DailySchedule.difficultyFor(monday.plusDays(1))).isEqualTo(Difficulty.MEDIUM);
		assertThat(DailySchedule.difficultyFor(monday.plusDays(3))).isEqualTo(Difficulty.HARD);
		assertThat(DailySchedule.difficultyFor(monday.plusDays(5))).isEqualTo(Difficulty.EXPERT);
		assertThat(DailySchedule.difficultyFor(monday.plusDays(6))).isEqualTo(Difficulty.EASY);
	}

	@Test
	void aDaysPuzzleIsAlwaysTheSameAndOtherDaysDiffer() {
		LocalDate day = LocalDate.of(2026, 10, 9);
		Puzzle puzzle = DailySchedule.generate(day);
		assertThat(DailySchedule.generate(day)).isEqualTo(puzzle);
		assertThat(puzzle.difficulty()).isEqualTo(DailySchedule.difficultyFor(day));
		assertThat(puzzle.seed()).isEqualTo(DailySchedule.seedFor(day));
		assertThat(DailySchedule.generate(day.plusDays(7)).givens()).isNotEqualTo(puzzle.givens());
		assertThat(DailySchedule.seedFor(day)).isNotEqualTo(DailySchedule.seedFor(day.plusDays(1)));
		// Pinned: puzzle #1, under generator version 1.
		assertThat(DailySchedule.generate(DailySchedule.FIRST_DAY).givens())
			.isEqualTo("000050200050001093002000087270630050005000700040015062810000600520400070006020000");
	}

	@Test
	void aWholeYearOfDailyPuzzlesCanBeMade() {
		LocalDate day = DailySchedule.FIRST_DAY;
		for (int index = 0; index < 366; index++, day = day.plusDays(1)) {
			assertThat(DailySchedule.generate(day).difficulty()).isEqualTo(DailySchedule.difficultyFor(day));
		}
	}

}
