package com.cyan.arcade.minesweeper.daily;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * The Daily Board's moves, played on the server as the engine plays them
 * ({@code frontend/src/games/minesweeper/engine/minesweeperEngine.ts}), without chording: a reveal
 * uncovers a cell, and a cell with no mine around it uncovers its neighbours too, on and on, passing
 * over flagged cells; uncovering a mine loses; uncovering every safe cell wins. Flags only mark cells,
 * never more of them than there are mines.
 *
 * <p>Works on the board as the player sees it (the characters of {@link DailyAttempt#cells()}); only
 * a reveal reads the mines.
 */
final class DailyPlay {

	static final char HIDDEN = 'H';

	static final char FLAGGED = 'F';

	static final char EXPLODED = 'X';

	enum Result {

		PLAYING, WON, LOST

	}

	/**
	 * @param changed whether the move changed the board; a move that did not leaves the attempt as it was
	 */
	record Move(Result result, boolean changed, char[] cells, int revealedCells, int flags) {
	}

	private DailyPlay() {
	}

	/** Uncovers a cell. A cell already uncovered or flagged stays as it is. */
	static Move reveal(DailyLayout layout, char[] cells, int revealedCells, int flags, int cell) {
		if (cells[cell] != HIDDEN) {
			return new Move(Result.PLAYING, false, cells, revealedCells, flags);
		}
		char[] next = cells.clone();
		if (layout.isMine(cell)) {
			next[cell] = EXPLODED;
			return new Move(Result.LOST, true, next, revealedCells, flags);
		}
		int revealed = revealedCells;
		Deque<Integer> open = new ArrayDeque<>();
		next[cell] = digit(layout.adjacent(cell));
		revealed++;
		open.push(cell);
		while (!open.isEmpty()) {
			int from = open.pop();
			if (next[from] != '0') {
				continue;
			}
			for (int neighbour : layout.board().neighbours(from)) {
				if (next[neighbour] != HIDDEN || layout.isMine(neighbour)) {
					continue;
				}
				next[neighbour] = digit(layout.adjacent(neighbour));
				revealed++;
				open.push(neighbour);
			}
		}
		Result result = (revealed == layout.board().safeCells()) ? Result.WON : Result.PLAYING;
		return new Move(result, true, next, revealed, flags);
	}

	/**
	 * Puts a flag on a covered cell or takes it off. Asking for what the cell already has changes
	 * nothing, so the same request may be sent again; so does a flag on an uncovered cell, or one more
	 * flag than there are mines.
	 */
	static Move flag(char[] cells, int revealedCells, int flags, int mines, int cell, boolean flagged) {
		char now = cells[cell];
		boolean change = flagged ? (now == HIDDEN && flags < mines) : (now == FLAGGED);
		if (!change) {
			return new Move(Result.PLAYING, false, cells, revealedCells, flags);
		}
		char[] next = cells.clone();
		next[cell] = flagged ? FLAGGED : HIDDEN;
		return new Move(Result.PLAYING, true, next, revealedCells, flags + (flagged ? 1 : -1));
	}

	private static char digit(int adjacent) {
		return (char) ('0' + adjacent);
	}

}
