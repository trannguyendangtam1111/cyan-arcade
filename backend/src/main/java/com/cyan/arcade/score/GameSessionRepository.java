package com.cyan.arcade.score;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

interface GameSessionRepository extends Repository<GameSession, UUID> {

	GameSession save(GameSession session);

	Optional<GameSession> findById(UUID id);

	/**
	 * Loads a session and locks its row until the transaction ends, so two simultaneous attempts to
	 * finish the same session are handled one after the other instead of both succeeding.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select s from GameSession s where s.id = :id")
	Optional<GameSession> findByIdForUpdate(UUID id);

	/** One statement, whatever the number of rows; served by the partial index on unfinished sessions. */
	@Modifying
	@Query("delete from GameSession s where s.finishedAt is null and s.startedAt < :before")
	int deleteUnfinishedStartedBefore(Instant before);

}
