package com.cyan.arcade.chess.engine;

/**
 * Squares are numbers from 0 to 63: {@code rank * 8 + file}, so a1 is 0, h1 is 7, a8 is 56 and h8
 * is 63. Files and ranks count from 0.
 */
public final class Square {

	public static final int NONE = -1;

	private Square() {
	}

	public static int of(int file, int rank) {
		return rank * 8 + file;
	}

	public static int file(int square) {
		return square & 7;
	}

	public static int rank(int square) {
		return square >> 3;
	}

	public static boolean onBoard(int file, int rank) {
		return file >= 0 && file < 8 && rank >= 0 && rank < 8;
	}

	/** Whether a square is a light one (h1 is light, a1 dark). */
	public static boolean isLight(int square) {
		return ((file(square) + rank(square)) & 1) == 1;
	}

	/** {@code "e4"}. */
	public static String name(int square) {
		return String.valueOf((char) ('a' + file(square))) + (char) ('1' + rank(square));
	}

	/**
	 * @return the square named, such as {@code "e4"}
	 * @throws IllegalArgumentException for anything that is not a square's name
	 */
	public static int parse(String name) {
		if (name == null || name.length() != 2) {
			throw new IllegalArgumentException("Not a square: " + name);
		}
		int file = name.charAt(0) - 'a';
		int rank = name.charAt(1) - '1';
		if (!onBoard(file, rank)) {
			throw new IllegalArgumentException("Not a square: " + name);
		}
		return of(file, rank);
	}

}
