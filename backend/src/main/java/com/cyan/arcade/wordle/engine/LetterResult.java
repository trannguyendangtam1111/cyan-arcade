package com.cyan.arcade.wordle.engine;

/**
 * What one letter of a guess says about the hidden word. The order matters: it is the digit each
 * letter contributes to a {@link Feedback} code, and later results outrank earlier ones on the
 * keyboard.
 */
public enum LetterResult {

	/** Not in the word, or not as many times as the guess has it. */
	ABSENT,

	/** In the word, somewhere else. */
	PRESENT,

	/** In the word, right here. */
	CORRECT

}
