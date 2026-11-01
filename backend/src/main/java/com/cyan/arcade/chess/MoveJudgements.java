package com.cyan.arcade.chess;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.chess.ChessViews.EvaluationView;
import com.cyan.arcade.chess.ChessViews.ReviewSummary;
import com.cyan.arcade.chess.ChessViews.ReviewedMove;
import com.cyan.arcade.chess.ChessViews.SideSummary;
import com.cyan.arcade.chess.ChessViews.SuggestedMove;
import com.cyan.arcade.chess.analysis.Accuracy;
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
import com.cyan.arcade.chess.stockfish.SearchResult;

/**
 * How one move of a game is judged, the same for a game review and for Coach Mode: the analysis of
 * the position before it (what the engine would play, and how good that is) against the analysis of
 * the position after it, both from White's side, labelled by {@link MoveClassifier}.
 */
final class MoveJudgements {

	/** Moves of the engine's preferred line shown with a judged move. */
	static final int BEST_LINE = 6;

	private MoveJudgements() {
	}

	/**
	 * Each side's accuracy and labels over judged moves. Forced and unrated moves are counted under
	 * their labels but left out of the accuracy (no choice, or too shallow an analysis to say).
	 */
	static ReviewSummary summary(List<ReviewedMove> moves) {
		return new ReviewSummary(side(moves, Color.WHITE), side(moves, Color.BLACK));
	}

	private static SideSummary side(List<ReviewedMove> moves, Color color) {
		Map<MoveClassifier.MoveClass, Integer> counts = new EnumMap<>(MoveClassifier.MoveClass.class);
		List<Double> losses = new ArrayList<>();
		for (ReviewedMove move : moves) {
			if (move.color() != color) {
				continue;
			}
			counts.merge(move.classification(), 1, Integer::sum);
			boolean rated = move.classification() != MoveClassifier.MoveClass.FORCED
					&& move.classification() != MoveClassifier.MoveClass.UNRATED && move.loss() != null;
			if (rated) {
				losses.add(move.loss());
			}
		}
		Double accuracy = Accuracy.ofMoves(losses);
		Double shown = (accuracy != null) ? Math.round(accuracy * 10) / 10.0 : null;
		return new SideSummary(shown, losses.size(), counts);
	}

	/** What one position's analysis found, from White's side. */
	record PositionAnalysis(Evaluation evaluation, String bestMove, List<String> pv, int depth, boolean exact,
			boolean finished) {
	}

	/**
	 * The position after {@code ply} moves when the game ended there by itself (mate, stalemate, an
	 * automatic draw): its result, with no search. {@code null} for any other position.
	 */
	static PositionAnalysis finishedAt(ChessGame game, int ply, Termination termination) {
		boolean last = ply == game.moves().size();
		if (!last || termination == null || !termination.automatic()) {
			return null;
		}
		Position position = game.positions().get(ply);
		Color winner = (termination == Termination.CHECKMATE) ? position.turn().opposite() : null;
		return new PositionAnalysis(Evaluation.finished(winner), null, List.of(), Integer.MAX_VALUE, true, true);
	}

	/**
	 * A search's finding about a position. An answer whose best move is not legal there is the
	 * engine failing, not an opinion to judge by.
	 */
	static PositionAnalysis of(SearchResult result, Position position) {
		SearchResult.Line best = result.best();
		if (best == null) {
			throw new EngineException(EngineException.Kind.PROTOCOL, "No line for a position of the game");
		}
		if (result.bestMove() != null && EnginePositions.legal(position, result.bestMove()) == null) {
			throw new EngineException(EngineException.Kind.PROTOCOL, "The engine's best move is not legal there");
		}
		return new PositionAnalysis(Evaluation.fromEngine(best.score(), position.turn()), result.bestMove(), best.pv(),
				result.depth(), best.score().isExact(), false);
	}

	/**
	 * Judges the move {@code index} (0 for White's first) from the analyses around it. A move is rated
	 * only when both analyses are exact and at least {@code minDepth} deep (a finished position needs
	 * no depth); otherwise it is Unrated, and nothing is claimed about it.
	 */
	static ReviewedMove judge(ChessGame game, int index, PositionAnalysis before, PositionAnalysis after, int minDepth,
			MoveClassifier.Thresholds limits) {
		Position position = game.positions().get(index);
		Move played = game.moves().get(index);
		Color mover = position.turn();
		Move best = EnginePositions.legal(position, before.bestMove());
		boolean sufficient = before.exact() && before.depth() >= minDepth
				&& (after.finished() || (after.exact() && after.depth() >= minDepth));
		MoveClassifier.Judgement judgement = MoveClassifier.classify(mover, position.legalMoves().size() == 1,
				played.equals(best), before.evaluation(), after.evaluation(), sufficient, limits);
		SuggestedMove bestMove = (best != null) ? EngineViews.suggested(position, best) : null;
		List<String> bestLine = EnginePositions.sanLine(position, before.pv(), BEST_LINE);
		EvaluationView beforeView = EngineViews.evaluation(before.evaluation());
		EvaluationView afterView = EngineViews.evaluation(after.evaluation());
		Double loss = (judgement.loss() != null) ? Math.round(judgement.loss() * 10) / 10.0 : null;
		int depth = Math.min(before.depth(), after.depth());
		return new ReviewedMove(index + 1, mover, played.uci(), San.of(position, played), Square.name(played.from()),
				Square.name(played.to()), position.toFen(), game.positions().get(index + 1).toFen(), bestMove, bestLine,
				beforeView, afterView, judgement.label(), loss, depth);
	}

}
