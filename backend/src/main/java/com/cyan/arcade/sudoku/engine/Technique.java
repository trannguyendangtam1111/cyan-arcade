package com.cyan.arcade.sudoku.engine;

/**
 * The solving techniques the engine knows, simplest first. The logic solver always uses the
 * simplest one that makes progress, so the hardest one a puzzle needs is a fair measure of it.
 */
public enum Technique {

	/** The last empty cell of a row, column or box. */
	FULL_HOUSE("Full house", Difficulty.EASY),

	/** A digit that fits in only one cell of a row, column or box. */
	HIDDEN_SINGLE("Hidden single", Difficulty.EASY),

	/** A cell that can only hold one digit. */
	NAKED_SINGLE("Naked single", Difficulty.MEDIUM),

	/** Pointing and claiming: a digit confined to where a box and a line overlap. */
	LOCKED_CANDIDATES("Locked candidates", Difficulty.HARD),

	NAKED_PAIR("Naked pair", Difficulty.HARD),

	HIDDEN_PAIR("Hidden pair", Difficulty.HARD),

	NAKED_TRIPLE("Naked triple", Difficulty.HARD),

	HIDDEN_TRIPLE("Hidden triple", Difficulty.EXPERT),

	X_WING("X-Wing", Difficulty.EXPERT),

	Y_WING("Y-Wing", Difficulty.EXPERT),

	SWORDFISH("Swordfish", Difficulty.EXPERT);

	private final String label;

	private final Difficulty tier;

	Technique(String label, Difficulty tier) {
		this.label = label;
		this.tier = tier;
	}

	public String label() {
		return this.label;
	}

	/** The difficulty a puzzle has when this is the hardest technique it needs. */
	public Difficulty tier() {
		return this.tier;
	}

}
