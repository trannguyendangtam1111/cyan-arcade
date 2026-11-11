package com.cyan.arcade.minesweeper.daily;

import java.util.stream.IntStream;

/**
 * A Daily Board's size and how many mines it hides. Cells are numbered row by row: the cell at row
 * {@code r}, column {@code c} is {@code r × columns + c}, as in the Minesweeper engine.
 */
record DailyBoard(int rows, int columns, int mines) {

	DailyBoard {
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

	/** The indexes of a cell's neighbours, up to eight, row by row. */
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

}
