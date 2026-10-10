package com.cyan.arcade.chess.stockfish;

/**
 * A score as UCI reports it, from the point of view of the side to move: centipawns, or moves to
 * mate (positive: the side to move mates; negative: it is mated; 0: it is mated already).
 *
 * @param bound {@code EXACT}, or a bound the search stopped at ({@code LOWER}, {@code UPPER}), which
 * is not a true evaluation
 */
public record EngineScore(Kind kind, int value, Bound bound) {

	public enum Kind {

		CENTIPAWNS, MATE

	}

	public enum Bound {

		EXACT, LOWER, UPPER

	}

	public static EngineScore centipawns(int value) {
		return new EngineScore(Kind.CENTIPAWNS, value, Bound.EXACT);
	}

	public static EngineScore mate(int moves) {
		return new EngineScore(Kind.MATE, moves, Bound.EXACT);
	}

	public boolean isMate() {
		return this.kind == Kind.MATE;
	}

	public boolean isExact() {
		return this.bound == Bound.EXACT;
	}

	/** The same score from the other side's point of view (a lower bound becomes an upper one). */
	public EngineScore negate() {
		Bound flipped = switch (this.bound) {
			case EXACT -> Bound.EXACT;
			case LOWER -> Bound.UPPER;
			case UPPER -> Bound.LOWER;
		};
		return new EngineScore(this.kind, -this.value, flipped);
	}

	/**
	 * The score from White's point of view.
	 * @param whiteToMove whether White was to move in the position the score is about
	 */
	public EngineScore forWhite(boolean whiteToMove) {
		return whiteToMove ? this : negate();
	}

}
