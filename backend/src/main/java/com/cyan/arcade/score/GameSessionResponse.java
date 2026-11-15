package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

/**
 * A started game session. The client keeps {@code id} to submit the final score later.
 *
 * @param mode the ruleset the run is played under, fixed for the whole run
 */
public record GameSessionResponse(UUID id, String gameSlug, String mode, Instant startedAt) {
}
