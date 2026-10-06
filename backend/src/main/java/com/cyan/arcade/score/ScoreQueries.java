package com.cyan.arcade.score;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read access to recorded scores for other features (leaderboards, profiles).
 * Writing a score only ever happens through {@link GameSessionService}.
 */
@Service
@Transactional(readOnly = true)
public class ScoreQueries {

	private final ScoreRepository scores;

	ScoreQueries(ScoreRepository scores) {
		this.scores = scores;
	}

	/** One page of a game's scores, best first, each with its overall rank. */
	public Page<RankedScore> topScores(Long gameId, int page, int size) {
		return this.scores.findRanked(gameId, PageRequest.of(page, size));
	}

	/**
	 * The caller's best score in a game and where it ranks. A signed-in player is looked up by
	 * account; a guest by the id their browser sends.
	 * @param userId the signed-in player, or {@code null}
	 * @param playerId the guest id, or {@code null}
	 */
	public Optional<PlayerBest> bestOf(Long gameId, Long userId, UUID playerId) {
		Optional<Integer> best = Optional.empty();
		if (userId != null) {
			best = this.scores.findBestScoreOfUser(gameId, userId);
		}
		else if (playerId != null) {
			best = this.scores.findBestScoreOfGuest(gameId, playerId);
		}
		return best.map((score) -> new PlayerBest(score, this.scores.countByGameIdAndValueGreaterThan(gameId, score) + 1));
	}

	public PlayerStats statsOf(Long userId) {
		return new PlayerStats(this.scores.countByUserId(userId), this.scores.sumScoresOfUser(userId));
	}

	/** A player's numbers in every game they have finished at least once. */
	public List<GameStats> statsByGameOf(Long userId) {
		return this.scores.findStatsByGame(userId);
	}

	/** Games finished by everyone, guests included. */
	public long countAll() {
		return this.scores.count();
	}

	public long countSince(Instant since) {
		return this.scores.countByCreatedAtGreaterThanEqual(since);
	}

	/** One page of a player's finished games, newest first. */
	public Page<PlayedGame> historyOf(Long userId, int page, int size) {
		return this.scores.findHistory(userId, PageRequest.of(page, size));
	}

}
