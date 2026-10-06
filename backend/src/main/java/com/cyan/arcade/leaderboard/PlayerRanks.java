package com.cyan.arcade.leaderboard;

import java.util.List;

/**
 * Where a player stands on every leaderboard: per game, today, this week and of all time.
 *
 * @param bestRank the player's best all-time rank in any game, or {@code null} when they have none
 * @param bestRankGame the game of {@code bestRank}, or {@code null}
 */
public record PlayerRanks(Long bestRank, Game bestRankGame, List<GameRanks> games) {

	public record Game(String slug, String name) {
	}

	/** A rank on one board. Absent ({@code null}) when the player has no score in the period. */
	public record Standing(long rank, int score) {
	}

	public record GameRanks(Game game, Standing daily, Standing weekly, Standing allTime) {
	}

}
