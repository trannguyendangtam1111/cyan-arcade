package com.cyan.arcade.wordle.dictionary;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import com.cyan.arcade.wordle.engine.Vocabulary;
import com.cyan.arcade.wordle.engine.WordleRules;

/**
 * The words of Word Guess, in two lists: the <b>answers</b>, which a puzzle can be, in their
 * schedule order, and the extra <b>guesses</b>, which a player may also try but which are never the
 * answer. Both live in the server's resources ({@code wordle/answers.txt}, {@code wordle/guesses.txt})
 * and never reach the browser.
 */
public final class Dictionary implements Vocabulary {

	private final List<String> answers;

	private final Set<String> answerSet;

	private final Set<String> allowed;

	private final List<String> allowedInOrder;

	private Dictionary(List<String> answers, Set<String> allowed) {
		this.answers = List.copyOf(answers);
		this.answerSet = Set.copyOf(answers);
		this.allowed = Set.copyOf(allowed);
		this.allowedInOrder = List.copyOf(new TreeSet<>(allowed));
	}

	/**
	 * @param answers the possible answers, in schedule order; each must be five capitals, once
	 * @param guesses further allowed guesses; answers among them are fine
	 */
	public static Dictionary of(List<String> answers, List<String> guesses) {
		if (answers.isEmpty()) {
			throw new IllegalArgumentException("Word Guess needs at least one answer");
		}
		Set<String> seen = new HashSet<>();
		for (String word : answers) {
			check(word);
			if (!seen.add(word)) {
				throw new IllegalArgumentException("Answer listed twice: " + word);
			}
		}
		Set<String> allowed = new LinkedHashSet<>(answers);
		for (String word : guesses) {
			check(word);
			allowed.add(word);
		}
		return new Dictionary(answers, allowed);
	}

	/** Reads both lists: one word per line; blank lines and lines starting with {@code #} are skipped. */
	public static Dictionary read(InputStream answers, InputStream guesses) {
		return of(lines(answers), lines(guesses));
	}

	@Override
	public boolean isAllowed(String word) {
		return this.allowed.contains(word);
	}

	public boolean isAnswer(String word) {
		return this.answerSet.contains(word);
	}

	/** The possible answers, in schedule order. */
	public List<String> answers() {
		return this.answers;
	}

	/** Every word a guess may be, answers included, alphabetically. */
	public List<String> allowedWords() {
		return this.allowedInOrder;
	}

	private static void check(String word) {
		if (!WordleRules.isWellFormed(word)) {
			throw new IllegalArgumentException("Not five capital letters: '" + word + "'");
		}
	}

	private static List<String> lines(InputStream input) {
		List<String> words = new ArrayList<>();
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
			String line;
			while ((line = reader.readLine()) != null) {
				String word = line.strip();
				if (!word.isEmpty() && !word.startsWith("#")) {
					words.add(word);
				}
			}
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
		return words;
	}

}
