package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

/**
 * A game session, read-only, for a game that keeps its own state for each run and must tie it to
 * the platform's run (see {@link GameSessionService#find}).
 *
 * @param userId the account that started it, or {@code null} for a guest
 * @param playerId the guest id it was started with, or {@code null}
 * @param finished whether its score has been submitted
 */
public record RunSession(UUID id, String gameSlug, Long userId, UUID playerId, Instant startedAt, boolean finished) {

	/**
	 * Whether the run belongs to this caller: the account that started it, or, for a guest's run, the
	 * same guest id. A guest's run started without one belongs to nobody in particular, so to no one.
	 */
	public boolean belongsTo(Long callerUserId, UUID callerPlayerId) {
		if (this.userId != null) {
			return this.userId.equals(callerUserId);
		}
		return callerUserId == null && this.playerId != null && this.playerId.equals(callerPlayerId);
	}

}
