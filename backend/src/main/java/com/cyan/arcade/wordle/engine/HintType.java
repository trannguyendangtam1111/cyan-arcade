package com.cyan.arcade.wordle.engine;

/** The three kinds of hint. A run may use each once. */
public enum HintType {

	/** Shows the letter in one position the player does not know yet, picked at random. */
	REVEAL_LETTER,

	/** Says whether a letter of the player's choosing is in the word. */
	CHECK_LETTER,

	/** Greys out a few letters the word does not have, picked at random. */
	ELIMINATE_LETTERS

}
