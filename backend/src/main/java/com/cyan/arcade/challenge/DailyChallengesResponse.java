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
	 * @param game the game it is played in, or {@code null} for an activity's challenge
	 * @param activity what it counts, or {@code null} for a game's challenge
	 * @param target the number to reach; 1 for "finish a game"
	 * @param xpReward experience points for completing it
	 * @param coinReward coins for completing it
	 */
	public record Challenge(Long id, String title, String description, Game game, Activity activity, int target,
			int xpReward, int coinReward, LocalDate date) {
	}

	/**
	 * The game a challenge is played in.
	 *
	 * @param classicRunsOnly whether the game has other modes whose runs do not count towards the
	 * challenge, so only its Classic runs do (Tetris, with Sprint and Ultra). False when every run of
	 * the game counts (a game with Classic alone, or Sudoku's boards)
	 */
	public record Game(String slug, String name, boolean classicRunsOnly) {
	}

	/** What an activity's challenge counts, e.g. {@code TCG_PACK_OPENED}, "Card packs". */
	public record Activity(String code, String name) {
	}

}
