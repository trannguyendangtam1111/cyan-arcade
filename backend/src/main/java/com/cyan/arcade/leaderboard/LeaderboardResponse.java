package com.cyan.arcade.leaderboard;

import java.time.Instant;
import java.util.List;

import com.cyan.arcade.user.Avatar;

/**
 * One page of a game's leaderboard for a period: each player once, with their best score in it.
 *
 * @param periodStart the first moment the period counts, or {@code null} for all time
 * @param periodEnd when the period ends and a new board starts, or {@code null} for all time
 * @param page zero-based page number
 * @param totalEntries how many players are on the board
 * @param myRank the caller's rank on this board, or {@code null} when the caller is unknown or has
 * no score in the period; never made up
 * @param myScore the caller's best score in the period, or {@code null} likewise
 */
public record LeaderboardResponse(String gameSlug, LeaderboardPeriod period, Instant periodStart, Instant periodEnd,
		List<Entry> entries, int page, int size, long totalEntries, int totalPages, Long myRank, Integer myScore) {

	/**
	 * @param rank 1 for the best; no two entries share one (equal scores: whoever set it first)
	 * @param player who set the score, or {@code null} for a guest
	 * @param durationMs how long the run took
	 * @param you whether this entry is the caller's
	 */
	public record Entry(long rank, Player player, int score, long durationMs, Instant achievedAt, boolean you) {
	}

	/** The public face of an account: a name and an avatar, nothing else. */
	public record Player(String username, Avatar avatar) {
	}

}
