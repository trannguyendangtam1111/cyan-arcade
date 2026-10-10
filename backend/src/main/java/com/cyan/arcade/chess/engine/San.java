package com.cyan.arcade.chess.engine;

/**
 * Standard algebraic notation: {@code e4}, {@code Nf3}, {@code exd5}, {@code Raxe1}, {@code e8=Q+},
 * {@code O-O-O}, {@code Qh4#}. A piece's move names its file, else its rank, else both, only when
 * another piece of the same kind could legally go to the same square (a pinned one cannot, so it
 * never needs telling apart).
 */
public final class San {

	private San() {
	}

	/**
	 * @param move a legal move in that position
	 * @throws IllegalArgumentException when it is not
	 */
	public static String of(Position position, Move move) {
		Position after = position.play(move);
		StringBuilder san = new StringBuilder(8);
		Piece piece = position.pieceAt(move.from());
		if (position.isCastling(move)) {
			san.append((Square.file(move.to()) == 6) ? "O-O" : "O-O-O");
		}
		else if (piece.type() == PieceType.PAWN) {
			if (position.capturedBy(move) != null) {
				san.append((char) ('a' + Square.file(move.from()))).append('x');
			}
			san.append(Square.name(move.to()));
			if (move.promotion() != null) {
				san.append('=').append(Character.toUpperCase(move.promotion().letter()));
			}
		}
		else {
			san.append(Character.toUpperCase(piece.type().letter()));
			san.append(disambiguation(position, move, piece));
			if (position.capturedBy(move) != null) {
				san.append('x');
			}
			san.append(Square.name(move.to()));
		}
		if (after.inCheck()) {
			san.append(after.legalMoves().isEmpty() ? '#' : '+');
		}
		return san.toString();
	}

	private static String disambiguation(Position position, Move move, Piece piece) {
		boolean ambiguous = false;
		boolean sameFile = false;
		boolean sameRank = false;
		for (Move other : position.legalMoves()) {
			if (other.to() != move.to() || other.from() == move.from() || position.pieceAt(other.from()) != piece) {
				continue;
			}
			ambiguous = true;
			sameFile |= Square.file(other.from()) == Square.file(move.from());
			sameRank |= Square.rank(other.from()) == Square.rank(move.from());
		}
		if (!ambiguous) {
			return "";
		}
		String from = Square.name(move.from());
		if (!sameFile) {
			return from.substring(0, 1);
		}
		if (!sameRank) {
			return from.substring(1);
		}
		return from;
	}

}
