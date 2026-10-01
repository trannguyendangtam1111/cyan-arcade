package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

/** A started game session. The client keeps {@code id} to submit the final score later. */
public record GameSessionResponse(UUID id, String gameSlug, Instant startedAt) {
}
