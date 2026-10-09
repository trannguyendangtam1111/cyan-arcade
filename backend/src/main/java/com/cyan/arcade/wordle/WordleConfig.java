package com.cyan.arcade.wordle;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

import com.cyan.arcade.wordle.ai.WordleSolver;
import com.cyan.arcade.wordle.daily.DailySchedule;
import com.cyan.arcade.wordle.dictionary.Dictionary;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

/** The word lists, read once at startup, and what is built on them. */
@Configuration(proxyBeanMethods = false)
class WordleConfig {

	static final String ANSWERS = "wordle/answers.txt";

	static final String GUESSES = "wordle/guesses.txt";

	@Bean
	Dictionary wordleDictionary() {
		try (InputStream answers = new ClassPathResource(ANSWERS).getInputStream();
				InputStream guesses = new ClassPathResource(GUESSES).getInputStream()) {
			return Dictionary.read(answers, guesses);
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Word Guess word lists are missing", ex);
		}
	}

	@Bean
	DailySchedule wordleDailySchedule(Dictionary dictionary) {
		return new DailySchedule(dictionary.answers());
	}

	@Bean
	WordleSolver wordleSolver(Dictionary dictionary) {
		return new WordleSolver(dictionary.answers(), dictionary.allowedWords());
	}

}
