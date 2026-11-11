package com.cyan.arcade.sudoku;

import java.util.ArrayList;
import java.util.List;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.sudoku.SudokuViews.NoteCell;
import com.cyan.arcade.sudoku.engine.Grid;

import org.springframework.http.HttpStatus;

/**
 * A run's pencil marks as they are stored: 81 cells in order, separated by commas, each its candidate
 * digits ascending ({@code "149,,23,..."}). The API lists only the cells that have notes.
 */
final class RunNotes {

	/** No notes at all: 81 empty cells. */
	static final String EMPTY = ",".repeat(Grid.CELLS - 1);

	private RunNotes() {
	}

	/**
	 * The stored form of the cells' notes. Each cell at most once, each digit 1-9 at most once per cell
	 * (the request's own checks have already limited cells to 0-80 and digits to 1-9).
	 */
	static String encode(List<NoteCell> cells) {
		String[] byCell = new String[Grid.CELLS];
		for (NoteCell cell : cells) {
			int index = cell.cell();
			if (index < 0 || index >= Grid.CELLS) {
				throw invalid("A note's cell is 0-80");
			}
			if (byCell[index] != null) {
				throw invalid("Cell " + index + " is listed twice");
			}
			boolean[] seen = new boolean[10];
			for (Integer digit : cell.digits()) {
				if (digit == null || digit < 1 || digit > 9) {
					throw invalid("A note is a digit 1-9");
				}
				if (seen[digit]) {
					throw invalid("Cell " + index + " lists " + digit + " twice");
				}
				seen[digit] = true;
			}
			StringBuilder digits = new StringBuilder();
			for (int digit = 1; digit <= 9; digit++) {
				if (seen[digit]) {
					digits.append(digit);
				}
			}
			byCell[index] = digits.toString();
		}
		StringBuilder stored = new StringBuilder();
		for (int index = 0; index < Grid.CELLS; index++) {
			if (index > 0) {
				stored.append(',');
			}
			if (byCell[index] != null) {
				stored.append(byCell[index]);
			}
		}
		return stored.toString();
	}

	/** The cells with notes, in order. */
	static List<NoteCell> decode(String stored) {
		String[] byCell = stored.split(",", -1);
		List<NoteCell> cells = new ArrayList<>();
		for (int index = 0; index < byCell.length; index++) {
			if (byCell[index].isEmpty()) {
				continue;
			}
			List<Integer> digits = byCell[index].chars().mapToObj((digit) -> digit - '0').toList();
			cells.add(new NoteCell(index, digits));
		}
		return cells;
	}

	private static ApiException invalid(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, message);
	}

}
