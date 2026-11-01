package com.cyan.arcade.chess;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.chess.ChessMatch.Mode;
import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessViews.DifficultyView;
import com.cyan.arcade.chess.ChessViews.EngineStatus;
import com.cyan.arcade.chess.ChessViews.EvaluationResponse;
import com.cyan.arcade.chess.ChessViews.HintAllowance;
import com.cyan.arcade.chess.ChessViews.HintResponse;
import com.cyan.arcade.chess.ChessViews.LineView;
import com.cyan.arcade.chess.ChessViews.MatchResponse;
import com.cyan.arcade.chess.ChessViews.SuggestedMove;
import com.cyan.arcade.chess.analysis.Difficulty;
import com.cyan.arcade.chess.analysis.EnginePositions;
import com.cyan.arcade.chess.analysis.Evaluation;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Piece;
import com.cyan.arcade.chess.engine.PieceType;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.engine.Result;
import com.cyan.arcade.chess.stockfish.EngineException;
import com.cyan.arcade.chess.stockfish.EngineScore;
import com.cyan.arcade.chess.stockfish.EnginePool;
import com.cyan.arcade.chess.stockfish.SearchRequest;
import com.cyan.arcade.chess.stockfish.SearchResult;
import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.ErrorCodes;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * What Chess asks of Stockfish: move hints, the engine's moves in a game against it, and position
 * evaluations. The engine only ever proposes; every move it gives is checked by the rules before it
 * is shown or played, and nothing here changes a match except an engine move, which goes through
 * the same rules and the same revision check as a player's.
 *
 * <p>Who may do what is decided here from the role on the caller's session (the security rules
 * check it as well): hints for signed-in players, {@code app.chess.hints-per-game} per match for a
 * player and no limit for an admin; games against the engine and evaluations for admins only.
 */
@Service
class ChessAiService {

	static final String HINT_LIMIT_REACHED = "HINT_LIMIT_REACHED";

	static final String SIGN_IN_REQUIRED = "SIGN_IN_REQUIRED";

	static final String NOT_AN_ENGINE_GAME = "NOT_AN_ENGINE_GAME";

	static final String NOT_ENGINE_TURN = "NOT_ENGINE_TURN";

	static final String ANALYSIS_NOT_ALLOWED = "ANALYSIS_NOT_ALLOWED";

	/** Moves of a principal variation shown. */
	static final int LINE_LENGTH = 10;

	/** Added to a search's own time before it is told to stop. */
	private static final Duration MARGIN = Duration.ofSeconds(1);

	private final ChessService chess;

	private final ChessMatchStore store;

	private final StockfishEngineAdapter engine;

	private final EngineAnalysisCache cache;

	private final EngineRateLimiter limiter;

	private final ChessAiProperties properties;

	private final TransactionTemplate transaction;

	ChessAiService(ChessService chess, ChessMatchStore store, StockfishEngineAdapter engine, EngineAnalysisCache cache,
			EngineRateLimiter limiter, ChessAiProperties properties, TransactionTemplate transaction) {
		this.chess = chess;
		this.store = store;
		this.engine = engine;
		this.cache = cache;
		this.limiter = limiter;
		this.properties = properties;
		this.transaction = transaction;
	}

	// --- Hints ---------------------------------------------------------------------------------------

	/**
	 * The engine's best move for the current position, for the side to move. It changes nothing on
	 * the board, and it is counted only once it has been found: a refused request, an engine failure
	 * or a timeout costs the player nothing. The match is locked while the hint is worked out, so two
	 * requests at once cannot both take the last hint, and the board cannot change under it.
	 */
	HintResponse hint(Owner owner, UUID matchId, int revision) {
		if (!owner.isSignedIn()) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, SIGN_IN_REQUIRED, "Sign in to get move hints");
		}
		ChessMatch match = this.chess.owned(owner, matchId);
		ChessGame game = checkHint(match, owner, revision);
		this.limiter.check(owner.userId());

		int ply = game.moves().size();
		SearchRequest request = EnginePositions.request(game, ply,
				new SearchRequest.Limits(this.properties.hints().depth(), (int) this.properties.hints().movetime().toMillis(),
						null),
				1, SearchRequest.Strength.FULL);
		String key = this.cache.key(this.engine.knownEngineName(), request);
		SearchResult cached = this.cache.get(key);
		Duration budget = this.properties.hints().movetime().plus(MARGIN);
		try (EnginePool.Lease lease = (cached == null) ? this.engine.acquire() : null) {
			return this.transaction.execute((status) -> {
				ChessMatch locked = this.chess.ownedForUpdate(owner, matchId);
				ChessGame current = checkHint(locked, owner, revision);
				SearchResult result = (cached != null) ? cached
						: this.engine.search(lease, request, budget, () -> false);
				Position position = current.position();
				Move best = EnginePositions.legal(position, result.bestMove());
				if (best == null) {
					throw new EngineException(EngineException.Kind.PROTOCOL, "The engine's hint is not a legal move");
				}
				this.cache.put(this.cache.key(this.engine.knownEngineName(), request), result);
				this.store.countHint(matchId);
				ChessMatch counted = locked.withHintCounted();
				List<String> line = (result.best() != null)
						? EnginePositions.sanLine(position, result.best().pv(), LINE_LENGTH)
						: List.of(EngineViews.suggested(position, best).san());
				// The score of the searched position is the score with the engine's move played.
				Evaluation evaluation = (result.best() != null)
						? Evaluation.fromEngine(result.best().score(), position.turn()) : null;
				return new HintResponse(locked.revision(), EngineViews.suggested(position, best), line, result.depth(),
						this.engine.knownEngineName(), this.chess.hintsOf(counted, owner),
						(evaluation != null) ? EngineViews.evaluation(evaluation) : null, ideasOf(position, best, result));
			});
		}
		catch (EngineException ex) {
			throw EngineErrors.toApi(ex, "hint");
		}
	}

	/**
	 * What a suggested move does, as the rules and the engine's own score show it: checkmate, a forced
	 * mate the engine found, a capture, a check, a promotion, castling. A quiet move gets none; nothing
	 * is said that the position and the search do not show.
	 */
	static List<String> ideasOf(Position position, Move move, SearchResult result) {
		List<String> ideas = new ArrayList<>();
		Position after = position.play(move);
		if (after.inCheck() && after.legalMoves().isEmpty()) {
			ideas.add("It is checkmate.");
			return ideas;
		}
		EngineScore score = (result.best() != null) ? result.best().score() : null;
		if (score != null && score.isMate() && score.isExact() && score.value() > 0) {
			ideas.add("Stockfish finds a forced mate in " + score.value() + ".");
		}
		Piece taken = position.capturedBy(move);
		if (taken != null) {
			ideas.add("It captures a " + pieceName(taken.type()) + (position.isEnPassant(move) ? " en passant." : "."));
		}
		if (move.promotion() != null) {
			ideas.add("It promotes the pawn to a " + pieceName(move.promotion()) + ".");
		}
		if (position.isCastling(move)) {
			ideas.add("It castles.");
		}
		if (after.inCheck()) {
			ideas.add("It gives check.");
		}
		return ideas;
	}

	private static String pieceName(PieceType type) {
		return type.name().toLowerCase(java.util.Locale.ROOT);
	}

	/** The checks for a hint: the match on, at that revision, the caller's turn, a hint left. */
	private ChessGame checkHint(ChessMatch match, Owner owner, int revision) {
		ChessService.requireCurrent(match, revision);
		ChessGame game = match.game();
		ChessService.requireSide(match, owner, game.position().turn());
		HintAllowance allowance = this.chess.hintsOf(match, owner);
		if (!allowance.allowed() || (allowance.remaining() != null && allowance.remaining() <= 0)) {
			throw new ConflictException(HINT_LIMIT_REACHED,
					"No hints left in this game (" + allowance.limit() + " per game). A new game brings new ones.");
		}
		return game;
	}

	// --- Games against Stockfish (admins) ------------------------------------------------------------

	MatchResponse startEngineGame(Owner owner, Color playerSide, Difficulty difficulty) {
		requireAdmin(owner);
		return this.chess.startAgainstEngine(owner, playerSide.opposite(), difficulty);
	}

	/**
	 * Has Stockfish play its move. The request names only the match and its revision; the move is the
	 * engine's, checked and played by the rules. A failed search changes nothing, so the request can
	 * simply be sent again.
	 */
	MatchResponse engineMove(Owner owner, UUID matchId, int revision) {
		requireAdmin(owner);
		ChessMatch match = this.chess.owned(owner, matchId);
		ChessGame game = checkEngineTurn(match, revision);
		this.limiter.check(owner.userId());

		Difficulty difficulty = match.difficulty();
		SearchRequest request = EnginePositions.request(game, game.moves().size(), difficulty.limits(), 1,
				difficulty.strength());
		Duration budget = Duration.ofMillis(difficulty.movetimeMs()).plus(MARGIN);
		try (EnginePool.Lease lease = this.engine.acquire()) {
			return this.transaction.execute((status) -> {
				ChessMatch locked = this.chess.ownedForUpdate(owner, matchId);
				ChessGame current = checkEngineTurn(locked, revision);
				SearchResult result = this.engine.search(lease, request, budget, () -> false);
				Move move = EnginePositions.legal(current.position(), result.bestMove());
				if (move == null) {
					throw new EngineException(EngineException.Kind.PROTOCOL, "The engine's move is not legal here");
				}
				return this.chess.view(this.chess.playEngineMove(locked, move), owner);
			});
		}
		catch (EngineException ex) {
			throw EngineErrors.toApi(ex, "engine move");
		}
	}

	private static ChessGame checkEngineTurn(ChessMatch match, int revision) {
		if (match.mode() != Mode.AI) {
			throw new ConflictException(NOT_AN_ENGINE_GAME, "This is not a game against Stockfish");
		}
		ChessService.requireCurrent(match, revision);
		ChessGame game = match.game();
		if (game.position().turn() != match.engineSide()) {
			throw new ConflictException(NOT_ENGINE_TURN, "It is not Stockfish's turn");
		}
		return game;
	}

	// --- Evaluation (admins) -------------------------------------------------------------------------

	/**
	 * Stockfish's view of a position of the match (the one now, or the one after {@code ply} moves):
	 * an evaluation from White's side, the best move and up to a few principal variations. Read only;
	 * the final position of a finished game is answered from its result, without a search. The
	 * position is always the match's own, found by the server; the revision makes sure the caller
	 * was looking at the match as it is.
	 */
	EvaluationResponse evaluate(Owner owner, UUID matchId, int revision, Integer depth, Integer lines, Integer ply) {
		requireAdmin(owner);
		ChessAiProperties.Evaluation limits = this.properties.evaluation();
		int requestedDepth = (depth != null) ? depth : limits.defaultDepth();
		int requestedLines = (lines != null) ? lines : 1;
		if (requestedDepth < 1 || requestedDepth > limits.maxDepth() || requestedLines < 1
				|| requestedLines > limits.maxLines()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ANALYSIS_NOT_ALLOWED, "Depth must be 1 to " + limits.maxDepth()
					+ " and lines 1 to " + limits.maxLines());
		}
		ChessMatch match = this.chess.owned(owner, matchId);
		if (match.revision() != revision) {
			throw new ConflictException(ChessService.STALE_REVISION, "The match has changed since; showing it as it is now");
		}
		ChessGame game = match.game();
		int at = (ply != null) ? ply : game.moves().size();
		if (at > game.moves().size()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ANALYSIS_NOT_ALLOWED,
					"The match has " + game.moves().size() + " moves; there is no position after move " + at);
		}
		Position position = game.positions().get(at);
		if (game.isOver() && at == game.moves().size()) {
			Result result = game.result().orElseThrow();
			Evaluation finished = Evaluation.finished(result.winner());
			return new EvaluationResponse(match.revision(), at, position.turn(), EngineViews.evaluation(finished), null,
					List.of(), 0, requestedDepth, true, true, result.termination(), this.engine.knownEngineName());
		}
		this.limiter.check(owner.userId());

		SearchRequest request = EnginePositions.request(game, at,
				new SearchRequest.Limits(requestedDepth, (int) limits.maxMovetime().toMillis(), null), requestedLines,
				SearchRequest.Strength.FULL);
		try {
			String key = this.cache.key(this.engine.knownEngineName(), request);
			SearchResult cached = this.cache.get(key);
			SearchResult result = (cached != null) ? cached
					: this.engine.search(request, limits.maxMovetime().plus(MARGIN), () -> false);
			// Checked before it is kept: an unusable answer is never served again from the cache.
			EvaluationResponse response = evaluationOf(match, at, position, result, requestedDepth);
			if (cached == null) {
				this.cache.put(this.cache.key(this.engine.knownEngineName(), request), result);
			}
			return response;
		}
		catch (EngineException ex) {
			throw EngineErrors.toApi(ex, "evaluation");
		}
	}

	private EvaluationResponse evaluationOf(ChessMatch match, int ply, Position position, SearchResult result,
			int requestedDepth) {
		List<LineView> lines = new ArrayList<>();
		for (SearchResult.Line line : result.lines()) {
			Evaluation evaluation = Evaluation.fromEngine(line.score(), position.turn());
			List<String> pv = line.pv().subList(0, Math.min(LINE_LENGTH, line.pv().size()));
			List<String> san = EnginePositions.sanLine(position, pv, LINE_LENGTH);
			List<String> fens = EnginePositions.fenLine(position, pv, san.size());
			lines.add(new LineView(line.multipv(), EngineViews.evaluation(evaluation), san, pv.subList(0, san.size()), fens,
					line.depth()));
		}
		Move best = EnginePositions.legal(position, result.bestMove());
		if (best == null || lines.isEmpty()) {
			throw new EngineException(EngineException.Kind.PROTOCOL, "The engine gave no usable line");
		}
		SuggestedMove bestMove = EngineViews.suggested(position, best);
		boolean complete = !result.interrupted() && result.depth() >= requestedDepth
				&& lines.get(0).evaluation().exact();
		return new EvaluationResponse(match.revision(), ply, position.turn(), lines.get(0).evaluation(), bestMove, lines,
				result.depth(), requestedDepth, complete, false, null, this.engine.knownEngineName());
	}

	/** Whether the engine runs, and what it offers; starts an engine if none is running yet. */
	EngineStatus status(Owner owner) {
		requireAdmin(owner);
		String name;
		try {
			name = this.engine.engineName();
		}
		catch (EngineException ex) {
			EngineErrors.toApi(ex, "status");
			name = null;
		}
		List<DifficultyView> difficulties = Arrays.stream(Difficulty.values())
			.map((difficulty) -> new DifficultyView(difficulty, difficulty.label(), difficulty.setting(),
					difficulty.movetimeMs()))
			.toList();
		ChessAiProperties.Evaluation limits = this.properties.evaluation();
		return new EngineStatus(name != null, name, difficulties, limits.defaultDepth(), limits.maxDepth(),
				limits.maxLines(), this.properties.hintsPerGame());
	}

	static void requireAdmin(Owner owner) {
		if (!owner.isAdmin()) {
			throw new ApiException(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, "Admins only");
		}
	}

}
