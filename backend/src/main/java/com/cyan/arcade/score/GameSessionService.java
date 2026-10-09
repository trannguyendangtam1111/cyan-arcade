package com.cyan.arcade.score;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one place where scores enter the system: a run is opened as a session, and its score is
 * accepted only by finishing that session. Every check on a submitted score lives here, which is
 * also where stronger verification (replays, signed runs) can be added later without touching
 * the games.
 *
 * <p>Finishing is one transaction, in this order: the session is locked and checked (its owner,
 * not finished yet, not expired), the run is checked against its game's rules using the time the
 * server measured, the session is closed, the player is locked so their runs are judged one at a
 * time, then the rewards are decided and paid and the score is recorded. Any failure leaves
 * nothing behind: no score, no XP, no coins, no achievement, no challenge progress.
 */
@Service
public class GameSessionService {

	static final String SESSION_ALREADY_FINISHED = "SESSION_ALREADY_FINISHED";

	static final String SESSION_EXPIRED = "SESSION_EXPIRED";

	private static final Logger log = LoggerFactory.getLogger(GameSessionService.class);

	private final GameSessionRepository sessions;

	private final ScoreRepository scores;

	private final GameService games;

	private final ProgressionService progression;

	private final RunValidator validator;

	private final Duration sessionLifetime;

	private final Clock clock;

	GameSessionService(GameSessionRepository sessions, ScoreRepository scores, GameService games,
			ProgressionService progression, RunValidator validator,
			AbandonedSessionCleaner.SessionProperties sessionProperties, Clock clock) {
		this.clock = clock;
		this.validator = validator;
		this.sessionLifetime = sessionProperties.abandonedAfter();
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
	 * @param callerPlayerId the guest id the request carries, or {@code null}
	 * @param details game-specific numbers about the run, used for achievements and challenges once
	 * they are checked against the score
	 */
	@Transactional
	public ScoreResponse finish(UUID sessionId, int score, Map<String, Integer> details, Long callerUserId,
			UUID callerPlayerId) {
		GameSession session = this.sessions.findByIdForUpdate(sessionId)
			.orElseThrow(() -> new NotFoundException("Game session", sessionId));
		// A run is its owner's alone: an account's, or the browser's that started it as a guest.
		if (!session.mayBeFinishedBy(callerUserId, callerPlayerId)) {
			log.warn("Score rejected: session={} reason=not the owner", sessionId);
			throw new ApiException(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN,
					"This game session belongs to another player");
		}
		if (session.isFinished()) {
			throw new ConflictException(SESSION_ALREADY_FINISHED, "This game session has already been finished");
		}

		// The run's length is the server's: from when the session was opened until now.
		Instant now = this.clock.instant();
		Duration elapsed = Duration.between(session.getStartedAt(), now);
		if (elapsed.compareTo(this.sessionLifetime) > 0) {
			throw new ApiException(HttpStatus.GONE, SESSION_EXPIRED, "This game session has expired");
		}

		GameInfo game = this.games.requireGame(session.getGameId());
		Map<String, Integer> checked = this.validator.check(session, game, score, details, elapsed);
		session.finish(now);
		long durationMs = elapsed.toMillis();

		// Guests get their score recorded and nothing else; only accounts earn rewards.
		Rewards rewards = (session.getUserId() != null) ? reward(session, game, score, checked) : null;
		int xpAwarded = (rewards != null) ? rewards.xpEarned() : 0;
		boolean personalBest = rewards != null && rewards.personalBest();
		Score recorded = this.scores.save(new Score(session, score, durationMs, xpAwarded, personalBest, now));

		return new ScoreResponse(session.getId(), game.slug(), recorded.getValue(), recorded.getDurationMs(),
				recorded.getCreatedAt(), rewards);
	}

	/**
	 * A session as another feature may see it: its game, its owner and whether its score is in. For
	 * a game that keeps state of its own for each run (Word Guess), to tie that state to the
	 * platform's run. Nothing about a session can be changed this way.
	 */
	@Transactional(readOnly = true)
	public Optional<RunSession> find(UUID sessionId) {
		return this.sessions.findById(sessionId)
			.map((session) -> new RunSession(session.getId(), this.games.requireGame(session.getGameId()).slug(),
					session.getUserId(), session.getPlayerId(), session.getStartedAt(), session.isFinished()));
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
	private Rewards reward(GameSession session, GameInfo game, int score, Map<String, Integer> details) {
		Long userId = session.getUserId();
		// The player's other runs wait until this one is decided, so what is read next is final.
		this.progression.lockPlayer(userId);
		// Both looked up before this run's score is saved: the best so far, and the games so far.
		int previousBest = this.scores.findBestScoreOfUser(game.id(), userId).orElse(0);
		long gamesPlayed = this.scores.countByUserId(userId) + 1;
		return this.progression
			.reward(new CompletedRun(session.getId(), userId, game.slug(), score, details, score > previousBest,
					gamesPlayed));
	}

}
