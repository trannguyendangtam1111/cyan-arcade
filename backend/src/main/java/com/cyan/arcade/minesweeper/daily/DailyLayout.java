package com.cyan.arcade.minesweeper.daily;

import java.util.Arrays;
import java.util.stream.IntStream;

/**
 * Where a day's mines are, on the server only: laid once from the day's seed around the day's opening
 * cell ({@link #lay}), then stored and read back ({@link #withMines}). The opening cell and its
 * neighbours are kept clear, so every attempt opens on an empty area; the mines are a seeded partial
 * shuffle of the other cells, drawn with mulberry32, the generator the Minesweeper engine uses.
 *
 * <p>This is the Daily Board's own copy of the engine's way of laying mines: the platform keeps out
 * of the games' run rules, which the Daily Board, played on the server, does not need.
 *
 * <p>Immutable.
 */
final class DailyLayout {

	private final DailyBoard board;

	private final boolean[] mines;

	private DailyLayout(DailyBoard board, boolean[] mines) {
		this.board = board;
		this.mines = mines;
	}

	/**
	 * @param seed only its low 32 bits count
	 * @param startCell the day's opening cell, kept clear with its neighbours
	 */
	static DailyLayout lay(DailyBoard board, long seed, int startCell) {
		int cells = board.cells();
		if (startCell < 0 || startCell >= cells) {
			throw new IllegalArgumentException("Cell " + startCell + " is not on a " + board + " board");
		}
		boolean[] keepClear = new boolean[cells];
		keepClear[startCell] = true;
		int[] around = board.neighbours(startCell);
		for (int neighbour : around) {
			keepClear[neighbour] = true;
		}
		boolean roomAround = cells - (around.length + 1) >= board.mines();
		int[] allowed = IntStream.range(0, cells)
			.filter((index) -> roomAround ? !keepClear[index] : index != startCell)
			.toArray();
		int state = (int) seed;
		for (int pick = 0; pick < board.mines(); pick++) {
			state += 0x6D2B79F5;
			int t = state;
			t = (t ^ (t >>> 15)) * (t | 1);
			t ^= t + (t ^ (t >>> 7)) * (t | 61);
			long bits = Integer.toUnsignedLong(t ^ (t >>> 14));
			int chosen = pick + (int) Math.floor(bits / 4294967296.0 * (allowed.length - pick));
			int swapped = allowed[pick];
			allowed[pick] = allowed[chosen];
			allowed[chosen] = swapped;
		}
		boolean[] mines = new boolean[cells];
		for (int pick = 0; pick < board.mines(); pick++) {
			mines[allowed[pick]] = true;
		}
		return new DailyLayout(board, mines);
	}

	/** A board with its mines on the given cells: a day's stored layout. */
	static DailyLayout withMines(DailyBoard board, int[] mineCells) {
		boolean[] mines = new boolean[board.cells()];
		for (int cell : mineCells) {
			if (cell < 0 || cell >= mines.length || mines[cell]) {
				throw new IllegalArgumentException("Mine cell " + cell + " is off the board or given twice");
			}
			mines[cell] = true;
		}
		if (mineCells.length != board.mines()) {
			throw new IllegalArgumentException("A " + board + " board has " + board.mines() + " mines, not "
					+ mineCells.length);
		}
		return new DailyLayout(board, mines);
	}

	DailyBoard board() {
		return this.board;
	}

	boolean isMine(int cell) {
		return this.mines[cell];
	}

	/** The mines' cells, lowest first. */
	int[] mineCells() {
		return IntStream.range(0, this.mines.length).filter((cell) -> this.mines[cell]).toArray();
	}

	/** How many of the cell's neighbours are mines. */
	int adjacent(int cell) {
		return (int) Arrays.stream(this.board.neighbours(cell)).filter((other) -> this.mines[other]).count();
	}

}
