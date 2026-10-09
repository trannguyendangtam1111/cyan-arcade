package com.cyan.arcade.wordle.engine;

import java.util.List;
import java.util.Set;

import com.cyan.arcade.wordle.engine.WordleGame.GuessRejectedException;
import com.cyan.arcade.wordle.engine.WordleGame.Rejection;
import com.cyan.arcade.wordle.engine.WordleGame.Status;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/** A game of Word Guess as a value: guesses, the six-guess limit, winning and losing. */
class WordleGameTests {

	static final Vocabulary WORDS = Set.of("APPLE", "ALLEY", "CRANE", "SLOTH", "BUILT", "GHOST", "MOUND", "PIXEL",
			"QUICK")::contains;

	@Test
	void aRightGuessSolvesTheGame() {
		WordleGame game = WordleGame.start("APPLE").guess("crane", WORDS).guess("apple", WORDS);

		assertThat(game.status()).isEqualTo(Status.SOLVED);
		assertThat(game.guesses()).containsExactly("CRANE", "APPLE");
		assertThat(game.lastFeedback().solved()).isTrue();
		assertThat(game.feedback()).hasSize(2);
	}

	@Test
	void sixWrongGuessesLoseAndNoSeventhIsAllowed() {
		WordleGame game = WordleGame.start("APPLE");
		for (String guess : List.of("CRANE", "SLOTH", "BUILT", "GHOST", "MOUND")) {
			game = game.guess(guess, WORDS);
			assertThat(game.status()).isEqualTo(Status.PLAYING);
		}
		game = game.guess("PIXEL", WORDS);

		assertThat(game.status()).isEqualTo(Status.FAILED);
		WordleGame lost = game;
		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> lost.guess("APPLE", WORDS))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Rejection.GAME_OVER));
	}

	@Test
	void winningOnTheSixthGuessIsAWin() {
		WordleGame game = WordleGame.start("APPLE");
		for (String guess : List.of("CRANE", "SLOTH", "BUILT", "GHOST", "MOUND", "APPLE")) {
			game = game.guess(guess, WORDS);
		}
		assertThat(game.status()).isEqualTo(Status.SOLVED);
	}

	@Test
	void aSolvedGameTakesNoMoreGuesses() {
		WordleGame won = WordleGame.start("APPLE").guess("APPLE", WORDS);

		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> won.guess("CRANE", WORDS))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Rejection.GAME_OVER));
	}

	@Test
	void anUnknownOrMalformedWordIsRefusedWithoutUsingAGuess() {
		WordleGame game = WordleGame.start("APPLE").guess("CRANE", WORDS);

		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> game.guess("ZZZZZ", WORDS))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Rejection.NOT_A_WORD));
		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> game.guess("CRAN", WORDS))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Rejection.MALFORMED));
		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> game.guess("CR4NE", WORDS))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Rejection.MALFORMED));
		// The game is a value: the refusals changed nothing.
		assertThat(game.guesses()).containsExactly("CRANE");
	}

	@Test
	void aStoredGameIsReplayedThroughTheRules() {
		WordleGame played = WordleGame.start("APPLE").guess("CRANE", WORDS).guess("ALLEY", WORDS);

		assertThat(WordleGame.replay("APPLE", played.guesses(), List.of(), WORDS)).isEqualTo(played);
		// A stored guess the rules would have refused cannot be replayed.
		assertThatExceptionOfType(GuessRejectedException.class)
			.isThrownBy(() -> WordleGame.replay("APPLE", List.of("ZZZZZ"), List.of(), WORDS));
		// Nor guesses after the game was won.
		assertThatExceptionOfType(GuessRejectedException.class)
			.isThrownBy(() -> WordleGame.replay("APPLE", List.of("APPLE", "CRANE"), List.of(), WORDS));
		// Nor a seventh.
		assertThatExceptionOfType(GuessRejectedException.class).isThrownBy(() -> WordleGame.replay("APPLE",
				List.of("CRANE", "SLOTH", "BUILT", "GHOST", "MOUND", "PIXEL", "QUICK"), List.of(), WORDS));
	}

}
