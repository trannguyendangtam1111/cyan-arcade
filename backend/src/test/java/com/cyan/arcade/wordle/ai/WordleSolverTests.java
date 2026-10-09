package com.cyan.arcade.wordle.ai;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.cyan.arcade.wordle.ai.WordleSolver.Choice;
import com.cyan.arcade.wordle.ai.WordleSolver.Solution;
import com.cyan.arcade.wordle.ai.WordleSolver.Step;
import com.cyan.arcade.wordle.RealWords;
import com.cyan.arcade.wordle.dictionary.Dictionary;
import com.cyan.arcade.wordle.engine.Feedback;
import com.cyan.arcade.wordle.engine.WordleEngine;
import com.cyan.arcade.wordle.engine.WordleGame;
import com.cyan.arcade.wordle.engine.WordleGame.GuessRejectedException;
import com.cyan.arcade.wordle.engine.WordleRules;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/** The Word Guess AI: it solves by elimination, through the game's own rules, the same way every time. */
class WordleSolverTests {

	private static Dictionary words;

	private static WordleSolver solver;

	@BeforeAll
	static void loadTheRealWords() {
		words = RealWords.dictionary();
		solver = new WordleSolver(words.answers(), words.allowedWords());
	}

	/** One game against {@code target}, through the rules, as the server plays it. */
	private static Solution play(Strategy strategy, String target) {
		WordleGame[] game = { WordleGame.start(target) };
		return solver.solve(strategy, (guess) -> {
			game[0] = game[0].guess(guess, words);
			return game[0].lastFeedback();
		});
	}

	@Test
	void eliminationKeepsExactlyTheWordsThatWouldHaveAnsweredTheSame() {
		List<String> candidates = List.of("APPLE", "AMPLE", "ANGLE", "ALLEY", "CRANE");
		Feedback feedback = WordleEngine.evaluate("APPLE", "AMPLE");

		List<String> left = WordleSolver.consistent(candidates, "AMPLE", feedback);

		assertThat(left).containsExactly("APPLE");
		// Every word left gives the same feedback to the guess, and every word dropped would not have.
		assertThat(WordleSolver.consistent(words.answers(), "CRANE", WordleEngine.evaluate("SLOTH", "CRANE")))
			.contains("SLOTH")
			.allSatisfy((word) -> assertThat(WordleEngine.evaluate(word, "CRANE"))
				.isEqualTo(WordleEngine.evaluate("SLOTH", "CRANE")));
	}

	@Test
	void duplicateLetterFeedbackIsHandledLikeThePlayersGame() {
		// ALLEY against APPLE says: A first, exactly one L (not second or third), an E (not fourth), no Y.
		// ANKLE fits that as well as APPLE; LLAMA has two Ls, ALOFT has its L second, ADULT has no E.
		List<String> left = WordleSolver.consistent(List.of("APPLE", "ALOFT", "LLAMA", "ANKLE", "ADULT"), "ALLEY",
				WordleEngine.evaluate("APPLE", "ALLEY"));

		assertThat(left).containsExactly("APPLE", "ANKLE");
	}

	@ParameterizedTest
	@EnumSource(Strategy.class)
	void everyStrategySolvesKnownWords(Strategy strategy) {
		for (String target : List.of("APPLE", "CRANE", "PIZZA", "JOLLY", "QUEEN", "ZESTY", "LLAMA", "EIGHT")) {
			Solution solution = play(strategy, target);

			assertThat(solution.solved()).as("%s on %s", strategy, target).isTrue();
			assertThat(solution.steps().getLast().choice().word()).isEqualTo(target);
			assertThat(solution.guesses()).isBetween(1, WordleRules.MAX_GUESSES);
		}
	}

	@ParameterizedTest
	@EnumSource(Strategy.class)
	void theSameWordAndStrategyGiveTheSameGuessesEveryTime(Strategy strategy) {
		WordleSolver fresh = new WordleSolver(words.answers(), words.allowedWords());
		for (String target : List.of("SLOTH", "BERRY", "FIFTY")) {
			List<String> first = guesses(play(strategy, target));
			WordleGame[] game = { WordleGame.start(target) };
			List<String> again = guesses(fresh.solve(strategy, (guess) -> {
				game[0] = game[0].guess(guess, words);
				return game[0].lastFeedback();
			}));
			assertThat(again).isEqualTo(first);
		}
	}

	@ParameterizedTest
	@EnumSource(Strategy.class)
	void everyGuessIsAnAllowedWordAndEveryStepNarrowsTheField(Strategy strategy) {
		Solution solution = play(strategy, "GRAVY");
		int left = words.answers().size();
		for (Step step : solution.steps()) {
			assertThat(words.isAllowed(step.choice().word())).isTrue();
			assertThat(step.candidatesBefore()).isEqualTo(left);
			assertThat(step.candidatesAfter()).isLessThanOrEqualTo(step.candidatesBefore()).isPositive();
			assertThat(step.remaining()).hasSizeLessThanOrEqualTo(WordleSolver.SAMPLE).isSorted();
			left = step.candidatesAfter();
		}
	}

	@Test
	void theAiCannotGetPastTheGamesRules() {
		// The game refuses a word it does not know, exactly as for a player, and the solver cannot go on.
		WordleSolver cheater = new WordleSolver(words.answers(), List.of("QQQQQ"));
		WordleGame[] game = { WordleGame.start("APPLE") };
		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> cheater.solve(Strategy.BALANCED,
				(guess) -> {
					game[0] = game[0].guess(guess, words);
					return game[0].lastFeedback();
				}));
		assertThat(game[0].guesses()).isEmpty();

		// And it gets six guesses, no more, even for a word it does not expect.
		WordleSolver blind = new WordleSolver(List.of("CRANE", "CRATE", "GRATE", "TRACE", "BRACE", "GRACE", "PLACE",
				"SPACE", "PEACE"), words.allowedWords());
		WordleGame[] other = { WordleGame.start("ZESTY") };
		Solution solution = blind.solve(Strategy.CONSERVATIVE, (guess) -> {
			other[0] = other[0].guess(guess, words);
			return other[0].lastFeedback();
		});
		assertThat(solution.solved()).isFalse();
		assertThat(solution.guesses()).isLessThanOrEqualTo(WordleRules.MAX_GUESSES);
	}

	@Test
	void theStrategiesOpenDifferently() {
		Map<Strategy, Choice> openers = new EnumMap<>(Strategy.class);
		for (Strategy strategy : Strategy.values()) {
			openers.put(strategy, solver.choose(strategy, words.answers()));
		}
		// Balanced and Conservative open alike when the most informative word could itself be the
		// answer; they part ways once a possible answer is no longer the most informative guess.
		assertThat(openers.values().stream().map(Choice::word).distinct()).as("openers %s", openers).hasSizeGreaterThanOrEqualTo(3);
		assertThat(openers.get(Strategy.INFORMATION_HUNTER).word()).isNotEqualTo(openers.get(Strategy.BALANCED).word());
		assertThat(openers.get(Strategy.SPEED_SOLVER).word()).isNotEqualTo(openers.get(Strategy.BALANCED).word());
		// Conservative and Speed Solver only guess words that could win.
		assertThat(words.isAnswer(openers.get(Strategy.CONSERVATIVE).word())).isTrue();
		assertThat(words.isAnswer(openers.get(Strategy.SPEED_SOLVER).word())).isTrue();
	}

	@Test
	void informationHunterTradesAChanceToWinForElimination() {
		// Five words that differ in one letter. Guessing one of them can win, but four times out of
		// five it rules out only itself; a word that tests several of the letters at once splits them all.
		List<String> candidates = List.of("BATCH", "CATCH", "HATCH", "LATCH", "MATCH", "PATCH", "WATCH");

		Choice hunter = solver.choose(Strategy.INFORMATION_HUNTER, candidates);
		Choice conservative = solver.choose(Strategy.CONSERVATIVE, candidates);
		Choice speed = solver.choose(Strategy.SPEED_SOLVER, candidates);

		assertThat(candidates).doesNotContain(hunter.word());
		assertThat(hunter.couldWin()).isFalse();
		assertThat(candidates).contains(conservative.word(), speed.word());
		assertThat(WordleSolver.expectedLeft(hunter.word(), candidates))
			.isLessThan(WordleSolver.expectedLeft(conservative.word(), candidates));
	}

	@Test
	void balancedGuessesWordsThatCanWinMoreOftenThanTheHunter() {
		// Over the same puzzles, the half bit Balanced gives a possible answer shows: it goes for the
		// win more often, while the hunter keeps probing with words that only eliminate.
		int[] balancedWinners = { 0 };
		int[] hunterWinners = { 0 };
		for (int index = 3; index < words.answers().size(); index += 11) {
			String target = words.answers().get(index);
			play(Strategy.BALANCED, target).steps().forEach((step) -> balancedWinners[0] += step.choice().couldWin() ? 1 : 0);
			play(Strategy.INFORMATION_HUNTER, target).steps()
				.forEach((step) -> hunterWinners[0] += step.choice().couldWin() ? 1 : 0);
		}
		assertThat(balancedWinners[0]).isGreaterThan(hunterWinners[0]);
	}

	@Test
	void balancedAndConservativePartWaysWhenTheBestProbeCannotWin() {
		// After ALERT, Balanced may probe with any allowed word; Conservative sticks to possible answers.
		int differentSecondGuesses = 0;
		for (int index = 0; index < words.answers().size(); index += 13) {
			String target = words.answers().get(index);
			List<String> balanced = guesses(play(Strategy.BALANCED, target));
			List<String> conservative = guesses(play(Strategy.CONSERVATIVE, target));
			if (balanced.size() > 1 && conservative.size() > 1 && !balanced.get(1).equals(conservative.get(1))) {
				differentSecondGuesses++;
			}
		}
		assertThat(differentSecondGuesses).isPositive();
	}

	@Test
	void withTwoWordsLeftEveryStrategyGuessesOne() {
		for (Strategy strategy : Strategy.values()) {
			assertThat(solver.choose(strategy, List.of("SHAPE", "SHAKE")).word()).isEqualTo("SHAKE");
		}
	}

	@Test
	void theStrategiesAreStrongOverManyWords() {
		Map<Strategy, Integer> failures = new EnumMap<>(Strategy.class);
		Map<Strategy, Integer> total = new EnumMap<>(Strategy.class);
		// Every seventh answer: a fair sample of the list without solving all of it four times.
		List<String> sample = new ArrayList<>();
		for (int index = 0; index < words.answers().size(); index += 7) {
			sample.add(words.answers().get(index));
		}
		Set<List<String>> paths = new HashSet<>();
		for (Strategy strategy : Strategy.values()) {
			for (String target : sample) {
				Solution solution = play(strategy, target);
				failures.merge(strategy, solution.solved() ? 0 : 1, Integer::sum);
				total.merge(strategy, solution.guesses(), Integer::sum);
				paths.add(guesses(solution));
			}
		}
		assertThat(failures.get(Strategy.BALANCED)).isZero();
		assertThat(failures.get(Strategy.INFORMATION_HUNTER)).isZero();
		assertThat(total.get(Strategy.BALANCED) / (double) sample.size()).isLessThan(4.0);
		// Different strategies really play differently, not just open differently.
		assertThat(paths).hasSizeGreaterThan(sample.size() * 2);
	}

	private static List<String> guesses(Solution solution) {
		return solution.steps().stream().map((step) -> step.choice().word()).toList();
	}

}
