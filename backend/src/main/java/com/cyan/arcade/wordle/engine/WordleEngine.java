package com.cyan.arcade.wordle.engine;

/**
 * How a guess is judged against the hidden word: the one implementation, used by players' runs, by
 * the AI, by hints and by the score checks.
 *
 * <p>Letters are counted, not just looked up. First every letter in the right place is marked
 * correct and taken out of the word; then, left to right, a letter is present only while the word
 * still has an unmatched copy of it, and absent once they are used up. So with the word APPLE the
 * guess ALLEY gets A correct, the first L present and the second L absent: APPLE has one L.
 */
public final class WordleEngine {

	private WordleEngine() {
	}

	/**
	 * @param target the hidden word, five capitals
	 * @param guess the guess, five capitals
	 */
	public static Feedback evaluate(String target, String guess) {
		return new Feedback(code(target, guess));
	}

	/**
	 * The same as {@link #evaluate}, as a bare {@link Feedback#code()}, for the solver, which judges
	 * hundreds of thousands of pairs per decision.
	 */
	public static int code(String target, String guess) {
		if (!WordleRules.isWellFormed(target) || !WordleRules.isWellFormed(guess)) {
			throw new IllegalArgumentException("Both words must be five capital letters");
		}
		int[] unmatched = new int[26];
		int[] results = new int[WordleRules.WORD_LENGTH];
		for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
			char letter = guess.charAt(position);
			if (letter == target.charAt(position)) {
				results[position] = LetterResult.CORRECT.ordinal();
			}
			else {
				unmatched[target.charAt(position) - 'A']++;
			}
		}
		int code = 0;
		for (int position = WordleRules.WORD_LENGTH - 1; position >= 0; position--) {
			code = code * 3 + results[position];
		}
		// Left to right, so earlier copies of a letter claim what the word has left first.
		int weight = 1;
		for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
			int letter = guess.charAt(position) - 'A';
			if (results[position] != LetterResult.CORRECT.ordinal() && unmatched[letter] > 0) {
				unmatched[letter]--;
				code += weight * LetterResult.PRESENT.ordinal();
			}
			weight *= 3;
		}
		return code;
	}

}
