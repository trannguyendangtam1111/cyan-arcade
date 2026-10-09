package com.cyan.arcade.sudoku.engine;

import java.util.Arrays;
import java.util.Set;
import java.util.TreeSet;

/**
 * The 9×9 board and its houses. A board is 81 cells in reading order (row by row, top left first),
 * each holding a digit 1–9 or 0 for an empty cell. Candidate sets are bit masks: bit {@code d} set
 * means digit {@code d} is possible, so {@link #ALL} is every digit.
 *
 * <p>Houses are numbered 0–26: rows 0–8, columns 9–17 and boxes 18–26 (boxes in reading order too).
 */
public final class Grid {

	public static final int SIZE = 9;

	public static final int CELLS = 81;

	/** Every digit 1–9 as a candidate mask. */
	public static final int ALL = 0b11_1111_1110;

	/** The cells of each house, in reading order. */
	static final int[][] HOUSES = new int[27][9];

	/** The three houses (row, column, box) of each cell. */
	static final int[][] HOUSES_OF = new int[CELLS][3];

	/** The 20 other cells that share a house with each cell. */
	static final int[][] PEERS = new int[CELLS][];

	static {
		for (int cell = 0; cell < CELLS; cell++) {
			int row = row(cell);
			int col = col(cell);
			int box = box(cell);
			HOUSES[row][col] = cell;
			HOUSES[9 + col][row] = cell;
			HOUSES[18 + box][(row % 3) * 3 + col % 3] = cell;
			HOUSES_OF[cell] = new int[] { row, 9 + col, 18 + box };
		}
		for (int cell = 0; cell < CELLS; cell++) {
			Set<Integer> peers = new TreeSet<>();
			for (int house : HOUSES_OF[cell]) {
				for (int other : HOUSES[house]) {
					if (other != cell) {
						peers.add(other);
					}
				}
			}
			PEERS[cell] = peers.stream().mapToInt(Integer::intValue).toArray();
		}
	}

	private Grid() {
	}

	public static int row(int cell) {
		return cell / SIZE;
	}

	public static int col(int cell) {
		return cell % SIZE;
	}

	public static int box(int cell) {
		return (row(cell) / 3) * 3 + col(cell) / 3;
	}

	/** The cells of a house (0–26), in reading order. */
	public static int[] house(int house) {
		return HOUSES[house].clone();
	}

	/** The cells sharing a row, column or box with this one. */
	public static int[] peers(int cell) {
		return PEERS[cell].clone();
	}

	public static boolean sees(int a, int b) {
		return a != b && (row(a) == row(b) || col(a) == col(b) || box(a) == box(b));
	}

	public static int bit(int digit) {
		return 1 << digit;
	}

	public static int count(int mask) {
		return Integer.bitCount(mask);
	}

	/** The smallest digit in a mask, or 0 for an empty mask. */
	public static int lowestDigit(int mask) {
		return (mask == 0) ? 0 : Integer.numberOfTrailingZeros(mask);
	}

	/** The digits of a mask, smallest first. */
	public static int[] digits(int mask) {
		int[] digits = new int[count(mask)];
		int index = 0;
		for (int digit = 1; digit <= 9; digit++) {
			if ((mask & bit(digit)) != 0) {
				digits[index++] = digit;
			}
		}
		return digits;
	}

	/**
	 * Reads a board written as 81 characters, digits for clues and {@code 0} or {@code .} for empty
	 * cells. Whitespace is ignored.
	 * @throws IllegalArgumentException when it is not 81 cells of digits
	 */
	public static int[] parse(String text) {
		String compact = text.replaceAll("\\s", "");
		if (compact.length() != CELLS) {
			throw new IllegalArgumentException("A board has 81 cells");
		}
		int[] values = new int[CELLS];
		for (int cell = 0; cell < CELLS; cell++) {
			char ch = compact.charAt(cell);
			if (ch == '.' || ch == '0') {
				values[cell] = 0;
			}
			else if (ch >= '1' && ch <= '9') {
				values[cell] = ch - '0';
			}
			else {
				throw new IllegalArgumentException("A cell is a digit 1-9, or 0 when empty");
			}
		}
		return values;
	}

	/** The board as 81 characters, {@code 0} for an empty cell. */
	public static String format(int[] values) {
		StringBuilder text = new StringBuilder(CELLS);
		for (int value : values) {
			text.append((char) ('0' + value));
		}
		return text.toString();
	}

	/** Digits that this cell may still take: those not already placed in its row, column or box. */
	public static int candidates(int[] values, int cell) {
		if (values[cell] != 0) {
			return 0;
		}
		int seen = 0;
		for (int peer : PEERS[cell]) {
			seen |= bit(values[peer]);
		}
		return ALL & ~seen;
	}

	/** {@link #candidates} for every cell: 0 for a filled cell. */
	public static int[] candidates(int[] values) {
		int[] masks = new int[CELLS];
		for (int cell = 0; cell < CELLS; cell++) {
			masks[cell] = candidates(values, cell);
		}
		return masks;
	}

	/**
	 * Cells whose digit appears again in one of their houses. Empty cells never conflict.
	 */
	public static Set<Integer> conflicts(int[] values) {
		Set<Integer> conflicting = new TreeSet<>();
		for (int cell = 0; cell < CELLS; cell++) {
			if (values[cell] == 0) {
				continue;
			}
			for (int peer : PEERS[cell]) {
				if (values[peer] == values[cell]) {
					conflicting.add(cell);
					break;
				}
			}
		}
		return conflicting;
	}

	/** Whether placing {@code digit} in {@code cell} repeats a digit already in one of its houses. */
	public static boolean conflictsWith(int[] values, int cell, int digit) {
		for (int peer : PEERS[cell]) {
			if (values[peer] == digit) {
				return true;
			}
		}
		return false;
	}

	/** Whether every cell is filled and every house holds each digit once. */
	public static boolean isSolved(int[] values) {
		if (values.length != CELLS) {
			return false;
		}
		for (int[] house : HOUSES) {
			int seen = 0;
			for (int cell : house) {
				int value = values[cell];
				if (value < 1 || value > 9 || (seen & bit(value)) != 0) {
					return false;
				}
				seen |= bit(value);
			}
		}
		return true;
	}

	/** Whether every digit is 0–9 and no house repeats one: a board that may still be completed. */
	public static boolean isConsistent(int[] values) {
		if (values.length != CELLS || Arrays.stream(values).anyMatch((value) -> value < 0 || value > 9)) {
			return false;
		}
		return conflicts(values).isEmpty();
	}

	public static int filled(int[] values) {
		return (int) Arrays.stream(values).filter((value) -> value != 0).count();
	}

	/** "r3c4": one-based row and column, as players read them. */
	public static String cellName(int cell) {
		return "r" + (row(cell) + 1) + "c" + (col(cell) + 1);
	}

	/** "row 3", "column 4" or "box 5", one-based. */
	public static String houseName(int house) {
		if (house < 9) {
			return "row " + (house + 1);
		}
		if (house < 18) {
			return "column " + (house - 8);
		}
		return "box " + (house - 17);
	}

}
