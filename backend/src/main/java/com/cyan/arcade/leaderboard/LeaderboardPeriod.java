package com.cyan.arcade.leaderboard;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;

/**
 * Which scores a leaderboard counts, by when they were set. Every boundary is computed on the
 * server, in UTC, whatever the server's or the player's own time zone: a day runs from 00:00 to
 * 00:00 UTC, and a week from Monday 00:00 UTC to the next Monday 00:00 UTC (ISO weeks).
 */
public enum LeaderboardPeriod {

	/** Scores set today (UTC). */
	DAILY,

	/** Scores set this week, from Monday 00:00 UTC. */
	WEEKLY,

	/** Every score. */
	ALL_TIME;

	/**
	 * The window this period covers at a moment.
	 * @param start the first moment counted, or {@code null} for all time
	 * @param end the first moment no longer counted (when the next one starts), or {@code null}
	 */
	public record Window(Instant start, Instant end) {

		boolean contains(Instant instant) {
			return (this.start == null || !instant.isBefore(this.start)) && (this.end == null || instant.isBefore(this.end));
		}

	}

	public Window windowAt(Instant now) {
		LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
		return switch (this) {
			case DAILY -> window(today, today.plusDays(1));
			case WEEKLY -> {
				LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
				yield window(monday, monday.plusWeeks(1));
			}
			case ALL_TIME -> new Window(null, null);
		};
	}

	private static Window window(LocalDate first, LocalDate next) {
		return new Window(first.atStartOfDay(ZoneOffset.UTC).toInstant(), next.atStartOfDay(ZoneOffset.UTC).toInstant());
	}

}
