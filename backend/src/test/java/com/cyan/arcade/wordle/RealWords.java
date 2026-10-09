package com.cyan.arcade.wordle;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

import com.cyan.arcade.wordle.dictionary.Dictionary;

/** The game's real word lists, for tests that need them without the application. */
public final class RealWords {

	private static Dictionary words;

	private RealWords() {
	}

	public static synchronized Dictionary dictionary() {
		if (words == null) {
			try (InputStream answers = RealWords.class.getResourceAsStream("/" + WordleConfig.ANSWERS);
					InputStream guesses = RealWords.class.getResourceAsStream("/" + WordleConfig.GUESSES)) {
				words = Dictionary.read(answers, guesses);
			}
			catch (IOException ex) {
				throw new UncheckedIOException(ex);
			}
		}
		return words;
	}

}
