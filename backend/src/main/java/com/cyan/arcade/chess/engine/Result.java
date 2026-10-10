package com.cyan.arcade.chess.engine;

/**
 * How a finished game came out.
 *
 * @param winner the side that won, or {@code null} for a draw
 */
public record Result(Color winner, Termination termination) {

	public Result {
		if (termination == null) {
			throw new IllegalArgumentException("A result needs a termination");
		}
		boolean decisive = termination == Termination.CHECKMATE || termination == Termination.RESIGNATION;
		if (decisive != (winner != null)) {
			throw new IllegalArgumentException(termination + " cannot end with winner " + winner);
		}
	}

	public static Result win(Color winner, Termination termination) {
		return new Result(winner, termination);
	}

	public static Result draw(Termination termination) {
		return new Result(null, termination);
	}

	public boolean isDraw() {
		return this.winner == null;
	}

	/** PGN's result tag: {@code 1-0}, {@code 0-1} or {@code 1/2-1/2}. */
	public String score() {
		if (this.winner == null) {
			return "1/2-1/2";
		}
		return (this.winner == Color.WHITE) ? "1-0" : "0-1";
	}

}
