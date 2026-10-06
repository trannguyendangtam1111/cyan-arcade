package com.cyan.arcade.common.platform;

import java.time.Instant;
import java.util.List;

/**
 * Numbers a module keeps about what players do in it, for the profile and the admin dashboard.
 * Implement it as a bean and they appear there, without the platform knowing the module.
 */
public interface ActivityStatistics {

	/** One player's numbers. Their {@code today} is {@code null}. */
	List<Statistic> forPlayer(Long userId);

	/** Everyone's numbers, all time and since the start of today. */
	List<Statistic> overall(Instant startOfToday);

	/**
	 * @param key stable identifier, e.g. {@code tcg.packsOpened}
	 * @param label what to call it on screen
	 * @param today the part of {@code value} since the start of today, or {@code null} when not asked
	 */
	record Statistic(String key, String label, long value, Long today) {
	}

}
