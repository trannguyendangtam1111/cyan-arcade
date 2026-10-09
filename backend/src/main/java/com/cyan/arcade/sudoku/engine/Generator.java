package com.cyan.arcade.sudoku.engine;

import java.util.Optional;

import com.cyan.arcade.sudoku.engine.LogicSolver.Grade;

/**
 * Makes puzzles from a seed: the same difficulty and seed always give the same puzzle.
 *
 * <p>Each attempt fills a random valid board, then empties cells in random order, two at a time
 * (a cell and its mirror through the centre, so puzzles look the way people expect). A removal is
 * kept only when the puzzle still has exactly one solution, proved by {@link Solver#countSolutions},
 * and logic alone can still solve it with techniques no harder than the target's; removing stops at
 * the target's {@link Difficulty#minGivens()}. The attempt is kept when its hardest technique is of the
 * target's tier exactly, otherwise the next attempt starts from where the random sequence is.
 *
 * <p>Attempts are bounded by {@link #MAX_ATTEMPTS}: when none hits the target, generation fails with
 * {@link GenerationException} rather than looping or handing out a puzzle of the wrong difficulty.
 */
public final class Generator {

	/**
	 * Changes whenever a change here would turn a seed into a different puzzle. Daily puzzles are
	 * stored once made, so a new version never changes a day that has already been played.
	 */
	public static final int VERSION = 1;

	public static final int MAX_ATTEMPTS = 500;

	private Generator() {
	}

	/** Generation used up its attempts without making a puzzle of the asked difficulty. */
	public static final class GenerationException extends RuntimeException {

		GenerationException(Difficulty difficulty, long seed) {
			super("No %s puzzle within %d attempts for seed %d".formatted(difficulty, MAX_ATTEMPTS, seed));
		}

	}

	public static Puzzle generate(Difficulty target, long seed) {
		Rng rng = new Rng(seed);
		for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			int[] solution = Solver.randomSolution(rng);
			int[] puzzle = dig(solution, target, rng);
			Grade grade = LogicSolver.grade(puzzle);
			if (grade.difficulty().equals(Optional.of(target)) && Solver.hasUniqueSolution(puzzle)) {
				return new Puzzle(Grid.format(puzzle), Grid.format(solution), target, seed, grade.hardest());
			}
		}
		throw new GenerationException(target, seed);
	}

	private static int[] dig(int[] solution, Difficulty target, Rng rng) {
		int[] puzzle = solution.clone();
		// Cells 0-40: each stands for itself and its mirror (80 - cell); 40 is the centre.
		int[] order = new int[41];
		for (int cell = 0; cell < order.length; cell++) {
			order[cell] = cell;
		}
		rng.shuffle(order);
		int givens = Grid.CELLS;
		for (int cell : order) {
			int mirror = Grid.CELLS - 1 - cell;
			int removing = (cell == mirror) ? 1 : 2;
			if (givens - removing < target.minGivens()) {
				continue;
			}
			puzzle[cell] = 0;
			puzzle[mirror] = 0;
			if (Solver.hasUniqueSolution(puzzle) && withinTier(LogicSolver.grade(puzzle), target)) {
				givens -= removing;
			}
			else {
				puzzle[cell] = solution[cell];
				puzzle[mirror] = solution[mirror];
			}
		}
		return puzzle;
	}

	private static boolean withinTier(Grade grade, Difficulty target) {
		return grade.difficulty().map((difficulty) -> difficulty.compareTo(target) <= 0).orElse(false);
	}

}
