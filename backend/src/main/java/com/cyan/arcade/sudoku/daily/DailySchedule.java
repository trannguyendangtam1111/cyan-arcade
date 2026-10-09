package com.cyan.arcade.sudoku.daily;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.cyan.arcade.sudoku.engine.Rng;

/**
 * Daily Sudoku: one puzzle per UTC calendar day, the same for everyone. The date alone decides it:
 * its difficulty comes from the day of the week (easy on Mondays and Sundays, Expert on Saturdays)
 * and its seed from the date, so any day's puzzle can be made again at any time.
 *
 * <p>The server stores each day's puzzle the first time it is asked for, and from then on serves
 * the stored one: a later {@link Generator#VERSION} turns seeds into other puzzles, but never changes
 * a day that has been played.
 */
public final class DailySchedule {

	/** Daily Sudoku #1. */
	public static final LocalDate FIRST_DAY = LocalDate.of(2026, 1, 1);

	private static final long SEED_SALT = 0x5D0C_0DA1_1E5L;

	private static final Map<DayOfWeek, Difficulty> BY_WEEKDAY = Map.of(DayOfWeek.MONDAY, Difficulty.EASY,
			DayOfWeek.TUESDAY, Difficulty.MEDIUM, DayOfWeek.WEDNESDAY, Difficulty.MEDIUM, DayOfWeek.THURSDAY,
			Difficulty.HARD, DayOfWeek.FRIDAY, Difficulty.HARD, DayOfWeek.SATURDAY, Difficulty.EXPERT, DayOfWeek.SUNDAY,
			Difficulty.EASY);

	private DailySchedule() {
	}

	/** Today in UTC, by the given clock. */
	public static LocalDate today(Clock clock) {
		return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
	}

	/** The coming UTC midnight, when the next puzzle comes out. */
	public static Instant nextPuzzleAt(Clock clock) {
		return today(clock).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
	}

	public static boolean hasPuzzle(LocalDate day) {
		return !day.isBefore(FIRST_DAY);
	}

	public static int puzzleNumber(LocalDate day) {
		requirePuzzle(day);
		return Math.toIntExact(ChronoUnit.DAYS.between(FIRST_DAY, day)) + 1;
	}

	public static Difficulty difficultyFor(LocalDate day) {
		return BY_WEEKDAY.get(day.getDayOfWeek());
	}

	public static long seedFor(LocalDate day) {
		requirePuzzle(day);
		return Rng.mix(SEED_SALT, day.toEpochDay());
	}

	/** Makes that day's puzzle with the current generator. */
	public static Puzzle generate(LocalDate day) {
		return Generator.generate(difficultyFor(day), seedFor(day));
	}

	private static void requirePuzzle(LocalDate day) {
		if (!hasPuzzle(day)) {
			throw new IllegalArgumentException("Daily Sudoku starts on " + FIRST_DAY);
		}
	}

}
