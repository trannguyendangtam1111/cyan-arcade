package com.cyan.arcade.wordle.ai;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.cyan.arcade.wordle.engine.Feedback;
import com.cyan.arcade.wordle.engine.WordleEngine;
import com.cyan.arcade.wordle.engine.WordleRules;

/**
 * The Word Guess AI: a deterministic candidate-elimination solver. It starts from every word that
 * can be an answer, guesses, and keeps only the words that would have given the same feedback,
 * judged by the game's own {@link WordleEngine}, until it wins or runs out of guesses.
 *
 * <p>It never sees the hidden word. It plays through a {@link Referee}, which for real runs is the
 * game itself: the guess goes through the same rules as a player's (a known word, six guesses at
 * most) and the answer is the same feedback a player gets. Same words, same strategy, same game:
 * same guesses, every time.
 */
public final class WordleSolver {

	/** With this few words left, guessing one of them is always the best move. */
	static final int ENDGAME = 2;

	/** What a guess that could itself be the answer is worth to {@link Strategy#BALANCED}, in bits. */
	static final double ANSWER_BONUS_BITS = 0.5;

	/** How many of the words still possible a step shows. */
	static final int SAMPLE = 6;

	private static final double EPSILON = 1e-9;

	/** Plays a guess and answers with its feedback, or refuses it as the game's rules do. */
	@FunctionalInterface
	public interface Referee {

		Feedback judge(String guess);

	}

	/**
	 * A guess and why it was picked.
	 * @param measure the strategy's own number: bits for Balanced and Conservative, expected words
	 * left for Information Hunter, letter popularity for Speed Solver
	 */
	public record Choice(String word, double measure, boolean couldWin, String reason) {
	}

	/**
	 * One turn of a solve.
	 * @param remaining the first few words still possible after it, alphabetically
	 */
	public record Step(Choice choice, Feedback feedback, int candidatesBefore, int candidatesAfter,
			List<String> remaining) {
	}

	/** A whole solve, in order. */
	public record Solution(Strategy strategy, List<Step> steps, boolean solved) {

		public int guesses() {
			return this.steps.size();
		}

	}

	private final List<String> answers;

	private final List<String> allowed;

	private final Map<Strategy, Choice> openers = new EnumMap<>(Strategy.class);

	/**
	 * @param answers the words a puzzle can be: where the AI starts
	 * @param allowed every word a guess may be, in a fixed order (it breaks ties)
	 */
	public WordleSolver(List<String> answers, List<String> allowed) {
		this.answers = List.copyOf(answers);
		this.allowed = List.copyOf(allowed);
	}

	/** Plays one whole game. */
	public Solution solve(Strategy strategy, Referee referee) {
		List<String> candidates = this.answers;
		List<Step> steps = new ArrayList<>();
		for (int turn = 0; turn < WordleRules.MAX_GUESSES && !candidates.isEmpty(); turn++) {
			Choice choice = (turn == 0) ? opener(strategy) : choose(strategy, candidates);
			Feedback feedback = referee.judge(choice.word());
			List<String> left = consistent(candidates, choice.word(), feedback);
			steps.add(new Step(choice, feedback, candidates.size(), left.size(),
					left.stream().sorted().limit(SAMPLE).toList()));
			if (feedback.solved()) {
				return new Solution(strategy, List.copyOf(steps), true);
			}
			candidates = left;
		}
		return new Solution(strategy, List.copyOf(steps), false);
	}

	/** The first guess, which never depends on the puzzle: worked out once per strategy. */
	public synchronized Choice opener(Strategy strategy) {
		return this.openers.computeIfAbsent(strategy, (key) -> choose(key, this.answers));
	}

	/** The words that would have answered {@code guess} with exactly this feedback. */
	public static List<String> consistent(List<String> candidates, String guess, Feedback feedback) {
		return candidates.stream().filter((word) -> WordleEngine.code(word, guess) == feedback.code()).toList();
	}

	/** The strategy's guess, given the words still possible (in a fixed order). */
	public Choice choose(Strategy strategy, List<String> candidates) {
		if (candidates.isEmpty()) {
			throw new IllegalArgumentException("No word left to guess");
		}
		if (candidates.size() <= ENDGAME) {
			String word = candidates.stream().sorted().findFirst().orElseThrow();
			return new Choice(word, candidates.size(), true,
					(candidates.size() == 1) ? "only one word left" : "one of the last two words");
		}
		return switch (strategy) {
			case BALANCED -> best(this.allowed, candidates, true, (guess, couldWin) -> entropy(guess, candidates)
					+ (couldWin ? ANSWER_BONUS_BITS : 0), "%.2f bits expected");
			case INFORMATION_HUNTER -> best(this.allowed, candidates, true,
					(guess, couldWin) -> -expectedLeft(guess, candidates), "%.1f words expected to remain");
			case CONSERVATIVE -> best(candidates, candidates, false, (guess, couldWin) -> entropy(guess, candidates),
					"%.2f bits expected, could be the answer");
			case SPEED_SOLVER -> speedSolver(candidates);
		};
	}

	@FunctionalInterface
	private interface Value {

		double of(String guess, boolean couldWin);

	}

	/**
	 * The guess with the highest value. Ties go to a guess that could win, then to the earlier word,
	 * so the choice never depends on anything but the words.
	 */
	private static Choice best(List<String> pool, List<String> candidates, boolean preferWinners, Value value,
			String reason) {
		Set<String> possible = new HashSet<>(candidates);
		String bestWord = null;
		double bestValue = Double.NEGATIVE_INFINITY;
		boolean bestCouldWin = false;
		for (String guess : pool) {
			boolean couldWin = possible.contains(guess);
			double current = value.of(guess, couldWin);
			boolean better = current > bestValue + EPSILON
					|| (preferWinners && couldWin && !bestCouldWin && Math.abs(current - bestValue) <= EPSILON);
			if (better) {
				bestWord = guess;
				bestValue = current;
				bestCouldWin = couldWin;
			}
		}
		double shown = (bestValue < 0) ? -bestValue : bestValue;
		return new Choice(bestWord, shown, bestCouldWin, reason.formatted(shown));
	}

	/** How many words fall into each feedback this guess can get. */
	static int[] groups(String guess, List<String> candidates) {
		int[] groups = new int[Feedback.CODES];
		for (String word : candidates) {
			groups[WordleEngine.code(word, guess)]++;
		}
		return groups;
	}

	/** The expected information of a guess: the entropy of its feedback, in bits. */
	static double entropy(String guess, List<String> candidates) {
		double total = candidates.size();
		double bits = 0;
		for (int size : groups(guess, candidates)) {
			if (size > 0) {
				double share = size / total;
				bits -= share * Math.log(share) / Math.log(2);
			}
		}
		return bits;
	}

	/** How many words are expected to be left after the guess. */
	static double expectedLeft(String guess, List<String> candidates) {
		double sum = 0;
		for (int size : groups(guess, candidates)) {
			sum += (double) size * size;
		}
		return sum / candidates.size();
	}

	private static Choice speedSolver(List<String> candidates) {
		int[] withLetter = new int[26];
		int[][] atPosition = new int[WordleRules.WORD_LENGTH][26];
		for (String word : candidates) {
			boolean[] seen = new boolean[26];
			for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
				int letter = word.charAt(position) - 'A';
				atPosition[position][letter]++;
				if (!seen[letter]) {
					seen[letter] = true;
					withLetter[letter]++;
				}
			}
		}
		String bestWord = null;
		int bestValue = -1;
		for (String word : candidates) {
			boolean[] seen = new boolean[26];
			int value = 0;
			for (int position = 0; position < WordleRules.WORD_LENGTH; position++) {
				int letter = word.charAt(position) - 'A';
				value += atPosition[position][letter];
				if (!seen[letter]) {
					seen[letter] = true;
					value += withLetter[letter];
				}
			}
			if (value > bestValue) {
				bestWord = word;
				bestValue = value;
			}
		}
		return new Choice(bestWord, bestValue, true, "most common letters among %d words".formatted(candidates.size()));
	}

}
