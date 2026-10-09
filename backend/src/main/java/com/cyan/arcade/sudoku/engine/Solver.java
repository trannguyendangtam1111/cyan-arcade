package com.cyan.arcade.sudoku.engine;

import java.util.Optional;

/**
 * Exhaustive search: depth-first, always on the empty cell with the fewest candidates, with the
 * digits each row, column and box already holds kept as bit masks. It answers questions logic
 * cannot settle on its own: how many solutions a board has (to prove a puzzle unique) and what a
 * solution is. Every search is bounded by the size of the board; nothing here loops forever.
 */
public final class Solver {

	private Solver() {
	}

	/**
	 * Counts solutions, stopping at {@code limit}. Ask with a limit of 2 to learn whether a puzzle
	 * has exactly one.
	 * @return 0 for a board that breaks the rules or cannot be completed
	 */
	public static int countSolutions(int[] puzzle, int limit) {
		Search search = Search.of(puzzle);
		if (search == null) {
			return 0;
		}
		search.limit = limit;
		search.run(null);
		return search.found;
	}

	public static boolean hasUniqueSolution(int[] puzzle) {
		return countSolutions(puzzle, 2) == 1;
	}

	/** The first solution found, if there is one. */
	public static Optional<int[]> solve(int[] puzzle) {
		Search search = Search.of(puzzle);
		if (search == null) {
			return Optional.empty();
		}
		search.limit = 1;
		search.run(null);
		return Optional.ofNullable(search.solution);
	}

	/** A completely filled, valid board, different for every seed and the same for the same one. */
	public static int[] randomSolution(Rng rng) {
		Search search = Search.of(new int[Grid.CELLS]);
		search.limit = 1;
		search.run(rng);
		return search.solution;
	}

	private static final class Search {

		private final int[] values;

		private final int[] rows = new int[9];

		private final int[] cols = new int[9];

		private final int[] boxes = new int[9];

		private int limit;

		private int found;

		private int[] solution;

		private Search(int[] values) {
			this.values = values;
		}

		/** A search over a copy of the board, or {@code null} when its clues already break the rules. */
		static Search of(int[] puzzle) {
			if (puzzle.length != Grid.CELLS) {
				throw new IllegalArgumentException("A board has 81 cells");
			}
			Search search = new Search(puzzle.clone());
			for (int cell = 0; cell < Grid.CELLS; cell++) {
				int digit = search.values[cell];
				if (digit == 0) {
					continue;
				}
				if (digit < 0 || digit > 9 || !search.canPlace(cell, digit)) {
					return null;
				}
				search.set(cell, digit);
			}
			return search;
		}

		void run(Rng rng) {
			if (this.found >= this.limit) {
				return;
			}
			int best = -1;
			int bestMask = 0;
			int bestCount = 10;
			for (int cell = 0; cell < Grid.CELLS; cell++) {
				if (this.values[cell] != 0) {
					continue;
				}
				int mask = free(cell);
				int count = Integer.bitCount(mask);
				if (count < bestCount) {
					best = cell;
					bestMask = mask;
					bestCount = count;
					if (count <= 1) {
						break;
					}
				}
			}
			if (best < 0) {
				this.found++;
				if (this.solution == null) {
					this.solution = this.values.clone();
				}
				return;
			}
			if (bestCount == 0) {
				return;
			}
			int[] digits = Grid.digits(bestMask);
			if (rng != null) {
				rng.shuffle(digits);
			}
			for (int digit : digits) {
				set(best, digit);
				run(rng);
				unset(best, digit);
				if (this.found >= this.limit) {
					return;
				}
			}
		}

		private int free(int cell) {
			int r = Grid.row(cell);
			int c = Grid.col(cell);
			return Grid.ALL & ~(this.rows[r] | this.cols[c] | this.boxes[(r / 3) * 3 + c / 3]);
		}

		private boolean canPlace(int cell, int digit) {
			return (free(cell) & Grid.bit(digit)) != 0;
		}

		private void set(int cell, int digit) {
			int bit = Grid.bit(digit);
			this.values[cell] = digit;
			this.rows[Grid.row(cell)] |= bit;
			this.cols[Grid.col(cell)] |= bit;
			this.boxes[Grid.box(cell)] |= bit;
		}

		private void unset(int cell, int digit) {
			int bit = ~Grid.bit(digit);
			this.values[cell] = 0;
			this.rows[Grid.row(cell)] &= bit;
			this.cols[Grid.col(cell)] &= bit;
			this.boxes[Grid.box(cell)] &= bit;
		}

	}

}
