package com.cyan.arcade.sudoku.engine;

/**
 * A puzzle and its one solution, as 81-character boards ({@code 0} for an empty cell).
 *
 * @param seed what the generator was given to make it
 * @param hardest the hardest technique logic needs to solve it
 */
public record Puzzle(String givens, String solution, Difficulty difficulty, long seed, Technique hardest) {

	public int[] givenValues() {
		return Grid.parse(this.givens);
	}

	public int[] solutionValues() {
		return Grid.parse(this.solution);
	}

	public int clueCount() {
		return Grid.filled(givenValues());
	}

}
