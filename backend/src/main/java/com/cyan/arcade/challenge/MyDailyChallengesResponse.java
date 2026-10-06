package com.cyan.arcade.challenge;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.cyan.arcade.challenge.DailyChallengesResponse.Activity;
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
	 * @param game the game it is played in, or {@code null} for an activity's challenge
	 * @param activity what it counts, or {@code null} for a game's challenge
	 * @param target the number to reach; 1 for "finish a game"
	 * @param xpReward experience points for completing it
	 * @param coinReward coins for completing it
	 * @param progress for an activity's challenge, how many times the player has done it today;
	 * {@code null} for a game's challenge, which a single run completes
	 * @param completedAt when the player completed it, or {@code null} while they have not
	 */
	public record Challenge(Long id, String title, String description, Game game, Activity activity, int target,
			int xpReward, int coinReward, LocalDate date, Integer progress, boolean completed, Instant completedAt) {
	}

}
