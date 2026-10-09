package com.cyan.arcade.wordle.engine;

import java.util.List;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

import static com.cyan.arcade.wordle.engine.LetterResult.ABSENT;
import static com.cyan.arcade.wordle.engine.LetterResult.CORRECT;
import static com.cyan.arcade.wordle.engine.LetterResult.PRESENT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** How a guess is judged: one function for players, the AI, hints and the score checks. */
class WordleEngineTests {

	/** Each letter as C (correct), P (present) or A (absent). */
	private static String judge(String target, String guess) {
		StringBuilder marks = new StringBuilder();
		for (LetterResult result : WordleEngine.evaluate(target, guess).results()) {
			marks.append(switch (result) {
				case CORRECT -> 'C';
				case PRESENT -> 'P';
				case ABSENT -> 'A';
			});
		}
		return marks.toString();
	}

	@Test
	void theWordItselfIsAllCorrectAndSolves() {
		Feedback feedback = WordleEngine.evaluate("CRANE", "CRANE");

		assertThat(feedback.results()).containsOnly(CORRECT);
		assertThat(feedback.solved()).isTrue();
		assertThat(feedback.code()).isEqualTo(Feedback.SOLVED_CODE);
	}

	@Test
	void lettersInTheRightPlaceAreCorrectElsewherePresentAndMissingAbsent() {
		assertThat(WordleEngine.evaluate("CRANE", "CRATE").results()).containsExactly(CORRECT, CORRECT, CORRECT,
				ABSENT, CORRECT);
		assertThat(WordleEngine.evaluate("CRANE", "NACRE").results()).containsExactly(PRESENT, PRESENT, PRESENT,
				PRESENT, CORRECT);
		assertThat(WordleEngine.evaluate("CRANE", "BUILT").results()).containsOnly(ABSENT);
		assertThat(WordleEngine.evaluate("CRANE", "CRATE").solved()).isFalse();
	}

	@ParameterizedTest(name = "{1} against {0} is {2}")
	@CsvSource({
			// The word has one L: the first L of the guess takes it, the second is absent.
			"APPLE, ALLEY, CPAPA",
			// A correct letter is matched first, even when a copy of it comes earlier in the guess.
			"APPLE, LOLLY, AAACA",
			"ABBEY, BABES, PPCCA",
			// The word has one E and the guess has it in place: the guess's other Es are absent.
			"CRANE, EERIE, AAPAC",
			"STEAL, LEVEL, APAAC",
			// The word repeats a letter: each copy in the guess is matched to a copy in the word.
			"SPEED, CREPT, AACPA",
			"EERIE, THREE, AACPC",
			// Both repeat it: as many marked as the word has.
			"GEESE, EERIE, PCAAC",
			"GEESE, EGRET, PPAPA",
			"PUPPY, PAPPY, CACCC",
			"LLAMA, ALLAY, PCPPA" })
	void duplicateLettersAreCountedNotJustLookedUp(String target, String guess, String expected) {
		assertThat(judge(target, guess)).isEqualTo(expected);
	}

	@Test
	void aPresentLetterIsOnlyMarkedWhileTheWordHasAnUnmatchedCopyLeft() {
		// ALLEY against APPLE: A correct, L present (APPLE has one L), second L absent, E present, Y absent.
		assertThat(WordleEngine.evaluate("APPLE", "ALLEY").results()).containsExactly(CORRECT, PRESENT, ABSENT, PRESENT,
				ABSENT);
	}

	@Test
	void feedbackCodesRoundTrip() {
		for (int code = 0; code < Feedback.CODES; code++) {
			Feedback feedback = new Feedback(code);
			assertThat(Feedback.of(feedback.results())).isEqualTo(feedback);
		}
		assertThat(Feedback.of(List.of(ABSENT, PRESENT, CORRECT, ABSENT, ABSENT)).at(2)).isEqualTo(CORRECT);
		assertThatIllegalArgumentException().isThrownBy(() -> new Feedback(Feedback.CODES));
	}

	@Test
	void theFastCodeIsTheSameJudgement() {
		assertThat(WordleEngine.code("APPLE", "ALLEY")).isEqualTo(WordleEngine.evaluate("APPLE", "ALLEY").code());
	}

	@Test
	void onlyFiveCapitalLettersCanBeJudged() {
		assertThatIllegalArgumentException().isThrownBy(() -> WordleEngine.evaluate("CRANE", "CRAN"));
		assertThatIllegalArgumentException().isThrownBy(() -> WordleEngine.evaluate("CRANE", "crane"));
		assertThatIllegalArgumentException().isThrownBy(() -> WordleEngine.evaluate("CRANE", "CRAN3"));
		assertThat(WordleRules.isWellFormed(WordleRules.normalize(" crane "))).isTrue();
	}

}
