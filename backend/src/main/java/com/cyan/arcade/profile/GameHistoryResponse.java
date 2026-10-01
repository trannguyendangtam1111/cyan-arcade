package com.cyan.arcade.profile;

import java.time.Instant;
import java.util.List;

/**
 * One page of a player's finished games, newest first.
 *
 * @param page zero-based page number
 */
public record GameHistoryResponse(List<Entry> entries, int page, int size, long totalEntries, int totalPages) {

	/**
	 * @param durationMs how long the run took
	 * @param xpEarned experience the run earned, achievements included
	 * @param personalBest whether the run beat the player's previous best in that game
	 */
	public record Entry(String gameSlug, String gameName, int score, long durationMs, Instant playedAt, int xpEarned,
			boolean personalBest) {
	}

}
