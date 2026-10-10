package com.cyan.arcade.chess.engine;

/**
 * A move as the player gives it: from a square to a square, and what a pawn becomes on the last
 * rank. Castling is the king's two-square move (e1g1), en passant the pawn's diagonal step onto the
 * empty square behind the pawn it takes. Whether a move is legal depends on a {@link Position}.
 *
 * @param promotion the piece a pawn becomes, or {@code null} for every other move
 */
public record Move(int from, int to, PieceType promotion) {

	public Move {
		if (from < 0 || from > 63 || to < 0 || to > 63 || from == to) {
			throw new IllegalArgumentException("Not a move: " + from + " to " + to);
		}
		if (promotion != null && !promotion.isPromotion()) {
			throw new IllegalArgumentException("A pawn cannot become a " + promotion);
		}
	}

	public static Move of(int from, int to) {
		return new Move(from, to, null);
	}

	/**
	 * @param uci long algebraic notation: {@code e2e4}, {@code e7e8q}
	 * @throws IllegalArgumentException when the text is not a move's
	 */
	public static Move parse(String uci) {
		if (uci == null || (uci.length() != 4 && uci.length() != 5)) {
			throw new IllegalArgumentException("Not a move: " + uci);
		}
		int from = Square.parse(uci.substring(0, 2));
		int to = Square.parse(uci.substring(2, 4));
		PieceType promotion = null;
		if (uci.length() == 5) {
			char letter = uci.charAt(4);
			promotion = Character.isLowerCase(letter) ? PieceType.fromLetter(letter) : null;
			if (promotion == null || !promotion.isPromotion()) {
				throw new IllegalArgumentException("Not a move: " + uci);
			}
		}
		return new Move(from, to, promotion);
	}

	/** Long algebraic notation, as UCI writes it: {@code e2e4}, {@code e7e8q}. */
	public String uci() {
		String text = Square.name(this.from) + Square.name(this.to);
		return (this.promotion != null) ? text + this.promotion.letter() : text;
	}

	@Override
	public String toString() {
		return uci();
	}

}
