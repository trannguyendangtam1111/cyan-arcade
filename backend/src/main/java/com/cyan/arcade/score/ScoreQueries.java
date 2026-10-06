package com.cyan.arcade.score;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
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

	private final ScoreBoard board;

	ScoreQueries(ScoreRepository scores, ScoreBoard board) {
		this.scores = scores;
		this.board = board;
	}

	/**
	 * One page of a game's ranking over a time window: each player's best score set in it, best
	 * first, numbered 1, 2, 3, ... with no shared ranks (see {@link ScoreBoard}).
	 * @param since the window's first moment, or {@code null} for no start
	 * @param until the moment after the window, or {@code null} for no end
	 */
	public Page<RankedScore> ranking(Long gameId, Instant since, Instant until, int page, int size) {
		return new PageImpl<>(this.board.page(gameId, since, until, page, size), PageRequest.of(page, size),
				this.board.count(gameId, since, until));
	}

	/**
	 * The caller's best score in a game over a time window and its rank. A signed-in player is
	 * looked up by account; a guest by the id their browser sends.
	 * @param userId the signed-in player, or {@code null}
	 * @param playerId the guest id, or {@code null}
	 * @return empty when the caller is unknown or has no score in the window
	 */
	public Optional<PlayerBest> standingOf(Long gameId, Instant since, Instant until, Long userId, UUID playerId) {
		return this.board.standing(gameId, since, until, userId, playerId);
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
