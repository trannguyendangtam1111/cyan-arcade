package com.cyan.arcade.chess.engine;

/** The two sides. White moves first. */
public enum Color {

	WHITE, BLACK;

	public Color opposite() {
		return (this == WHITE) ? BLACK : WHITE;
	}

	/** The rank pawns of this side move towards: +1 for White, -1 for Black. */
	int forward() {
		return (this == WHITE) ? 1 : -1;
	}

}
