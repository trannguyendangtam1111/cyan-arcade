package com.cyan.arcade.tcg.opening;

import java.time.Instant;

/**
 * How many packs a player may still open today.
 *
 * @param dailyLimit packs per day, or {@code null} when there is no limit
 * @param openedToday packs the player has opened since midnight UTC
 * @param leftToday packs the player may still open today, or {@code null} when there is no limit
 * @param bonusPacks extra packs the player has (e.g. bought in the shop), opened once
 * {@code leftToday} reaches 0; always 0 when there is no limit, as they are not needed then
 * @param resetsAt when the count starts again
 */
public record AllowanceResponse(Integer dailyLimit, long openedToday, Integer leftToday, int bonusPacks,
		Instant resetsAt) {

	boolean usedUp() {
		return this.leftToday != null && this.leftToday <= 0;
	}

}
