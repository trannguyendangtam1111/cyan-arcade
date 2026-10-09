package com.cyan.arcade.wordle.engine;

import java.time.LocalDate;
import java.util.Map;
import java.util.TreeMap;

/**
 * Daily streaks, counted in UTC calendar days from a player's finished daily puzzles: each day maps
 * to whether that day's puzzle was solved. A day can only appear once (one daily puzzle per day),
 * so playing again cannot count a day twice. A failed puzzle or a day without one ends a streak.
 */
public final class Streaks {

	private Streaks() {
	}

	/** Solved days in a row ending with {@code day}: 0 when that day was not solved. */
	public static int endingOn(Map<LocalDate, Boolean> results, LocalDate day) {
		int streak = 0;
		for (LocalDate cursor = day; Boolean.TRUE.equals(results.get(cursor)); cursor = cursor.minusDays(1)) {
			streak++;
		}
		return streak;
	}

	/**
	 * The streak a player has today: today's when today's puzzle is finished (0 if failed), otherwise
	 * the one that ended yesterday, which today's puzzle can still extend.
	 */
	public static int current(Map<LocalDate, Boolean> results, LocalDate today) {
		return results.containsKey(today) ? endingOn(results, today) : endingOn(results, today.minusDays(1));
	}

	/** The longest streak in the results. */
	public static int best(Map<LocalDate, Boolean> results) {
		int best = 0;
		int streak = 0;
		LocalDate previous = null;
		for (Map.Entry<LocalDate, Boolean> day : new TreeMap<>(results).entrySet()) {
			boolean continues = previous != null && day.getKey().equals(previous.plusDays(1));
			streak = day.getValue() ? (continues ? streak + 1 : 1) : 0;
			best = Math.max(best, streak);
			previous = day.getKey();
		}
		return best;
	}

}
