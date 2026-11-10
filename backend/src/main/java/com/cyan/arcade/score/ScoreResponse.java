package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

import com.cyan.arcade.progression.Rewards;

/**
 * The result recorded for a finished session.
 *
 * @param mode the ruleset the run was played under, as fixed when its session started
 * @param durationMs time between starting and finishing the session, as measured by the server
 * @param rewards what this run earned its player; {@code null} for guests
 */
public record ScoreResponse(UUID sessionId, String gameSlug, String mode, int score, long durationMs,
		Instant recordedAt, Rewards rewards) {
}
