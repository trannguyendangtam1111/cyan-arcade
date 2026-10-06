package com.cyan.arcade.dailylogin;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Where a player stands with the daily login reward.
 *
 * @param date today, by the server's clock in UTC
 * @param claimedToday whether today's reward has been claimed
 * @param streak consecutive days claimed up to today (or yesterday, while today is unclaimed); 0
 * when the streak is broken
 * @param day the day of the cycle that today's claim is (or was) on, from 1
 * @param days every day of the cycle and what it gives
 * @param resetsAt when the next day's reward can be claimed
 */
public record DailyLoginResponse(LocalDate date, boolean claimedToday, int streak, int day, List<Day> days,
		Instant resetsAt) {

	/**
	 * @param bonusItem the name of an item given on top, or {@code null}
	 * @param state {@code CLAIMED} for days of the current cycle already claimed, {@code TODAY} for
	 * today's while it is unclaimed, {@code UPCOMING} for the rest
	 */
	public record Day(int day, int coins, String bonusItem, State state) {
	}

	public enum State {

		CLAIMED, TODAY, UPCOMING

	}

	/**
	 * What claiming gave.
	 *
	 * @param coins coins received
	 * @param bonusItem the name of an item received on top, or {@code null}
	 * @param balance the player's coins afterwards
	 * @param status where the player stands now
	 */
	public record Claimed(int day, int streak, int coins, String bonusItem, long balance, DailyLoginResponse status) {
	}

}
