package com.cyan.arcade.chess.engine;

/**
 * The six kinds of piece, with the letter that names them in FEN, UCI and SAN, and their usual
 * value in pawns (for showing who is ahead; the rules never use it).
 */
public enum PieceType {

	PAWN('p', 1), KNIGHT('n', 3), BISHOP('b', 3), ROOK('r', 5), QUEEN('q', 9), KING('k', 0);

	private final char letter;

	private final int value;

	PieceType(char letter, int value) {
		this.letter = letter;
		this.value = value;
	}

	/** Lower case: {@code p n b r q k}. */
	public char letter() {
		return this.letter;
	}

	public int value() {
		return this.value;
	}

	/** What a pawn may become on the last rank. */
	public boolean isPromotion() {
		return this == KNIGHT || this == BISHOP || this == ROOK || this == QUEEN;
	}

	/** @return the type for a letter in either case, or {@code null} for anything else */
	public static PieceType fromLetter(char letter) {
		char lower = Character.toLowerCase(letter);
		for (PieceType type : values()) {
			if (type.letter == lower) {
				return type;
			}
		}
		return null;
	}

}
