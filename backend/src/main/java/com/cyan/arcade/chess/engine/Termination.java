package com.cyan.arcade.chess.engine;

/**
 * How a game ended. The automatic ones end the game by themselves the moment the position arises;
 * the others need a player to do something: resign, agree to a draw, or claim one.
 */
public enum Termination {

	CHECKMATE(true), STALEMATE(true), INSUFFICIENT_MATERIAL(true), FIVEFOLD_REPETITION(true),
	SEVENTY_FIVE_MOVE_RULE(true),

	RESIGNATION(false), AGREEMENT(false), THREEFOLD_REPETITION(false), FIFTY_MOVE_RULE(false);

	private final boolean automatic;

	Termination(boolean automatic) {
		this.automatic = automatic;
	}

	public boolean automatic() {
		return this.automatic;
	}

	/** A draw a player may claim (FIDE Laws 9.2 and 9.3), as opposed to one that ends the game itself. */
	public boolean claimable() {
		return this == THREEFOLD_REPETITION || this == FIFTY_MOVE_RULE;
	}

}
