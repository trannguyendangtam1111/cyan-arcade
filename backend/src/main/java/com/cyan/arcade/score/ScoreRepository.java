package com.cyan.arcade.score;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

interface ScoreRepository extends Repository<Score, Long> {

	Score save(Score score);

	/**
	 * A page of a game's scores, best first. Among equal scores the earlier one comes first.
	 * The rank is computed over all of the game's scores, not just the requested page.
	 */
	@Query(value = """
			select new com.cyan.arcade.score.RankedScore(
			    rank() over (order by s.value desc), s.value, s.durationMs, s.createdAt, s.userId, s.playerId)
			from Score s
			where s.gameId = :gameId
			order by s.value desc, s.createdAt asc, s.id asc
			""", countQuery = "select count(s) from Score s where s.gameId = :gameId")
	Page<RankedScore> findRanked(Long gameId, Pageable pageable);

	/** Scores set while signed in belong to the account, not to the guest id of the browser they came from. */
	@Query("""
			select max(s.value) from Score s
			where s.gameId = :gameId and s.playerId = :playerId and s.userId is null
			""")
	Optional<Integer> findBestScoreOfGuest(Long gameId, UUID playerId);

	@Query("select max(s.value) from Score s where s.gameId = :gameId and s.userId = :userId")
	Optional<Integer> findBestScoreOfUser(Long gameId, Long userId);

	long countByGameIdAndValueGreaterThan(Long gameId, int value);

	long countByUserId(Long userId);

	@Query("select coalesce(sum(cast(s.value as long)), 0) from Score s where s.userId = :userId")
	long sumScoresOfUser(Long userId);

	/** A player's finished games, newest first. */
	@Query(value = """
			select new com.cyan.arcade.score.PlayedGame(
			    s.gameId, s.value, s.durationMs, s.createdAt, s.xpAwarded, s.personalBest)
			from Score s
			where s.userId = :userId
			order by s.createdAt desc, s.id desc
			""", countQuery = "select count(s) from Score s where s.userId = :userId")
	Page<PlayedGame> findHistory(Long userId, Pageable pageable);

}
