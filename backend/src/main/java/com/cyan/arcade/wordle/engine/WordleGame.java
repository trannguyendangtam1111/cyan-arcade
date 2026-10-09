package com.cyan.arcade.wordle.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * One game of Word Guess, as a value: the hidden word, the guesses so far and the hints taken.
 * Every move returns a new game, so a run can be rebuilt from what was stored and checked again,
 * and the AI plays through exactly the same moves as a player.
 */
public final class WordleGame {

	/** Where a game stands. */
	public enum Status {

		PLAYING, SOLVED, FAILED;

		public boolean isOver() {
			return this != PLAYING;
		}

	}

	/** Why a guess was refused. A refused guess changes nothing and costs nothing. */
	public enum Rejection {

		/** Not five letters A to Z. */
		MALFORMED,

		/** Five letters, but not a word the game knows. */
		NOT_A_WORD,

		/** The game is already solved or out of guesses. */
		GAME_OVER

	}

	/** A guess the rules do not allow. */
	public static final class GuessRejectedException extends RuntimeException {

		private final Rejection reason;

		GuessRejectedException(Rejection reason) {
			super("Guess rejected: " + reason);
			this.reason = reason;
		}

		public Rejection reason() {
			return this.reason;
		}

	}

	private final String target;

	private final List<String> guesses;

	private final List<Hint> hints;

	private WordleGame(String target, List<String> guesses, List<Hint> hints) {
		this.target = target;
		this.guesses = List.copyOf(guesses);
		this.hints = List.copyOf(hints);
	}

	/** A new game for this hidden word. */
	public static WordleGame start(String target) {
		if (!WordleRules.isWellFormed(target)) {
			throw new IllegalArgumentException("The hidden word must be five capital letters");
		}
		return new WordleGame(target, List.of(), List.of());
	}

	/**
	 * A game as it was stored, replayed move by move through the rules: every guess must be a word
	 * and come while the game was still on.
	 * @throws GuessRejectedException when the stored guesses could not have been played
	 */
	public static WordleGame replay(String target, List<String> guesses, List<Hint> hints, Vocabulary vocabulary) {
		WordleGame game = start(target);
		for (String guess : guesses) {
			game = game.guess(guess, vocabulary);
		}
		return new WordleGame(target, game.guesses, hints);
	}

	/**
	 * Plays a guess.
	 * @param word the guess, in any case
	 * @throws GuessRejectedException when the rules refuse it; the game is unchanged
	 */
	public WordleGame guess(String word, Vocabulary vocabulary) {
		if (status().isOver()) {
			throw new GuessRejectedException(Rejection.GAME_OVER);
		}
		String guess = WordleRules.normalize(word);
		if (!WordleRules.isWellFormed(guess)) {
			throw new GuessRejectedException(Rejection.MALFORMED);
		}
		if (!vocabulary.isAllowed(guess)) {
			throw new GuessRejectedException(Rejection.NOT_A_WORD);
		}
		List<String> next = new ArrayList<>(this.guesses);
		next.add(guess);
		return new WordleGame(this.target, next, this.hints);
	}

	/** The game with one more hint taken. {@link Hints} decides what it is. */
	WordleGame withHint(Hint hint) {
		List<Hint> next = new ArrayList<>(this.hints);
		next.add(hint);
		return new WordleGame(this.target, this.guesses, next);
	}

	public Status status() {
		if (!this.guesses.isEmpty() && this.guesses.getLast().equals(this.target)) {
			return Status.SOLVED;
		}
		return (this.guesses.size() >= WordleRules.MAX_GUESSES) ? Status.FAILED : Status.PLAYING;
	}

	/** The answer to each guess, in order. */
	public List<Feedback> feedback() {
		return this.guesses.stream().map((guess) -> WordleEngine.evaluate(this.target, guess)).toList();
	}

	/** The answer to the latest guess. */
	public Feedback lastFeedback() {
		if (this.guesses.isEmpty()) {
			throw new IllegalStateException("No guess yet");
		}
		return WordleEngine.evaluate(this.target, this.guesses.getLast());
	}

	public List<String> guesses() {
		return this.guesses;
	}

	public List<Hint> hints() {
		return this.hints;
	}

	/**
	 * The hidden word. For the server's own use (checking hints, showing the word once the game is
	 * over); the AI never asks for it: it plays only through {@link #guess}.
	 */
	public String target() {
		return this.target;
	}

	@Override
	public boolean equals(Object other) {
		return other instanceof WordleGame game && this.target.equals(game.target)
				&& this.guesses.equals(game.guesses) && this.hints.equals(game.hints);
	}

	@Override
	public int hashCode() {
		return Objects.hash(this.target, this.guesses, this.hints);
	}

}
