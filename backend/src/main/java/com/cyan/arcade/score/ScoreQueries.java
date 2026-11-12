package com.cyan.arcade.score;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.game.GameService;

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

	private final GameModes modes;

	private final GameService games;

	ScoreQueries(ScoreRepository scores, ScoreBoard board, GameModes modes, GameService games) {
		this.scores = scores;
		this.board = board;
		this.modes = modes;
		this.games = games;
	}

	/**
	 * How many games the player has finished under Classic rules: in Classic, or in a mode that shares
	 * Classic's progression (see {@link ModeSpec#classicProgression()}). What games-played
	 * achievements count, and so what their progress shows.
	 */
	public long gamesPlayedUnderClassicRules(Long userId) {
		return ClassicGames.countFor(userId, this.scores, this.games, this.modes);
	}

	/**
	 * One page of the ranking of one mode of a game over a time window: each player's best score set
	 * in it, best first in the mode's order, numbered 1, 2, 3, ... with no shared ranks (see
	 * {@link ScoreBoard}). Only that mode's scores take part.
	 * @param mode one of the game's declared modes; its order decides what "best" is
	 * @param since the window's first moment, or {@code null} for no start
	 * @param until the moment after the window, or {@code null} for no end
	 */
	public Page<RankedScore> ranking(Long gameId, ModeSpec mode, Instant since, Instant until, int page, int size) {
		return new PageImpl<>(this.board.page(gameId, mode, since, until, page, size), PageRequest.of(page, size),
				this.board.count(gameId, mode, since, until));
	}

	/**
	 * The caller's best score in one mode of a game over a time window and its rank. A signed-in
	 * player is looked up by account; a guest by the id their browser sends.
	 * @param userId the signed-in player, or {@code null}
	 * @param playerId the guest id, or {@code null}
	 * @return empty when the caller is unknown or has no score in the window
	 */
	public Optional<PlayerBest> standingOf(Long gameId, ModeSpec mode, Instant since, Instant until, Long userId,
			UUID playerId) {
		return this.board.standing(gameId, mode, since, until, userId, playerId);
	}

	/** A player's totals for their profile: Classic runs only, as before modes existed. */
	public PlayerStats statsOf(Long userId) {
		return new PlayerStats(this.scores.countByUserIdAndMode(userId, GameModes.CLASSIC),
				this.scores.sumScoresOfUser(userId, GameModes.CLASSIC));
	}

	/** A player's Classic numbers in every game they have finished at least once in Classic. */
	public List<GameStats> statsByGameOf(Long userId) {
		return this.scores.findStatsByGame(userId, GameModes.CLASSIC);
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
