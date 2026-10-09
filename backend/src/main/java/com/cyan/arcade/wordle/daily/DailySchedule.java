package com.cyan.arcade.wordle.daily;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * The Daily Word: one puzzle per UTC calendar day, the same for everyone. Day 1 is
 * {@link #FIRST_DAY}, and day N's word is the N-th answer in the list's schedule order (wrapping
 * round once every answer has had its day). Nothing random and nothing per player: the date alone
 * decides, so any past day's puzzle can be worked out again at any time.
 */
public final class DailySchedule {

	/** Puzzle #1. */
	public static final LocalDate FIRST_DAY = LocalDate.of(2026, 1, 1);

	private final List<String> answers;

	/** @param answers the answers in schedule order (see {@code wordle/answers.txt}) */
	public DailySchedule(List<String> answers) {
		if (answers.isEmpty()) {
			throw new IllegalArgumentException("The schedule needs answers");
		}
		this.answers = List.copyOf(answers);
	}

	/** Today in UTC, by the given clock: the day whose puzzle is being played. */
	public static LocalDate today(Clock clock) {
		return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
	}

	/** When the next day's puzzle comes out: the coming UTC midnight. */
	public static Instant nextPuzzleAt(Clock clock) {
		return today(clock).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
	}

	public boolean hasPuzzle(LocalDate day) {
		return !day.isBefore(FIRST_DAY);
	}

	/** The puzzle's number, counting {@link #FIRST_DAY} as 1. */
	public int puzzleNumber(LocalDate day) {
		requirePuzzle(day);
		return Math.toIntExact(ChronoUnit.DAYS.between(FIRST_DAY, day)) + 1;
	}

	/** That day's word. */
	public String answerFor(LocalDate day) {
		return this.answers.get(Math.floorMod(puzzleNumber(day) - 1, this.answers.size()));
	}

	private void requirePuzzle(LocalDate day) {
		if (!hasPuzzle(day)) {
			throw new IllegalArgumentException("The Daily Word starts on " + FIRST_DAY);
		}
	}

}
