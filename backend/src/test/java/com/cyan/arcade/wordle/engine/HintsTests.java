package com.cyan.arcade.wordle.engine;

import java.util.HashSet;
import java.util.Set;

import com.cyan.arcade.wordle.engine.Hints.HintUnavailableException;
import com.cyan.arcade.wordle.engine.Hints.Unavailable;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** The three hints: what each tells, that none gives the word away, and how many a run gets. */
class HintsTests {

	private static final Vocabulary WORDS = WordleGameTests.WORDS;

	@Test
	void revealShowsTheLetterOfAPositionTheGuessesHaveNotFound() {
		// CRANE against APPLE gets only the E right (position 4).
		WordleGame game = WordleGame.start("APPLE").guess("CRANE", WORDS);
		Set<Integer> seen = new HashSet<>();
		for (long seed = 0; seed < 200; seed++) {
			WordleGame hinted = Hints.take(game, HintType.REVEAL_LETTER, null, seed);
			Hint hint = hinted.hints().getLast();
			assertThat(hint.position()).isBetween(0, 3);
			assertThat(Hints.revealedLetter(hinted, hint)).isEqualTo("APPLE".charAt(hint.position()));
			seen.add(hint.position());
		}
		// Picked at random, among all four unknown positions.
		assertThat(seen).containsExactlyInAnyOrder(0, 1, 2, 3);
	}

	@Test
	void theSameRunAndSeedAlwaysGetTheSameHint() {
		WordleGame game = WordleGame.start("APPLE").guess("CRANE", WORDS);

		assertThat(Hints.take(game, HintType.REVEAL_LETTER, null, 42)).isEqualTo(Hints.take(game, HintType.REVEAL_LETTER, null, 42));
		assertThat(Hints.take(game, HintType.ELIMINATE_LETTERS, null, 7))
			.isEqualTo(Hints.take(game, HintType.ELIMINATE_LETTERS, null, 7));
	}

	@Test
	void revealNeverGivesTheWordAway() {
		// A reveal makes its position known.
		WordleGame revealed = Hints.take(WordleGame.start("APPLE"), HintType.REVEAL_LETTER, null, 1);
		assertThat(Hints.unknownPositions(revealed)).hasSize(4);

		Vocabulary any = (word) -> true;
		// APPLY against APPLE leaves only the last position unknown: revealing it would be the word.
		WordleGame oneLeft = WordleGame.start("APPLE").guess("APPLY", any);
		assertThat(Hints.unknownPositions(oneLeft)).containsExactly(4);
		assertThatExceptionOfType(HintUnavailableException.class)
			.isThrownBy(() -> Hints.take(oneLeft, HintType.REVEAL_LETTER, null, 1))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Unavailable.WOULD_REVEAL_WORD));
		assertThat(Hints.available(oneLeft)).doesNotContain(HintType.REVEAL_LETTER);
	}

	@Test
	void checkSaysWhetherALetterIsInTheWord() {
		WordleGame game = WordleGame.start("APPLE");

		WordleGame present = Hints.take(game, HintType.CHECK_LETTER, 'p', 0);
		assertThat(present.hints().getLast()).isEqualTo(new Hint(HintType.CHECK_LETTER, -1, "P"));
		assertThat(Hints.isPresent(present, present.hints().getLast())).isTrue();

		WordleGame absent = Hints.take(game, HintType.CHECK_LETTER, 'Z', 0);
		assertThat(Hints.isPresent(absent, absent.hints().getLast())).isFalse();
	}

	@Test
	void checkingALetterAlreadyKnownIsRefused() {
		WordleGame game = WordleGame.start("APPLE").guess("CRANE", WORDS);

		assertThatExceptionOfType(HintUnavailableException.class)
			.isThrownBy(() -> Hints.take(game, HintType.CHECK_LETTER, 'R', 0))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Unavailable.LETTER_KNOWN));
		assertThatIllegalArgumentException().isThrownBy(() -> Hints.take(game, HintType.CHECK_LETTER, '3', 0));
		assertThatIllegalArgumentException().isThrownBy(() -> Hints.take(game, HintType.CHECK_LETTER, null, 0));
	}

	@Test
	void eliminateRemovesOnlyLettersTheWordLacksAndThePlayerHasNotRuledOut() {
		WordleGame game = WordleGame.start("APPLE").guess("CRANE", WORDS);
		for (long seed = 0; seed < 100; seed++) {
			Hint hint = Hints.take(game, HintType.ELIMINATE_LETTERS, null, seed).hints().getLast();
			assertThat(hint.letters()).hasSize(Hints.LETTERS_REMOVED);
			for (char letter : hint.letters().toCharArray()) {
				assertThat("APPLE").doesNotContain(String.valueOf(letter));
				// C, R and N were guessed: the player knows already.
				assertThat("CRN").doesNotContain(String.valueOf(letter));
			}
			assertThat(hint.letters()).isEqualTo(hint.letters().chars().sorted()
				.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString());
		}
	}

	@Test
	void eachHintOnceAndThreeAtMost() {
		WordleGame game = WordleGame.start("APPLE");
		game = Hints.take(game, HintType.REVEAL_LETTER, null, 1);
		WordleGame once = game;
		assertThatExceptionOfType(HintUnavailableException.class)
			.isThrownBy(() -> Hints.take(once, HintType.REVEAL_LETTER, null, 2))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Unavailable.ALREADY_USED));
		game = Hints.take(game, HintType.CHECK_LETTER, 'Z', 2);
		game = Hints.take(game, HintType.ELIMINATE_LETTERS, null, 3);

		assertThat(game.hints()).hasSize(WordleRules.MAX_HINTS);
		assertThat(Hints.available(game)).isEmpty();
		WordleGame all = game;
		assertThatExceptionOfType(HintUnavailableException.class)
			.isThrownBy(() -> Hints.take(all, HintType.CHECK_LETTER, 'Q', 4))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Unavailable.NO_HINTS_LEFT));
	}

	@Test
	void noHintOnceTheGameIsOver() {
		WordleGame won = WordleGame.start("APPLE").guess("APPLE", WORDS);

		assertThatExceptionOfType(HintUnavailableException.class)
			.isThrownBy(() -> Hints.take(won, HintType.ELIMINATE_LETTERS, null, 1))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Unavailable.GAME_OVER));
		assertThat(Hints.available(won)).isEmpty();
	}

	@Test
	void hintsAreStoredAsText() {
		for (Hint hint : new Hint[] { new Hint(HintType.REVEAL_LETTER, 3, ""), new Hint(HintType.CHECK_LETTER, -1, "E"),
				new Hint(HintType.ELIMINATE_LETTERS, -1, "QXZ") }) {
			assertThat(Hint.decode(hint.encode())).isEqualTo(hint);
		}
		assertThat(new Hint(HintType.REVEAL_LETTER, 2, "").encode()).isEqualTo("REVEAL_LETTER:2");
	}

}
