package com.cyan.arcade.gamerules;

import java.util.Map;
import java.util.stream.IntStream;

/**
 * A Minesweeper board's size and how many mines it hides, as the engine's {@code MinesweeperConfig}
 * ({@code frontend/src/games/minesweeper/engine}). Cells are numbered row by row: the cell at row
 * {@code r}, column {@code c} is {@code r × columns + c}.
 *
 * <p>The standard boards mirror the engine's {@code BOARDS}. Classic and the timed Beginner are played on
 * {@link #BEGINNER}, the timed Intermediate and Expert on the others.
 */
record MinesweeperBoard(int rows, int columns, int mines) {

	/** 9 × 9 with 10 mines: Classic's board. */
	static final MinesweeperBoard BEGINNER = new MinesweeperBoard(9, 9, 10);

	/** 16 × 16 with 40 mines. */
	static final MinesweeperBoard INTERMEDIATE = new MinesweeperBoard(16, 16, 40);

	/** 16 rows of 30 columns with 99 mines. */
	static final MinesweeperBoard EXPERT = new MinesweeperBoard(16, 30, 99);

	MinesweeperBoard {
		if (rows < 1 || columns < 1) {
			throw new IllegalArgumentException("A board has at least one row and one column");
		}
		// The first reveal is never a mine, so at least one cell must stay clear.
		if (mines < 1 || mines >= rows * columns) {
			throw new IllegalArgumentException("A " + rows + " × " + columns + " board cannot hide " + mines + " mines");
		}
	}

	int cells() {
		return this.rows * this.columns;
	}

	/** The cells a player must uncover to win. */
	int safeCells() {
		return cells() - this.mines;
	}

	/** The indexes of a cell's neighbours, up to eight, in the engine's order (row by row). */
	int[] neighbours(int index) {
		int row = index / this.columns;
		int column = index % this.columns;
		return IntStream.rangeClosed(-1, 1)
			.flatMap((dr) -> IntStream.rangeClosed(-1, 1)
				.filter((dc) -> (dr != 0 || dc != 0) && row + dr >= 0 && row + dr < this.rows && column + dc >= 0
						&& column + dc < this.columns)
				.map((dc) -> (row + dr) * this.columns + column + dc))
			.toArray();
	}

	/** Whether a run's {@code rows}, {@code columns} and {@code mines} details name this board. */
	boolean isNamedBy(Map<String, Integer> details) {
		return details.get("rows") == this.rows && details.get("columns") == this.columns
				&& details.get("mines") == this.mines;
	}

}
