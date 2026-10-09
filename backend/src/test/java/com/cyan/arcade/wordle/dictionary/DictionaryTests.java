package com.cyan.arcade.wordle.dictionary;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import com.cyan.arcade.wordle.RealWords;
import com.cyan.arcade.wordle.engine.WordleRules;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** The word lists: answers, which are also guesses, and the extra guesses. */
class DictionaryTests {

	@Test
	void theRealListsAreWellFormedAndEveryAnswerCanBeGuessed() {
		Dictionary words = RealWords.dictionary();

		assertThat(words.answers()).hasSizeGreaterThan(500).doesNotHaveDuplicates();
		assertThat(words.allowedWords()).hasSizeGreaterThan(words.answers().size()).isSorted();
		assertThat(words.answers()).allSatisfy((word) -> {
			assertThat(WordleRules.isWellFormed(word)).isTrue();
			assertThat(words.isAllowed(word)).isTrue();
			assertThat(words.isAnswer(word)).isTrue();
		});
	}

	@Test
	void extraGuessesAreAllowedButNeverTheAnswer() {
		Dictionary words = Dictionary.of(List.of("APPLE"), List.of("ADIEU"));

		assertThat(words.isAllowed("ADIEU")).isTrue();
		assertThat(words.isAnswer("ADIEU")).isFalse();
		assertThat(words.isAllowed("ZZZZZ")).isFalse();
	}

	@Test
	void commentsAndBlankLinesAreSkipped() {
		Dictionary words = Dictionary.read(stream("# answers\n\nAPPLE\n  CRANE  \n"), stream("# guesses\nADIEU\n"));

		assertThat(words.answers()).containsExactly("APPLE", "CRANE");
		assertThat(words.allowedWords()).containsExactly("ADIEU", "APPLE", "CRANE");
	}

	@Test
	void aBrokenListIsRefusedAtStartup() {
		assertThatIllegalArgumentException().isThrownBy(() -> Dictionary.of(List.of("APPLE", "APPLE"), List.of()));
		assertThatIllegalArgumentException().isThrownBy(() -> Dictionary.of(List.of("apple"), List.of()));
		assertThatIllegalArgumentException().isThrownBy(() -> Dictionary.of(List.of("APPLE"), List.of("TOOLONG")));
		assertThatIllegalArgumentException().isThrownBy(() -> Dictionary.of(List.of(), List.of()));
	}

	private static ByteArrayInputStream stream(String text) {
		return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
	}

}
