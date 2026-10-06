package com.cyan.arcade.dailylogin;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The daily login reward.
 *
 * @param rewards coins for each day of a streak; after the last one the streak starts again from
 * the first
 * @param bonusItem a shop item (by code) given on top on the last day, or empty for none
 * @param bonusItemUnits how many of it
 */
@ConfigurationProperties("app.daily-login")
record DailyLoginProperties(@DefaultValue({ "50", "60", "70", "80", "100", "125", "200" }) List<Integer> rewards,
		@DefaultValue("EXTRA_PACK") String bonusItem, @DefaultValue("1") int bonusItemUnits) {

	DailyLoginProperties {
		if (rewards.isEmpty() || rewards.stream().anyMatch((coins) -> coins == null || coins < 0)) {
			throw new IllegalArgumentException("app.daily-login.rewards must be a list of coin amounts, none negative");
		}
		if (bonusItemUnits < 0) {
			throw new IllegalArgumentException("app.daily-login.bonus-item-units must not be negative");
		}
		rewards = List.copyOf(rewards);
	}

	int cycleLength() {
		return this.rewards.size();
	}

	/** The day of the cycle a streak of this length is on, from 1. */
	int dayOf(int streak) {
		return Math.floorMod(streak - 1, cycleLength()) + 1;
	}

	int coinsFor(int day) {
		return this.rewards.get(day - 1);
	}

	boolean hasBonusOn(int day) {
		return day == cycleLength() && !this.bonusItem.isBlank() && this.bonusItemUnits > 0;
	}

}
