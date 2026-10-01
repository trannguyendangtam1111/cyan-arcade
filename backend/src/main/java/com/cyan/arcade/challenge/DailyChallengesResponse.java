package com.cyan.arcade.challenge;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Today's challenges, as anyone may see them.
 *
 * @param date the day these challenges belong to, in UTC
 * @param resetsAt when the day ends and the next set takes over
 */
public record DailyChallengesResponse(LocalDate date, Instant resetsAt, List<Challenge> challenges) {

	/**
	 * @param target the number to reach; 1 for "finish a game"
	 * @param xpReward experience points for completing it
	 */
	public record Challenge(Long id, String title, String description, Game game, int target, int xpReward,
			LocalDate date) {
	}

	/** The game a challenge is played in. */
	public record Game(String slug, String name) {
	}

}
