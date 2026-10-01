package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One run of a game, from start to finish. The client opens a session when a run starts and may
 * close it exactly once with the final score.
 *
 * <p>The id is a random UUID so that it cannot be guessed: for a guest, knowing the id is what
 * proves a score submission belongs to the run. A run started by a signed-in player can only be
 * finished by that player.
 */
@Entity
@Table(name = "game_sessions")
class GameSession {

	@Id
	private UUID id;

	@Column(name = "game_id", nullable = false, updatable = false)
	private Long gameId;

	/** The account that started the run, or {@code null} for a guest. */
	@Column(name = "user_id", updatable = false)
	private Long userId;

	/** The guest id the browser sent, for a run without an account. A run has one owner, so this is {@code null} when {@code userId} is set. */
	@Column(name = "player_id", updatable = false)
	private UUID playerId;

	@Column(name = "started_at", nullable = false, updatable = false)
	private Instant startedAt;

	@Column(name = "finished_at")
	private Instant finishedAt;

	protected GameSession() {
	}

	private GameSession(UUID id, Long gameId, Long userId, UUID playerId, Instant startedAt) {
		this.id = id;
		this.gameId = gameId;
		this.userId = userId;
		this.playerId = playerId;
		this.startedAt = startedAt;
	}

	static GameSession start(Long gameId, Long userId, UUID playerId, Instant now) {
		return new GameSession(UUID.randomUUID(), gameId, userId, playerId, now);
	}

	void finish(Instant now) {
		this.finishedAt = now;
	}

	boolean isFinished() {
		return this.finishedAt != null;
	}

	/** Whether the given caller ({@code null} for a guest) may finish this run. */
	boolean mayBeFinishedBy(Long callerUserId) {
		return this.userId == null || this.userId.equals(callerUserId);
	}

	UUID getId() {
		return this.id;
	}

	Long getGameId() {
		return this.gameId;
	}

	Long getUserId() {
		return this.userId;
	}

	UUID getPlayerId() {
		return this.playerId;
	}

	Instant getStartedAt() {
		return this.startedAt;
	}

}
