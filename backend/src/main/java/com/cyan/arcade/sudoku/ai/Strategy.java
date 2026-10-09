package com.cyan.arcade.sudoku.ai;

/** How the AI solves. Each is its own algorithm, not one algorithm at different speeds. */
public enum Strategy {

	/**
	 * Logic, one placed digit at a time: the simplest technique that places the next digit, with a
	 * one-line reason. Eliminations it needs on the way are folded into that reason.
	 */
	STEP_BY_STEP,

	/**
	 * Search: constraint propagation (naked and hidden singles), then the cell with the fewest
	 * candidates is tried digit by digit, backing out of dead ends. Fast, but it does not explain.
	 */
	FAST,

	/**
	 * Logic, every deduction shown: eliminations too, each with the row, column and box constraints
	 * spelled out and the candidates left.
	 */
	TEACHING

}
