package com.cyan.arcade.chess;

import java.time.Clock;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessViews.CoachResponse;
import com.cyan.arcade.chess.ChessViews.ReviewedMove;
import com.cyan.arcade.chess.MoveJudgements.PositionAnalysis;
import com.cyan.arcade.chess.analysis.EnginePositions;
import com.cyan.arcade.chess.analysis.MoveClassifier;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.stockfish.EngineException;
import com.cyan.arcade.chess.stockfish.SearchRequest;
import com.cyan.arcade.chess.stockfish.SearchResult;
import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Coach Mode: Stockfish's judgement of one move a player has just made, while the game goes on.
 *
 * <p>A move is judged as a game review judges it ({@link MoveJudgements}): the position before it and
 * the position after it, each searched briefly ({@code app.chess.coach}) through the same engine pool
 * and analysis cache as everything else. The request names a move the match has recorded (its ply and
 * UCI) and nothing else: the server finds the positions in the match itself, and a move that was taken
 * back is refused, so a judgement never lands on a move it was not for.
 *
 * <p>Coach Mode is for signed-in players and admins, for their own moves only (in a game against
 * Stockfish, not the engine's). It is bounded on its own terms, apart from the per-game hints: one
 * judgement at a time per account, at most {@code app.chess.coach.requests-per-minute} a minute (a
 * judgement found entirely in the cache costs nothing), and short searches. It gives no evaluation of
 * a position before a move is made, so it is not a hint, and it changes nothing in the match.
 */
@Service
class ChessCoachService {

	static final String COACH_MOVE_GONE = "COACH_MOVE_GONE";

	static final String COACH_BUSY = "COACH_BUSY";

	private static final Duration MARGIN = Duration.ofSeconds(1);

	private final ChessService chess;

	private final StockfishEngineAdapter engine;

	private final EngineAnalysisCache cache;

	private final EngineRateLimiter limiter;

	private final ChessAiProperties.Coach settings;

	private final MoveClassifier.Thresholds limits;

	private final Set<Long> judging = ConcurrentHashMap.newKeySet();

	ChessCoachService(ChessService chess, StockfishEngineAdapter engine, EngineAnalysisCache cache,
			ChessAiProperties properties, Clock clock) {
		this.chess = chess;
		this.engine = engine;
		this.cache = cache;
		this.settings = properties.coach();
		this.limits = properties.classification().thresholds();
		this.limiter = new EngineRateLimiter(this.settings.requestsPerMinute(), clock);
	}

	/**
	 * Judges the move at {@code ply} (1 for White's first) of the caller's match, which must be
	 * {@code uci} still.
	 */
	CoachResponse judge(Owner owner, UUID matchId, int ply, String uci) {
		if (!owner.isSignedIn()) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, ChessAiService.SIGN_IN_REQUIRED, "Sign in to use Coach Mode");
		}
		ChessMatch match = this.chess.owned(owner, matchId);
		ChessGame game = match.game();
		if (ply < 1 || ply > game.moves().size() || !game.moves().get(ply - 1).uci().equals(uci)) {
			throw new ConflictException(COACH_MOVE_GONE, "That move is no longer in the game");
		}
		Color mover = game.positions().get(ply - 1).turn();
		ChessService.requireSide(match, owner, mover);

		if (!this.judging.add(owner.userId())) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, COACH_BUSY,
					"The coach is still judging your last move. Try again in a moment.");
		}
		try {
			SearchRequest.Limits searchLimits = new SearchRequest.Limits(this.settings.depth(),
					(int) this.settings.movetime().toMillis(), null);
			SearchRequest beforeRequest = EnginePositions.request(game, ply - 1, searchLimits, 1,
					SearchRequest.Strength.FULL);
			SearchRequest afterRequest = EnginePositions.request(game, ply, searchLimits, 1, SearchRequest.Strength.FULL);
			SearchResult beforeResult = this.cache.get(this.cache.key(this.engine.knownEngineName(), beforeRequest));
			PositionAnalysis finished = MoveJudgements.finishedAt(game, ply, match.termination());
			SearchResult afterResult = (finished != null) ? null
					: this.cache.get(this.cache.key(this.engine.knownEngineName(), afterRequest));
			if (beforeResult == null || (finished == null && afterResult == null)) {
				// Only a judgement that needs the engine counts against the limit.
				this.limiter.check(owner.userId());
			}
			PositionAnalysis before = (beforeResult != null)
					? MoveJudgements.of(beforeResult, game.positions().get(ply - 1))
					: search(beforeRequest, game.positions().get(ply - 1));
			PositionAnalysis after = finished;
			if (after == null) {
				after = (afterResult != null) ? MoveJudgements.of(afterResult, game.positions().get(ply))
						: search(afterRequest, game.positions().get(ply));
			}
			ReviewedMove judged = MoveJudgements.judge(game, ply - 1, before, after, this.settings.minDepth(), this.limits);
			return new CoachResponse(match.id(), ply, judged, this.engine.knownEngineName());
		}
		catch (EngineException ex) {
			throw EngineErrors.toApi(ex, "coach");
		}
		finally {
			this.judging.remove(owner.userId());
		}
	}

	/** Searches a position, and keeps the result for reuse once it has proved usable. */
	private PositionAnalysis search(SearchRequest request, Position position) {
		SearchResult result = this.engine.search(request, this.settings.movetime().plus(MARGIN), () -> false);
		PositionAnalysis analysis = MoveJudgements.of(result, position);
		this.cache.put(this.cache.key(this.engine.knownEngineName(), request), result);
		return analysis;
	}

}
