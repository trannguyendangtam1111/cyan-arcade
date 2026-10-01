package com.cyan.arcade.score;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** The recorded result of a finished {@link GameSession}. Never updated after it is written. */
@Entity
@Table(name = "scores")
class Score {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "game_session_id", nullable = false, updatable = false)
	private UUID gameSessionId;

	@Column(name = "game_id", nullable = false, updatable = false)
	private Long gameId;

	@Column(name = "user_id", updatable = false)
	private Long userId;

	@Column(name = "player_id", updatable = false)
	private UUID playerId;

	@Column(name = "score", nullable = false, updatable = false)
	private int value;

	@Column(name = "duration_ms", nullable = false, updatable = false)
	private long durationMs;

	/** XP this run earned its player; 0 for guests. */
	@Column(name = "xp_awarded", nullable = false, updatable = false)
	private int xpAwarded;

	/** Whether this beat the player's previous best in the game when it was set. */
	@Column(name = "personal_best", nullable = false, updatable = false)
	private boolean personalBest;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Score() {
	}

	Score(GameSession session, int value, long durationMs, int xpAwarded, boolean personalBest, Instant createdAt) {
		this.gameSessionId = session.getId();
		this.gameId = session.getGameId();
		this.userId = session.getUserId();
		this.playerId = session.getPlayerId();
		this.value = value;
		this.durationMs = durationMs;
		this.xpAwarded = xpAwarded;
		this.personalBest = personalBest;
		this.createdAt = createdAt;
	}

	int getValue() {
		return this.value;
	}

	long getDurationMs() {
		return this.durationMs;
	}

	Instant getCreatedAt() {
		return this.createdAt;
	}

}
