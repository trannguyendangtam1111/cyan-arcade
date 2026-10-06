package com.cyan.arcade.score;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

interface ScoreRepository extends Repository<Score, Long> {

	Score save(Score score);

	@Query("select max(s.value) from Score s where s.gameId = :gameId and s.userId = :userId")
	Optional<Integer> findBestScoreOfUser(Long gameId, Long userId);

	long countByUserId(Long userId);

	@Query("select coalesce(sum(cast(s.value as long)), 0) from Score s where s.userId = :userId")
	long sumScoresOfUser(Long userId);

	/** A player's numbers per game, in one pass over their scores (served by the user/game index). */
	@Query("""
			select new com.cyan.arcade.score.GameStats(
			    s.gameId, count(s), max(s.value), avg(s.value), coalesce(sum(s.durationMs), 0), max(s.createdAt))
			from Score s
			where s.userId = :userId
			group by s.gameId
			""")
	List<GameStats> findStatsByGame(Long userId);

	long count();

	long countByCreatedAtGreaterThanEqual(Instant since);

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
