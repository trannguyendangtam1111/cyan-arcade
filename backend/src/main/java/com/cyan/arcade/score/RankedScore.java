package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

/**
 * A recorded score together with its rank among all scores of the same game.
 *
 * @param rank 1 for the best score; equal scores share a rank
 * @param userId the account that achieved it, or {@code null} for a guest
 * @param playerId the guest id sent with the run, or {@code null}. For comparing with the caller
 * only; it must never be sent to a client.
 */
public record RankedScore(long rank, int score, long durationMs, Instant achievedAt, Long userId, UUID playerId) {

	/**
	 * Whether this score was set by the given caller.
	 *
	 * <p>A signed-in caller is their account and nothing else. A guest is their guest id, and only a
	 * guest's score can be theirs. So people who share a browser, and with it a guest id, are never
	 * shown each other's scores as their own, and signing out leaves an account's scores behind.
	 */
	public boolean belongsTo(Long callerUserId, UUID callerPlayerId) {
		if (callerUserId != null) {
			return callerUserId.equals(this.userId);
		}
		return this.userId == null && callerPlayerId != null && callerPlayerId.equals(this.playerId);
	}

}
