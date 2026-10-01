package com.cyan.arcade.score;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.progression.CompletedRun;
import com.cyan.arcade.progression.ProgressionService;
import com.cyan.arcade.progression.Rewards;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one place where scores enter the system: a run is opened as a session, and its score is
 * accepted only by finishing that session. Every check on a submitted score lives here, which is
 * also where stronger verification (replays, signed runs) can be added later without touching
 * the games.
 */
@Service
public class GameSessionService {

	static final String SESSION_ALREADY_FINISHED = "SESSION_ALREADY_FINISHED";

	static final String SCORE_OUT_OF_RANGE = "SCORE_OUT_OF_RANGE";

	private final GameSessionRepository sessions;

	private final ScoreRepository scores;

	private final GameService games;

	private final ProgressionService progression;

	private final Clock clock;

	GameSessionService(GameSessionRepository sessions, ScoreRepository scores, GameService games,
			ProgressionService progression, Clock clock) {
		this.clock = clock;
		this.sessions = sessions;
		this.scores = scores;
		this.games = games;
		this.progression = progression;
	}

	/**
	 * @param userId the signed-in player starting the run, or {@code null} for a guest
	 * @param playerId the guest id the browser sent, or {@code null}
	 */
	@Transactional
	public GameSessionResponse start(String gameSlug, Long userId, UUID playerId) {
		GameInfo game = this.games.requireActiveGame(gameSlug);
		// A run has one owner. With an account there is no reason to also keep which browser it came from.
		UUID guestId = (userId == null) ? playerId : null;
		GameSession session = this.sessions.save(GameSession.start(game.id(), userId, guestId, this.clock.instant()));
		return new GameSessionResponse(session.getId(), game.slug(), session.getStartedAt());
	}

	/**
	 * @param callerUserId the signed-in player making the request, or {@code null} for a guest
	 * @param details game-specific numbers about the run, used for achievements
	 */
	@Transactional
	public ScoreResponse finish(UUID sessionId, int score, Map<String, Integer> details, Long callerUserId) {
		GameSession session = this.sessions.findByIdForUpdate(sessionId)
			.orElseThrow(() -> new NotFoundException("Game session", sessionId));
		// A run started by a signed-in player is theirs alone: nobody else can put a score on it.
		if (!session.mayBeFinishedBy(callerUserId)) {
			throw new ApiException(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN,
					"This game session belongs to another player");
		}
		if (session.isFinished()) {
			throw new ConflictException(SESSION_ALREADY_FINISHED, "This game session has already been finished");
		}

		GameInfo game = this.games.requireGame(session.getGameId());
		if (!game.allowsScore(score)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, SCORE_OUT_OF_RANGE,
					"A score of %d is not possible in %s".formatted(score, game.slug()));
		}

		Instant now = this.clock.instant();
		session.finish(now);
		long durationMs = Duration.between(session.getStartedAt(), now).toMillis();

		// Guests get their score recorded and nothing else; only accounts earn rewards.
		Rewards rewards = (session.getUserId() != null) ? reward(session.getUserId(), game, score, details) : null;
		int xpAwarded = (rewards != null) ? rewards.xpEarned() : 0;
		boolean personalBest = rewards != null && rewards.personalBest();
		Score recorded = this.scores.save(new Score(session, score, durationMs, xpAwarded, personalBest, now));

		return new ScoreResponse(session.getId(), game.slug(), recorded.getValue(), recorded.getDurationMs(),
				recorded.getCreatedAt(), rewards);
	}

	/**
	 * Removes runs that were started longer ago than {@code age} and never finished. Finished runs
	 * are never touched: their scores point at them.
	 * @return how many were removed
	 */
	@Transactional
	public int removeUnfinishedOlderThan(Duration age) {
		return this.sessions.deleteUnfinishedStartedBefore(this.clock.instant().minus(age));
	}

	/** Describes the run to the progression rules, which decide what it earns. */
	private Rewards reward(Long userId, GameInfo game, int score, Map<String, Integer> details) {
		// Both looked up before this run's score is saved: the best so far, and the games so far.
		int previousBest = this.scores.findBestScoreOfUser(game.id(), userId).orElse(0);
		long gamesPlayed = this.scores.countByUserId(userId) + 1;
		return this.progression
			.reward(new CompletedRun(userId, game.slug(), score, details, score > previousBest, gamesPlayed));
	}

}
