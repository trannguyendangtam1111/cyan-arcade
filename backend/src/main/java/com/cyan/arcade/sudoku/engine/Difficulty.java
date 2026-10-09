package com.cyan.arcade.sudoku.engine;

/**
 * How hard a puzzle is, decided by the hardest technique it needs (see {@link Technique#tier()}), not
 * by how many cells are empty: an Easy puzzle falls to full houses and hidden singles, a Medium one
 * needs naked singles (reading a cell's candidates), a Hard one needs locked candidates, pairs or
 * triples, and an Expert one needs a fish, a Y-Wing or a hidden triple. Clues are a second, softer
 * dial: the generator stops removing them at {@link #minGivens()}.
 *
 * @param level 1 (Easy) to 4 (Expert), as the run reports it
 * @param minGivens the fewest clues the generator leaves
 * @param baseScore what a solve is worth before time, mistakes and hints
 * @param parSeconds a good solving time: at par the time bonus is 100%
 */
public enum Difficulty {

	EASY(1, 36, 1000, 360),

	MEDIUM(2, 28, 2000, 600),

	HARD(3, 24, 3500, 900),

	EXPERT(4, 22, 5000, 1500);

	private final int level;

	private final int minGivens;

	private final int baseScore;

	private final int parSeconds;

	Difficulty(int level, int minGivens, int baseScore, int parSeconds) {
		this.level = level;
		this.minGivens = minGivens;
		this.baseScore = baseScore;
		this.parSeconds = parSeconds;
	}

	public int level() {
		return this.level;
	}

	public int minGivens() {
		return this.minGivens;
	}

	public int baseScore() {
		return this.baseScore;
	}

	public int parSeconds() {
		return this.parSeconds;
	}

	public String label() {
		return name().charAt(0) + name().substring(1).toLowerCase();
	}

	public static Difficulty ofLevel(int level) {
		for (Difficulty difficulty : values()) {
			if (difficulty.level == level) {
				return difficulty;
			}
		}
		throw new IllegalArgumentException("No difficulty " + level);
	}

}
