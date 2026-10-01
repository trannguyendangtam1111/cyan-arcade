package com.cyan.arcade.score;

import java.time.Instant;

/**
 * One entry of a player's game history.
 *
 * @param xpEarned experience the run earned, achievements included
 * @param personalBest whether it beat the player's previous best in that game at the time
 */
public record PlayedGame(Long gameId, int score, long durationMs, Instant playedAt, int xpEarned,
		boolean personalBest) {
}
