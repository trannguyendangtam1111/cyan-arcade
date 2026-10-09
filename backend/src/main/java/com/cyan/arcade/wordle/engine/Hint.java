package com.cyan.arcade.wordle.engine;

import java.util.Arrays;
import java.util.List;

/**
 * A hint a run has taken, and what it told the player. Only what was asked and what was picked is
 * kept; what it says about the word follows from the word.
 *
 * @param position for {@link HintType#REVEAL_LETTER}, the position revealed (0 to 4); otherwise -1
 * @param letters for {@link HintType#CHECK_LETTER}, the letter checked; for
 * {@link HintType#ELIMINATE_LETTERS}, the letters taken off the keyboard, in alphabetical order;
 * empty for a reveal
 */
public record Hint(HintType type, int position, String letters) {

	public Hint {
		letters = (letters != null) ? letters : "";
	}

	static Hint reveal(int position) {
		return new Hint(HintType.REVEAL_LETTER, position, "");
	}

	static Hint check(char letter) {
		return new Hint(HintType.CHECK_LETTER, -1, String.valueOf(letter));
	}

	static Hint eliminate(List<Character> letters) {
		char[] sorted = new char[letters.size()];
		for (int index = 0; index < sorted.length; index++) {
			sorted[index] = letters.get(index);
		}
		Arrays.sort(sorted);
		return new Hint(HintType.ELIMINATE_LETTERS, -1, new String(sorted));
	}

	/**
	 * The hint as stored with its run: {@code REVEAL_LETTER:2}, {@code CHECK_LETTER:E},
	 * {@code ELIMINATE_LETTERS:QXZ}.
	 */
	public String encode() {
		return this.type + ":" + ((this.type == HintType.REVEAL_LETTER) ? String.valueOf(this.position) : this.letters);
	}

	public static Hint decode(String text) {
		int colon = text.indexOf(':');
		HintType type = HintType.valueOf(text.substring(0, colon));
		String value = text.substring(colon + 1);
		return (type == HintType.REVEAL_LETTER) ? reveal(Integer.parseInt(value)) : new Hint(type, -1, value);
	}

}
