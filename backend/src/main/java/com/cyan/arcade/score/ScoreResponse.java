package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

import com.cyan.arcade.progression.Rewards;

/**
 * The result recorded for a finished session.
 *
 * @param mode the ruleset the run was played under, as fixed when its session started
 * @param durationMs time between starting and finishing the session, as measured by the server
 * @param rewards original rewards at finish time; {@code null} for guests or legacy results whose
 * reward breakdown was not stored (never reconstructed from the player's current state)
 */
public record ScoreResponse(UUID sessionId, String gameSlug, String mode, int score, long durationMs,
		Instant recordedAt, Rewards rewards) {
}
