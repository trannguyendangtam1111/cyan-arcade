package com.cyan.arcade.score;

import java.time.Instant;

/**
 * A player's numbers in one game.
 *
 * @param playTimeMs time spent in finished runs, measured by the server
 */
public record GameStats(Long gameId, Long gamesPlayed, Integer bestScore, Double averageScore, Long playTimeMs,
		Instant lastPlayedAt) {
}
