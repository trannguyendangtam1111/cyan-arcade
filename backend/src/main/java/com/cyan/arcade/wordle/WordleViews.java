package com.cyan.arcade.wordle;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.wordle.ai.Strategy;
import com.cyan.arcade.wordle.engine.HintType;
import com.cyan.arcade.wordle.engine.LetterResult;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** What the Word Guess API sends and receives. The hidden word is only ever in a finished run. */
final class WordleViews {

	private WordleViews() {
	}

	/**
	 * Today's puzzle, without its word.
	 * @param run the caller's run of it, or {@code null} when they have not started it
	 * @param hintPercents the score multiplier, in percent, by the number of hints taken (0 to 3)
	 */
	record DailyResponse(int puzzleNumber, LocalDate date, Instant nextPuzzleAt, int wordLength, int maxGuesses,
			int maxHints, List<Integer> hintPercents, RunResponse run) {
	}

	/**
	 * A run as its player sees it.
	 * @param mode {@code DAILY} or {@code PRACTICE}
	 * @param status {@code PLAYING}, {@code SOLVED} or {@code FAILED}
	 * @param availableHints the hints that can still be taken now
	 * @param answer the hidden word, once the run is over; {@code null} before
	 * @param result once the run is over: its score and the details it reports
	 * @param scored for a daily run, whether its score has been submitted
	 */
	record RunResponse(UUID id, String mode, Integer puzzleNumber, LocalDate date, String status, int wordLength,
			int maxGuesses, List<GuessView> guesses, List<HintView> hints, int hintsLeft, List<HintType> availableHints,
			String answer, ResultView result, boolean scored) {
	}

	record GuessView(String word, List<LetterResult> feedback) {
	}

	/**
	 * A hint taken and what it said.
	 * @param position for a reveal, which position (0 to 4)
	 * @param letter for a reveal, the letter there; for a check, the letter checked
	 * @param present for a check, whether the letter is in the word
	 * @param letters for an elimination, the letters the word does not have
	 */
	record HintView(HintType type, Integer position, String letter, Boolean present, List<String> letters) {
	}

	/**
	 * @param hintPercent the multiplier the hints taken left on the score
	 * @param details what the run reports to the platform with its score
	 */
	record ResultView(int score, int hintPercent, Map<String, Integer> details) {
	}

	/**
	 * A player's daily puzzles. Practice does not count.
	 * @param winRate solved out of played, in whole percent
	 * @param averageGuesses over solved puzzles, or {@code null} before the first
	 * @param distribution solved puzzles by guesses used: index 0 is one guess
	 */
	record StatsResponse(int played, int solved, int winRate, int currentStreak, int bestStreak, Double averageGuesses,
			List<Integer> distribution, LocalDate lastPlayed) {
	}

	record StartDailyRequest(@NotNull UUID sessionId) {
	}

	record GuessRequest(
			@NotNull @Pattern(regexp = "^[A-Za-z]{5}$") String word) {
	}

	/** @param letter for {@code CHECK_LETTER}: the letter to check */
	record HintRequest(@NotNull HintType type,
			@Pattern(regexp = "^[A-Za-z]$") String letter) {
	}

	// --- AI (admins) -----------------------------------------------------------------------------

	/** @param date the daily puzzle to solve; today when left out */
	record SolveRequest(@NotNull Strategy strategy, LocalDate date) {
	}

	/**
	 * How the AI solved a daily puzzle, guess by guess, for the board to play back.
	 * @param score what the run would score by the game's rule (no hints, no streak)
	 */
	record SolveResponse(int puzzleNumber, LocalDate date, Strategy strategy, boolean solved, int guesses, int score,
			String answer, List<AiStep> steps) {
	}

	/**
	 * @param reason the strategy's reasoning, in a few words
	 * @param couldWin whether the guess was one of the words still possible
	 * @param remaining the first few words still possible after it
	 */
	record AiStep(String guess, List<LetterResult> feedback, int candidatesBefore, int candidatesAfter, String reason,
			boolean couldWin, List<String> remaining) {
	}

	/**
	 * A strategy played against every possible answer.
	 * @param distribution solved games by guesses used: index 0 is one guess
	 */
	record BenchmarkResponse(Strategy strategy, int games, int solved, int failed, double averageGuesses,
			List<Integer> distribution, long millis) {
	}

}
