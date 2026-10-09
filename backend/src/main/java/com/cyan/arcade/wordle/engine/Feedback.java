package com.cyan.arcade.wordle.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * The answer to one guess: a {@link LetterResult} for each of its letters, packed into one number
 * (a base-3 digit per letter, the first letter lowest) so the solver can compare and count answers
 * cheaply. {@link WordleEngine#evaluate} is the only way to get one from a guess.
 *
 * @param code the packed results, from 0 (every letter absent) to {@link #SOLVED_CODE}
 */
public record Feedback(int code) {

	/** Every letter correct. */
	public static final int SOLVED_CODE = 242;

	/** How many different answers a guess can get. */
	public static final int CODES = SOLVED_CODE + 1;

	public Feedback {
		if (code < 0 || code > SOLVED_CODE) {
			throw new IllegalArgumentException("Not a feedback code: " + code);
		}
	}

	/** Packs results, one per letter. */
	public static Feedback of(List<LetterResult> results) {
		if (results.size() != WordleRules.WORD_LENGTH) {
			throw new IllegalArgumentException("A feedback has one result per letter");
		}
		int code = 0;
		for (int position = WordleRules.WORD_LENGTH - 1; position >= 0; position--) {
			code = code * 3 + results.get(position).ordinal();
		}
		return new Feedback(code);
	}

	/** The result for each letter, in order. */
	public List<LetterResult> results() {
		List<LetterResult> results = new ArrayList<>(WordleRules.WORD_LENGTH);
		int rest = this.code;
		for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
			results.add(LetterResult.values()[rest % 3]);
			rest /= 3;
		}
		return List.copyOf(results);
	}

	public LetterResult at(int position) {
		return results().get(position);
	}

	/** Whether the guess was the word. */
	public boolean solved() {
		return this.code == SOLVED_CODE;
	}

}
