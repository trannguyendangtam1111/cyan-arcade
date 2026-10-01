package com.cyan.arcade.challenge;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.cyan.arcade.challenge.DailyChallengesResponse.Game;

/**
 * Today's challenges with the signed-in player's progress.
 *
 * @param date the day these challenges belong to, in UTC
 * @param resetsAt when the day ends and the next set takes over
 * @param completedCount how many of them the player has completed
 */
public record MyDailyChallengesResponse(LocalDate date, Instant resetsAt, int completedCount,
		List<Challenge> challenges) {

	/**
	 * @param target the number to reach; 1 for "finish a game"
	 * @param xpReward experience points for completing it
	 * @param completedAt when the player completed it, or {@code null} while they have not
	 */
	public record Challenge(Long id, String title, String description, Game game, int target, int xpReward,
			LocalDate date, boolean completed, Instant completedAt) {
	}

}
