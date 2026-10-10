package com.cyan.arcade.chess;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReferenceArray;

import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessMatch.Status;
import com.cyan.arcade.chess.ChessViews.EvaluationView;
import com.cyan.arcade.chess.ChessViews.ReviewResponse;
import com.cyan.arcade.chess.ChessViews.ReviewSettings;
import com.cyan.arcade.chess.ChessViews.ReviewedMove;
import com.cyan.arcade.chess.ChessViews.SuggestedMove;
import com.cyan.arcade.chess.analysis.EnginePositions;
import com.cyan.arcade.chess.analysis.Evaluation;
import com.cyan.arcade.chess.analysis.MoveClassifier;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.engine.San;
import com.cyan.arcade.chess.engine.Square;
import com.cyan.arcade.chess.engine.Termination;
import com.cyan.arcade.chess.stockfish.EngineException;
import com.cyan.arcade.chess.stockfish.SearchRequest;
import com.cyan.arcade.chess.stockfish.SearchResult;
import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Game reviews (admins): every position of a finished game analysed by Stockfish and every move
 * labelled by {@link MoveClassifier}. A review runs in the background, on a small fixed pool of
 * review threads with a short queue, and borrows one engine per position, so it never holds every
 * engine and hints and engine moves keep being answered. The browser asks for progress; a review
 * nobody asks about any more is cancelled, and one can be cancelled outright.
 *
 * <p>Each position's result goes into the {@link EngineAnalysisCache}, so reviewing a game again, or
 * a game that shares positions with an earlier one, reuses what was found. A review reads the match
 * and changes nothing: not its moves, not its result, and nothing of the platform.
 */
@Service
class ChessReviewService {

	static final String REVIEW_NEEDS_FINISHED_GAME = "REVIEW_NEEDS_FINISHED_GAME";

	static final String REVIEW_TOO_LONG = "REVIEW_TOO_LONG";

	static final String REVIEW_QUEUE_FULL = "REVIEW_QUEUE_FULL";

	private static final Logger log = LoggerFactory.getLogger(ChessReviewService.class);

	/** A review waits this long between attempts when every engine is busy. */
	private static final Duration BUSY_PAUSE = Duration.ofMillis(250);

	private static final int BUSY_ATTEMPTS = 40;

	private static final Duration MARGIN = Duration.ofSeconds(1);

	private final ChessService chess;

	private final StockfishEngineAdapter engine;

	private final EngineAnalysisCache cache;

	private final EngineRateLimiter limiter;

	private final ChessAiProperties.Review settings;

	private final Clock clock;

	private final ThreadPoolExecutor executor;

	private final Map<UUID, Job> jobs = new ConcurrentHashMap<>();

	ChessReviewService(ChessService chess, StockfishEngineAdapter engine, EngineAnalysisCache cache,
			EngineRateLimiter limiter, ChessAiProperties properties, Clock clock) {
		this.chess = chess;
		this.engine = engine;
		this.cache = cache;
		this.limiter = limiter;
		this.settings = properties.review();
		this.clock = clock;
		AtomicInteger threads = new AtomicInteger();
		this.executor = new ThreadPoolExecutor(this.settings.concurrent(), this.settings.concurrent(), 60, TimeUnit.SECONDS,
				new ArrayBlockingQueue<>(Math.max(1, this.settings.queue())), (task) -> {
					Thread thread = new Thread(task, "chess-review-" + threads.incrementAndGet());
					thread.setDaemon(true);
					return thread;
				});
		this.executor.allowCoreThreadTimeOut(true);
	}

	/** What one position's analysis found, from White's side. */
	private record PositionAnalysis(Evaluation evaluation, String bestMove, List<String> pv, int depth, boolean exact,
			boolean finished) {
	}

	enum State {

		QUEUED, RUNNING, DONE, CANCELLED, FAILED

	}

	/** One review in progress or done. */
	private final class Job implements Runnable {

		final UUID matchId;

		final Long userId;

		final ChessGame game;

		final Termination termination;

		final String engineName;

		final AtomicReferenceArray<PositionAnalysis> results;

		final Instant created;

		volatile State state = State.QUEUED;

		volatile boolean cancelled;

		volatile Instant lastAskedAt;

		volatile String error;

		Job(UUID matchId, Long userId, ChessGame game, Termination termination, String engineName, Instant now) {
			this.matchId = matchId;
			this.userId = userId;
			this.game = game;
			this.termination = termination;
			this.engineName = engineName;
			this.results = new AtomicReferenceArray<>(game.positions().size());
			this.created = now;
			this.lastAskedAt = now;
		}

		boolean stopRequested() {
			return this.cancelled
					|| this.lastAskedAt.plus(ChessReviewService.this.settings.abandonedAfter()).isBefore(ChessReviewService.this.clock.instant());
		}

		@Override
		public void run() {
			if (stopRequested()) {
				this.state = State.CANCELLED;
				return;
			}
			this.state = State.RUNNING;
			try {
				for (int ply = 0; ply < this.results.length(); ply++) {
					if (stopRequested()) {
						this.state = State.CANCELLED;
						return;
					}
					this.results.set(ply, analyse(this, ply));
				}
				this.state = State.DONE;
			}
			catch (EngineException ex) {
				if (ex.kind() == EngineException.Kind.CANCELLED) {
					this.state = State.CANCELLED;
					return;
				}
				log.warn("Game review stopped: the engine failed ({}): {}", ex.kind(), ex.getMessage());
				this.error = "The engine failed during the review. Start it again to continue where it stopped.";
				this.state = State.FAILED;
			}
			catch (RuntimeException ex) {
				log.error("Game review failed", ex);
				this.error = "The review failed.";
				this.state = State.FAILED;
			}
		}

	}

	// --- The API -------------------------------------------------------------------------------------

	/**
	 * Starts a review of a finished game, or gives the one already running or done for it (asking
	 * twice starts nothing new). A cancelled or failed review starts again; positions already analysed
	 * come from the cache.
	 */
	ReviewResponse start(Owner owner, UUID matchId) {
		ChessAiService.requireAdmin(owner);
		forgetOld();
		ChessMatch match = this.chess.owned(owner, matchId);
		if (match.status() != Status.FINISHED) {
			throw new ConflictException(REVIEW_NEEDS_FINISHED_GAME, "Only a finished game can be reviewed");
		}
		Job existing = this.jobs.get(matchId);
		if (existing != null && existing.userId.equals(owner.userId())
				&& (existing.state == State.QUEUED || existing.state == State.RUNNING || existing.state == State.DONE)) {
			existing.lastAskedAt = this.clock.instant();
			return view(existing);
		}
		ChessGame game = match.game();
		if (game.moves().size() > this.settings.maxPlies()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, REVIEW_TOO_LONG,
					"Games of up to " + this.settings.maxPlies() + " moves can be reviewed");
		}
		this.limiter.check(owner.userId());
		String engineName;
		try {
			engineName = this.engine.engineName();
		}
		catch (EngineException ex) {
			throw EngineErrors.toApi(ex, "review");
		}
		Job job = new Job(matchId, owner.userId(), game, match.termination(), engineName, this.clock.instant());
		try {
			this.executor.execute(job);
		}
		catch (RejectedExecutionException ex) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, REVIEW_QUEUE_FULL,
					"Too many reviews are waiting. Try again in a moment.");
		}
		this.jobs.put(matchId, job);
		return view(job);
	}

	/** The review's progress and the moves reviewed so far. Asking keeps a running review alive. */
	ReviewResponse get(Owner owner, UUID matchId) {
		ChessAiService.requireAdmin(owner);
		Job job = owned(owner, matchId);
		job.lastAskedAt = this.clock.instant();
		return view(job);
	}

	/** Stops a review; the current position's search is told to stop at once. */
	ReviewResponse cancel(Owner owner, UUID matchId) {
		ChessAiService.requireAdmin(owner);
		Job job = owned(owner, matchId);
		job.cancelled = true;
		if (this.executor.remove(job) || job.state == State.QUEUED) {
			job.state = State.CANCELLED;
		}
		return view(job);
	}

	private Job owned(Owner owner, UUID matchId) {
		Job job = this.jobs.get(matchId);
		if (job == null || !job.userId.equals(owner.userId())) {
			throw new NotFoundException("Review", matchId);
		}
		return job;
	}

	private void forgetOld() {
		Instant cutoff = this.clock.instant().minus(this.settings.keptFor());
		this.jobs.values().removeIf((job) -> job.created.isBefore(cutoff) && job.state != State.RUNNING);
	}

	@PreDestroy
	void shutdown() {
		this.jobs.values().forEach((job) -> job.cancelled = true);
		this.executor.shutdownNow();
	}

	// --- Analysis ------------------------------------------------------------------------------------

	private PositionAnalysis analyse(Job job, int ply) {
		ChessGame game = job.game;
		Position position = game.positions().get(ply);
		boolean last = ply == game.moves().size();
		if (last && job.termination != null && job.termination.automatic()) {
			// Mate, stalemate and the automatic draws need no search.
			Color winner = (job.termination == Termination.CHECKMATE) ? position.turn().opposite() : null;
			return new PositionAnalysis(Evaluation.finished(winner), null, List.of(), Integer.MAX_VALUE, true, true);
		}
		SearchRequest request = EnginePositions.request(game, ply,
				new SearchRequest.Limits(this.settings.depth(), (int) this.settings.movetime().toMillis(), null), 1,
				SearchRequest.Strength.FULL);
		String key = this.cache.key(job.engineName, request);
		SearchResult result = this.cache.get(key);
		if (result == null) {
			result = searchWhenFree(job, request);
			this.cache.put(key, result);
		}
		SearchResult.Line best = result.best();
		if (best == null) {
			throw new EngineException(EngineException.Kind.PROTOCOL, "No line for a position of the game");
		}
		return new PositionAnalysis(Evaluation.fromEngine(best.score(), position.turn()), result.bestMove(), best.pv(),
				result.depth(), best.score().isExact(), false);
	}

	/** Searches, waiting politely while every engine is busy with players' requests. */
	private SearchResult searchWhenFree(Job job, SearchRequest request) {
		Duration budget = this.settings.movetime().plus(MARGIN);
		for (int attempt = 1;; attempt++) {
			try {
				return this.engine.search(request, budget, job::stopRequested);
			}
			catch (EngineException ex) {
				if (ex.kind() != EngineException.Kind.BUSY || attempt >= BUSY_ATTEMPTS || job.stopRequested()) {
					throw ex;
				}
			}
			try {
				Thread.sleep(BUSY_PAUSE.toMillis());
			}
			catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
				throw new EngineException(EngineException.Kind.CANCELLED, "Review interrupted", ex);
			}
		}
	}

	// --- The view ------------------------------------------------------------------------------------

	private ReviewResponse view(Job job) {
		// The state first: a job is DONE (or FAILED, with its error) only after its last result is in,
		// so a review read as finished is never missing moves.
		State state = job.state;
		ChessGame game = job.game;
		int analysed = 0;
		for (int ply = 0; ply < job.results.length(); ply++) {
			if (job.results.get(ply) != null) {
				analysed++;
			}
		}
		List<ReviewedMove> moves = new ArrayList<>();
		for (int ply = 0; ply < game.moves().size(); ply++) {
			PositionAnalysis before = job.results.get(ply);
			PositionAnalysis after = job.results.get(ply + 1);
			if (before == null || after == null) {
				break;
			}
			moves.add(reviewed(game, ply, before, after));
		}
		return new ReviewResponse(job.matchId, state.name(), analysed, job.results.length(), moves, job.engineName,
				new ReviewSettings(this.settings.movetime().toMillis(), this.settings.depth(), this.settings.minDepth()),
				job.error);
	}

	private ReviewedMove reviewed(ChessGame game, int ply, PositionAnalysis before, PositionAnalysis after) {
		Position position = game.positions().get(ply);
		Move played = game.moves().get(ply);
		Color mover = position.turn();
		Move best = EnginePositions.legal(position, before.bestMove());
		boolean sufficient = before.exact() && before.depth() >= this.settings.minDepth()
				&& (after.finished() || (after.exact() && after.depth() >= this.settings.minDepth()));
		MoveClassifier.Judgement judgement = MoveClassifier.classify(mover, position.legalMoves().size() == 1,
				played.equals(best), before.evaluation(), after.evaluation(), sufficient);
		SuggestedMove bestMove = (best != null) ? EngineViews.suggested(position, best) : null;
		List<String> bestLine = EnginePositions.sanLine(position, before.pv(), 6);
		EvaluationView beforeView = EngineViews.evaluation(before.evaluation());
		EvaluationView afterView = EngineViews.evaluation(after.evaluation());
		Double loss = (judgement.loss() != null) ? Math.round(judgement.loss() * 10) / 10.0 : null;
		int depth = Math.min(before.depth(), after.depth());
		return new ReviewedMove(ply + 1, mover, played.uci(), San.of(position, played), Square.name(played.from()),
				Square.name(played.to()), position.toFen(), game.positions().get(ply + 1).toFen(), bestMove, bestLine,
				beforeView, afterView, judgement.label(), loss, depth);
	}

}
