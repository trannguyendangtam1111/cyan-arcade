package com.cyan.arcade.sudoku.engine;

import java.util.List;

/**
 * One logical deduction: either a placement (a cell must hold a digit) or eliminations (digits a
 * cell cannot hold), with what the deduction is made from, so it can be shown and explained.
 *
 * @param cell for a placement, the cell; otherwise -1
 * @param digit for a placement, the digit; otherwise 0
 * @param eliminations for an elimination step, the candidates removed; empty for a placement
 * @param houses the houses the reasoning is about: for locked candidates the house the digit is
 * confined in first, then the house it is removed from; for a fish its base lines, then its cover
 * lines; otherwise the house of the pattern
 * @param pattern the cells the reasoning rests on (a pair, the corners of an X-Wing, a Y-Wing's
 * pivot then its pincers)
 * @param digits the digits of the pattern, as a mask
 */
public record Step(Technique technique, int cell, int digit, List<Elimination> eliminations, List<Integer> houses,
		List<Integer> pattern, int digits) {

	public Step {
		eliminations = List.copyOf(eliminations);
		houses = List.copyOf(houses);
		pattern = List.copyOf(pattern);
	}

	/** A candidate a cell cannot hold. */
	public record Elimination(int cell, int digit) {
	}

	static Step placement(Technique technique, int cell, int digit, List<Integer> houses) {
		return new Step(technique, cell, digit, List.of(), houses, List.of(cell), Grid.bit(digit));
	}

	public boolean isPlacement() {
		return this.cell >= 0;
	}

}
