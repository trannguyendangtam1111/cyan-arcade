package com.cyan.arcade.wordle.ai;

/**
 * How the AI picks its next guess. All four see the same thing (the words that are still possible)
 * and play through the same game; they weigh the choice differently.
 */
public enum Strategy {

	/**
	 * Information plus a chance to win: the expected information of a guess (entropy of the feedback
	 * it can get, in bits), with half a bit more for a guess that could itself be the answer. Any
	 * allowed word may be guessed.
	 */
	BALANCED,

	/**
	 * Pure elimination: the guess that leaves the fewest words on average (the sum of the squared
	 * group sizes it splits the words into), from every allowed word, whether or not it can win.
	 */
	INFORMATION_HUNTER,

	/**
	 * Only words that could be the answer, picking the one with the most expected information:
	 * every guess might win, at the cost of slower narrowing.
	 */
	CONSERVATIVE,

	/**
	 * A quick rule of thumb instead of a search: among the words still possible, the one whose letters
	 * are the most common in them, overall and in each position. One pass over the words per guess.
	 */
	SPEED_SOLVER

}
