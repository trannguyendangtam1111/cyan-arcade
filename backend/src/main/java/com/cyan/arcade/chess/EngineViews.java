package com.cyan.arcade.chess;

import com.cyan.arcade.chess.ChessViews.EvaluationView;
import com.cyan.arcade.chess.ChessViews.SuggestedMove;
import com.cyan.arcade.chess.analysis.Evaluation;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.engine.San;
import com.cyan.arcade.chess.engine.Square;

/** The engine's answers in the API's terms. */
final class EngineViews {

	private EngineViews() {
	}

	static EvaluationView evaluation(Evaluation evaluation) {
		return new EvaluationView(evaluation.kind().name(), evaluation.centipawns(), evaluation.mateIn(),
				evaluation.matingSide(), evaluation.display(), Math.round(evaluation.whiteWinPercent() * 10) / 10.0,
				evaluation.favoured(), evaluation.exact());
	}

	/** A move already checked to be legal in the position. */
	static SuggestedMove suggested(Position position, Move move) {
		return new SuggestedMove(Square.name(move.from()), Square.name(move.to()),
				(move.promotion() != null) ? String.valueOf(move.promotion().letter()) : null, move.uci(),
				San.of(position, move));
	}

}
