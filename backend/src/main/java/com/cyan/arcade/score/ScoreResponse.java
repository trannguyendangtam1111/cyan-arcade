package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

import com.cyan.arcade.progression.Rewards;

/**
 * The result recorded for a finished session.
 *
 * @param durationMs time between starting and finishing the session, as measured by the server
 * @param rewards what the run earned a signed-in player; {@code null} for guests
 */
public record ScoreResponse(UUID sessionId, String gameSlug, int score, long durationMs, Instant recordedAt,
		Rewards rewards) {
}
