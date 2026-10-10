package com.cyan.arcade.chess.analysis;

import java.util.Locale;

import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.stockfish.EngineScore;

/**
 * An evaluation from White's point of view, whoever was to move: centipawns (positive favours
 * White), or a forced mate, kept apart from centipawns and never shown as one.
 *
 * <p>UCI reports scores for the side to move; {@link #fromEngine} turns them round for Black. A mate
 * score of 0 means the side to move is mated already.
 *
 * @param centipawns for {@code CENTIPAWNS}, White's advantage; 0 for a mate
 * @param mateIn for {@code MATE}, moves to mate (0: it is mate on the board); {@code null} otherwise
 * @param matingSide for {@code MATE}, the side that mates; {@code null} otherwise
 * @param exact {@code false} when the engine only reported a bound, which is no true evaluation
 */
public record Evaluation(Kind kind, int centipawns, Integer mateIn, Color matingSide, boolean exact) {

	public enum Kind {

		CENTIPAWNS, MATE

	}

	/** Scores are capped here for win chances and the evaluation bar: beyond it the result is clear. */
	static final int CAP = 1000;

	/** The logistic curve that turns centipawns into win chances (the one Lichess publishes). */
	static final double WIN_CURVE = 0.00368208;

	public Evaluation {
		if (kind == Kind.MATE && (mateIn == null || mateIn < 0 || matingSide == null)) {
			throw new IllegalArgumentException("A mate needs its distance and the mating side");
		}
		if (kind == Kind.CENTIPAWNS && (mateIn != null || matingSide != null)) {
			throw new IllegalArgumentException("Centipawns carry no mate");
		}
	}

	public static Evaluation centipawns(int whiteCentipawns, boolean exact) {
		return new Evaluation(Kind.CENTIPAWNS, whiteCentipawns, null, null, exact);
	}

	public static Evaluation mate(int moves, Color matingSide, boolean exact) {
		return new Evaluation(Kind.MATE, 0, moves, matingSide, exact);
	}

	/** A finished position: checkmate by {@code winner}, or a draw when {@code winner} is {@code null}. */
	public static Evaluation finished(Color winner) {
		return (winner == null) ? centipawns(0, true) : mate(0, winner, true);
	}

	/**
	 * @param score as UCI gave it, for the side to move
	 * @param sideToMove who was to move in the position searched
	 */
	public static Evaluation fromEngine(EngineScore score, Color sideToMove) {
		boolean exact = score.isExact();
		if (score.isMate()) {
			int moves = score.value();
			// Positive: the side to move mates; negative or zero: it is mated.
			Color mating = (moves > 0) ? sideToMove : sideToMove.opposite();
			return mate(Math.abs(moves), mating, exact);
		}
		int white = (sideToMove == Color.WHITE) ? score.value() : -score.value();
		return centipawns(white, exact);
	}

	public boolean isMate() {
		return this.kind == Kind.MATE;
	}

	/** White's chances in percent, 0 to 100: a mate is 0 or 100, centipawns go through the win curve. */
	public double whiteWinPercent() {
		if (isMate()) {
			return (this.matingSide == Color.WHITE) ? 100 : 0;
		}
		int capped = Math.max(-CAP, Math.min(CAP, this.centipawns));
		double chances = 2 / (1 + Math.exp(-WIN_CURVE * capped)) - 1;
		return 50 + 50 * chances;
	}

	/** The chances of one side, in percent. */
	public double winPercentFor(Color side) {
		double white = whiteWinPercent();
		return (side == Color.WHITE) ? white : 100 - white;
	}

	/** The side the evaluation favours, or {@code null} for level. */
	public Color favoured() {
		if (isMate()) {
			return this.matingSide;
		}
		if (this.centipawns == 0) {
			return null;
		}
		return (this.centipawns > 0) ? Color.WHITE : Color.BLACK;
	}

	/**
	 * Short text as boards show it: {@code +0.34}, {@code -1.20}, {@code 0.00}, {@code #3} (White
	 * mates in 3), {@code #-2} (Black mates in 2), {@code 1-0} or {@code 0-1} for mate on the board.
	 */
	public String display() {
		if (isMate()) {
			if (this.mateIn == 0) {
				return (this.matingSide == Color.WHITE) ? "1-0" : "0-1";
			}
			return (this.matingSide == Color.WHITE) ? "#" + this.mateIn : "#-" + this.mateIn;
		}
		double pawns = this.centipawns / 100.0;
		return (this.centipawns > 0 ? "+" : "") + String.format(Locale.ROOT, "%.2f", pawns);
	}

}
