package com.cyan.arcade.chess.engine;

/** A piece of one side. In FEN White's are upper case ({@code K}) and Black's lower case ({@code k}). */
public record Piece(Color color, PieceType type) {

	private static final Piece[] ALL = new Piece[Color.values().length * PieceType.values().length];

	static {
		for (Color color : Color.values()) {
			for (PieceType type : PieceType.values()) {
				ALL[index(color, type)] = new Piece(color, type);
			}
		}
	}

	/** One shared instance per piece, so positions can be compared and copied cheaply. */
	public static Piece of(Color color, PieceType type) {
		return ALL[index(color, type)];
	}

	/** @return the piece a FEN letter stands for, or {@code null} for anything else */
	public static Piece fromFen(char letter) {
		PieceType type = PieceType.fromLetter(letter);
		if (type == null) {
			return null;
		}
		return of(Character.isUpperCase(letter) ? Color.WHITE : Color.BLACK, type);
	}

	public char fenLetter() {
		return (this.color == Color.WHITE) ? Character.toUpperCase(this.type.letter()) : this.type.letter();
	}

	private static int index(Color color, PieceType type) {
		return color.ordinal() * PieceType.values().length + type.ordinal();
	}

}
