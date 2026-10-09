package com.cyan.arcade.wordle.engine;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.SplittableRandom;

/**
 * Taking a hint. A run has {@value WordleRules#MAX_HINTS}, one of each {@link HintType}, and each
 * one lowers the score (see {@link Scoring}). No hint can give the word away: a letter is revealed
 * only while at least two positions are still unknown, a check answers for one letter, and only
 * letters the word does not have are ever removed.
 *
 * <p>What a hint picks at random comes from a seed the caller derives from the run, so the same run
 * always gets the same hint, and a run can be checked again later.
 */
public final class Hints {

	/** How many letters {@link HintType#ELIMINATE_LETTERS} removes, when there are that many left. */
	public static final int LETTERS_REMOVED = 3;

	/** Why a hint cannot be taken. Nothing is used up. */
	public enum Unavailable {

		GAME_OVER, NO_HINTS_LEFT, ALREADY_USED,

		/** Revealing a letter now would leave one unknown position or none: the word itself. */
		WOULD_REVEAL_WORD,

		/** The player already knows whether that letter is in the word. */
		LETTER_KNOWN,

		/** Every letter not in the word is already off the keyboard. */
		NOTHING_TO_REMOVE

	}

	public static final class HintUnavailableException extends RuntimeException {

		private final Unavailable reason;

		HintUnavailableException(Unavailable reason) {
			super("Hint unavailable: " + reason);
			this.reason = reason;
		}

		public Unavailable reason() {
			return this.reason;
		}

	}

	private Hints() {
	}

	/**
	 * @param letter for {@link HintType#CHECK_LETTER}, the letter to check; ignored otherwise
	 * @param seed where the random picks come from
	 * @return the game with the hint taken; the hint is its last
	 * @throws HintUnavailableException when the hint cannot be taken now
	 * @throws IllegalArgumentException when a check is asked for something that is not a letter
	 */
	public static WordleGame take(WordleGame game, HintType type, Character letter, long seed) {
		if (game.status().isOver()) {
			throw new HintUnavailableException(Unavailable.GAME_OVER);
		}
		if (game.hints().size() >= WordleRules.MAX_HINTS) {
			throw new HintUnavailableException(Unavailable.NO_HINTS_LEFT);
		}
		if (game.hints().stream().anyMatch((taken) -> taken.type() == type)) {
			throw new HintUnavailableException(Unavailable.ALREADY_USED);
		}
		SplittableRandom random = new SplittableRandom(seed);
		Hint hint = switch (type) {
			case REVEAL_LETTER -> reveal(game, random);
			case CHECK_LETTER -> check(game, letter);
			case ELIMINATE_LETTERS -> eliminate(game, random);
		};
		return game.withHint(hint);
	}

	/** Which hint types this game could still take, in order (a check needs a letter on top). */
	public static List<HintType> available(WordleGame game) {
		if (game.status().isOver() || game.hints().size() >= WordleRules.MAX_HINTS) {
			return List.of();
		}
		List<HintType> available = new ArrayList<>();
		for (HintType type : HintType.values()) {
			boolean used = game.hints().stream().anyMatch((taken) -> taken.type() == type);
			boolean possible = switch (type) {
				case REVEAL_LETTER -> unknownPositions(game).size() >= 2;
				case CHECK_LETTER -> knownLetters(game).size() < 26;
				case ELIMINATE_LETTERS -> !removable(game).isEmpty();
			};
			if (!used && possible) {
				available.add(type);
			}
		}
		return available;
	}

	/** Whether the hint said the letter is in the word: for a check. */
	public static boolean isPresent(WordleGame game, Hint hint) {
		return game.target().indexOf(hint.letters().charAt(0)) >= 0;
	}

	/** The letter a reveal showed. */
	public static char revealedLetter(WordleGame game, Hint hint) {
		return game.target().charAt(hint.position());
	}

	private static Hint reveal(WordleGame game, SplittableRandom random) {
		List<Integer> unknown = unknownPositions(game);
		if (unknown.size() < 2) {
			throw new HintUnavailableException(Unavailable.WOULD_REVEAL_WORD);
		}
		return Hint.reveal(unknown.get(random.nextInt(unknown.size())));
	}

	private static Hint check(WordleGame game, Character letter) {
		char wanted = (letter != null) ? Character.toUpperCase(letter) : ' ';
		if (wanted < 'A' || wanted > 'Z') {
			throw new IllegalArgumentException("A letter check needs a letter from A to Z");
		}
		if (knownLetters(game).contains(wanted)) {
			throw new HintUnavailableException(Unavailable.LETTER_KNOWN);
		}
		return Hint.check(wanted);
	}

	private static Hint eliminate(WordleGame game, SplittableRandom random) {
		List<Character> pool = removable(game);
		if (pool.isEmpty()) {
			throw new HintUnavailableException(Unavailable.NOTHING_TO_REMOVE);
		}
		List<Character> picked = new ArrayList<>();
		while (picked.size() < LETTERS_REMOVED && !pool.isEmpty()) {
			picked.add(pool.remove(random.nextInt(pool.size())));
		}
		return Hint.eliminate(picked);
	}

	/** Positions no guess has right and no hint has shown, in order. */
	static List<Integer> unknownPositions(WordleGame game) {
		Set<Integer> known = new HashSet<>();
		for (Feedback feedback : game.feedback()) {
			for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
				if (feedback.at(position) == LetterResult.CORRECT) {
					known.add(position);
				}
			}
		}
		game.hints().stream().filter((hint) -> hint.type() == HintType.REVEAL_LETTER).forEach((hint) -> known.add(hint.position()));
		List<Integer> unknown = new ArrayList<>();
		for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
			if (!known.contains(position)) {
				unknown.add(position);
			}
		}
		return unknown;
	}

	/**
	 * Letters whose presence the player already knows: every letter guessed (the feedback says), and
	 * every letter a hint named.
	 */
	static Set<Character> knownLetters(WordleGame game) {
		Set<Character> known = new HashSet<>();
		for (String guess : game.guesses()) {
			for (char letter : guess.toCharArray()) {
				known.add(letter);
			}
		}
		for (Hint hint : game.hints()) {
			if (hint.type() == HintType.REVEAL_LETTER) {
				known.add(revealedLetter(game, hint));
			}
			for (char letter : hint.letters().toCharArray()) {
				known.add(letter);
			}
		}
		return known;
	}

	/** Letters the word does not have and the player has not ruled out yet, alphabetically. */
	private static List<Character> removable(WordleGame game) {
		Set<Character> known = knownLetters(game);
		List<Character> removable = new ArrayList<>();
		for (char letter = 'A'; letter <= 'Z'; letter++) {
			if (game.target().indexOf(letter) < 0 && !known.contains(letter)) {
				removable.add(letter);
			}
		}
		return removable;
	}

}
