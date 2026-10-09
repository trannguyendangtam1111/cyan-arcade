package com.cyan.arcade.wordle.engine;

import java.util.Locale;

/** The fixed rules of Word Guess, the same for players, for the AI and for the score checks. */
public final class WordleRules {

	public static final int WORD_LENGTH = 5;

	public static final int MAX_GUESSES = 6;

	/** Hints a run may use: at most one of each {@link HintType}. */
	public static final int MAX_HINTS = 3;

	private WordleRules() {
	}

	/** A word as the game compares it: trimmed and in capitals. */
	public static String normalize(String word) {
		return (word != null) ? word.strip().toUpperCase(Locale.ROOT) : "";
	}

	/** Whether this is five letters A to Z, in capitals (whether it is a word is the dictionary's call). */
	public static boolean isWellFormed(String word) {
		if (word == null || word.length() != WORD_LENGTH) {
			return false;
		}
		for (int position = 0; position < WORD_LENGTH; position++) {
			char letter = word.charAt(position);
			if (letter < 'A' || letter > 'Z') {
				return false;
			}
		}
		return true;
	}

}
