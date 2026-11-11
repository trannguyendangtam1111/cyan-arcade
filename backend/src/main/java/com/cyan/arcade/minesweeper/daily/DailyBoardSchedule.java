package com.cyan.arcade.minesweeper.daily;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * The Daily Board's calendar: one board per UTC date, the same for every signed-in player, a new one
 * at 00:00 UTC. A day's board is 16 × 16 with 40 mines, laid once around an opening cell the server
 * picks, so every attempt that day starts from the same uncovered opening on the same mines.
 *
 * <p>An attempt belongs to the date it was started on. One started shortly before midnight may still
 * be finished after it, within {@link #TIME_LIMIT}, and its result counts on the day it was started;
 * a start after midnight is the next day's attempt. An attempt not finished within the limit is over,
 * unranked.
 */
final class DailyBoardSchedule {

	/** Daily Board #1. */
	static final LocalDate FIRST_DAY = LocalDate.of(2026, 11, 1);

	/** Every day's board. */
	static final DailyBoard BOARD = new DailyBoard(16, 16, 40);

	/**
	 * How long an attempt may take, from its start: just under the 1000 seconds a Minesweeper counter
	 * shows. It also bounds how long after midnight the previous day's leaderboard can still change.
	 */
	static final Duration TIME_LIMIT = Duration.ofMillis(999_999);

	/**
	 * How a date becomes a board ({@code DailySeeds.boardFor}). Stored with each board, so a later way of
	 * making them can tell the boards made before it. Version 1 (V30) laid mines per attempt.
	 */
	static final int LAYOUT_VERSION = 2;

	/** XP for a won attempt. */
	static final int WIN_XP = 10;

	/** Coins for a won attempt, within the daily limit of paid games every finished game shares. */
	static final int WIN_COINS = 5;

	private DailyBoardSchedule() {
	}

	/** Today in UTC, at that moment. */
	static LocalDate dateAt(Instant now) {
		return LocalDate.ofInstant(now, ZoneOffset.UTC);
	}

	static LocalDate today(Clock clock) {
		return dateAt(clock.instant());
	}

	/** The coming 00:00 UTC, when the next board comes out. */
	static Instant nextBoardAt(Instant now) {
		return dateAt(now).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
	}

	static boolean hasBoard(LocalDate date) {
		return !date.isBefore(FIRST_DAY);
	}

	static int boardNumber(LocalDate date) {
		if (!hasBoard(date)) {
			throw new IllegalArgumentException("The Daily Board starts on " + FIRST_DAY);
		}
		return Math.toIntExact(ChronoUnit.DAYS.between(FIRST_DAY, date)) + 1;
	}

}
