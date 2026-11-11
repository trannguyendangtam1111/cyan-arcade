package com.cyan.arcade.score;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

interface ScoreRepository extends Repository<Score, Long> {

	Score save(Score score);

	Optional<Score> findByGameSessionId(UUID gameSessionId);

	/** A player's best in one mode of a game, where higher is better. */
	@Query("select max(s.value) from Score s where s.gameId = :gameId and s.userId = :userId and s.mode = :mode")
	Optional<Integer> findHighestScoreOfUser(Long gameId, Long userId, String mode);

	/** A player's best in one mode of a game, where lower is better (a time). */
	@Query("select min(s.value) from Score s where s.gameId = :gameId and s.userId = :userId and s.mode = :mode")
	Optional<Integer> findLowestScoreOfUser(Long gameId, Long userId, String mode);

	/** How many runs of one mode a player has finished, every game together. */
	long countByUserIdAndMode(Long userId, String mode);

	/** How many runs a player has finished in each mode other than Classic, per game. */
	@Query("""
			select new com.cyan.arcade.score.ModeCount(s.gameId, s.mode, count(s))
			from Score s
			where s.userId = :userId and s.mode <> 'classic'
			group by s.gameId, s.mode
			""")
	List<ModeCount> countOtherModesOfUser(Long userId);

	@Query("select coalesce(sum(cast(s.value as long)), 0) from Score s where s.userId = :userId and s.mode = :mode")
	long sumScoresOfUser(Long userId, String mode);

	/** A player's numbers per game in one mode, in one pass over their scores (served by the user index). */
	@Query("""
			select new com.cyan.arcade.score.GameStats(
			    s.gameId, count(s), max(s.value), avg(s.value), coalesce(sum(s.durationMs), 0), max(s.createdAt))
			from Score s
			where s.userId = :userId and s.mode = :mode
			group by s.gameId
			""")
	List<GameStats> findStatsByGame(Long userId, String mode);

	long count();

	long countByCreatedAtGreaterThanEqual(Instant since);

	/** A player's finished games, newest first. */
	@Query(value = """
			select new com.cyan.arcade.score.PlayedGame(
			    s.gameId, s.mode, s.value, s.durationMs, s.createdAt, s.xpAwarded, s.personalBest)
			from Score s
			where s.userId = :userId
			order by s.createdAt desc, s.id desc
			""", countQuery = "select count(s) from Score s where s.userId = :userId")
	Page<PlayedGame> findHistory(Long userId, Pageable pageable);

}
