package com.cyan.arcade.leaderboard;

import java.time.Instant;
import java.util.List;

import com.cyan.arcade.user.Avatar;

/**
 * One page of a game's leaderboard.
 *
 * @param page zero-based page number
 * @param player the caller's own standing, or {@code null} when the caller is unknown or has no
 * score in this game yet
 */
public record LeaderboardResponse(String gameSlug, List<Entry> entries, int page, int size, long totalEntries,
		int totalPages, PlayerStanding player) {

	/**
	 * @param rank 1 for the best score; equal scores share a rank
	 * @param player who set the score, or {@code null} for a guest
	 * @param durationMs how long the run took
	 * @param you whether this score belongs to the caller
	 */
	public record Entry(long rank, Player player, int score, long durationMs, Instant achievedAt, boolean you) {
	}

	/** The public face of an account: a name and an avatar, nothing else. */
	public record Player(String username, Avatar avatar) {
	}

	/**
	 * @param rank where the caller's best score stands among all scores of the game
	 */
	public record PlayerStanding(int bestScore, long rank) {
	}

}
