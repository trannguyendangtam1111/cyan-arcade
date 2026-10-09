package com.cyan.arcade.sudoku;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.sudoku.ai.Strategy;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.SudokuGame.HintType;
import com.cyan.arcade.sudoku.engine.Technique;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** What the Sudoku API sends and receives. A run's solution is only ever in a run that is over. */
final class SudokuViews {

	private SudokuViews() {
	}

	/**
	 * Today's puzzle (without its digits until a run starts), the rules, and the caller's runs.
	 * @param daily the caller's run of today's puzzle, or {@code null}
	 * @param practice the caller's practice game in progress, or {@code null}
	 * @param hintPercents the score multiplier, in percent, by hints taken (0 to 3)
	 */
	record TodayResponse(int puzzleNumber, LocalDate date, Difficulty difficulty, Instant nextPuzzleAt, int maxHints,
			int mistakeLimit, List<Integer> hintPercents, List<DifficultyView> difficulties, RunResponse daily,
			RunResponse practice) {
	}

	record DifficultyView(Difficulty id, String label, int level, int baseScore, int parSeconds) {
	}

	/**
	 * A run as its player sees it.
	 * @param givens the clues, 81 characters, {@code 0} for an empty cell
	 * @param values the board now, clues included
	 * @param revealed cells filled by a hint, locked like clues
	 * @param wrong for a ranked run, cells holding a digit that is not the solution's
	 * @param mistakeRule {@code SOLUTION} for ranked runs, {@code CONFLICT} for relaxed ones
	 * @param mistakeLimit mistakes that end the run, 0 for none
	 * @param elapsedMs playing time so far by the server's clock, pauses left out
	 * @param solution the solution, once the run is over; {@code null} before
	 * @param result once solved or failed: the score and what the run reports with it
	 * @param scored for a ranked run, whether its score has been submitted
	 */
	record RunResponse(UUID id, String mode, boolean ranked, Difficulty difficulty, Integer puzzleNumber,
			LocalDate date, String status, String givens, String values, List<Integer> revealed, List<Integer> wrong,
			int mistakes, String mistakeRule, int mistakeLimit, int hintsUsed, int hintsLeft, List<HintTaken> hints,
			long elapsedMs, boolean paused, String solution, ResultView result, boolean scored) {
	}

	record HintTaken(HintType type, int cell) {
	}

	/**
	 * @param timePercent, mistakePercent, hintPercent the multipliers the score was made of
	 * @param details what the run reports to the platform with its score
	 */
	record ResultView(int score, int seconds, int timePercent, int mistakePercent, int hintPercent,
			Map<String, Integer> details) {
	}

	/** A run after a hint, and what the hint said. */
	record HintResponse(RunResponse run, HintView hint) {
	}

	/**
	 * @param digit for a reveal or an explanation, the digit; 0 for a find
	 * @param technique the technique that solves the cell; {@code null} when none applies
	 * @param explanation the reasoning, one deduction per line
	 * @param highlight cells the explanation is about
	 * @param eliminations for an explanation, candidates the deductions remove: "cell:digit"
	 */
	record HintView(HintType type, int cell, int digit, Technique technique, List<String> explanation,
			List<Integer> highlight, List<String> eliminations) {
	}

	/**
	 * A player's ranked games. Relaxed practice does not count.
	 * @param currentStreak daily puzzles solved on consecutive UTC days, up to today or yesterday
	 */
	record StatsResponse(ModeStats daily, ModeStats practice, int currentStreak, int bestStreak, LocalDate lastDaily) {
	}

	/**
	 * @param played finished and abandoned runs
	 * @param winRate completed out of played, in whole percent
	 * @param averageSeconds over completed runs, or {@code null} before the first
	 * @param averageMistakes per completed run
	 * @param averageHints per completed run
	 * @param bestSeconds the fastest completed run of each difficulty, {@code null} when none
	 */
	record ModeStats(int played, int completed, int winRate, Integer averageSeconds, Double averageMistakes,
			Double averageHints, Map<Difficulty, Integer> bestSeconds) {
	}

	record StartDailyRequest(@NotNull UUID sessionId) {
	}

	/** @param sessionId the platform session for a ranked game; leave out for a relaxed one */
	record StartPracticeRequest(@NotNull Difficulty difficulty, UUID sessionId) {
	}

	record BindSessionRequest(@NotNull UUID sessionId) {
	}

	/** @param digit 1-9, or 0 to clear the cell */
	record MoveRequest(@NotNull @Min(0) @Max(80) Integer cell, @NotNull @Min(0) @Max(9) Integer digit) {
	}

	record MovesRequest(@NotEmpty @Size(max = 81) List<@Valid @NotNull MoveRequest> moves) {
	}

	/** @param cell for a reveal, the chosen cell; leave out to let the hint choose */
	record HintRequest(@NotNull HintType type, @Min(0) @Max(80) Integer cell) {
	}

	// --- AI (admins) -----------------------------------------------------------------------------

	/**
	 * Which puzzle to solve: a day's daily puzzle ({@code date}), or a practice puzzle of a
	 * difficulty ({@code seed} picks it; a new one when left out). With neither, today's daily.
	 */
	record SolveRequest(@NotNull Strategy strategy, LocalDate date, Difficulty difficulty, Long seed) {
	}

	/**
	 * How the AI solved a puzzle, move by move, for the board to play back.
	 * @param solution the solved board
	 * @param guesses, backtracks for the search: digits tried and dead ends
	 * @param searched for the logical strategies: placements logic could not make, settled by search
	 * @param trimmed whether the search was too long to show move by move
	 */
	record SolveResponse(Strategy strategy, LocalDate date, Integer puzzleNumber, Difficulty difficulty, long seed,
			String givens, String solution, List<AiMove> moves, int guesses, int backtracks,
			Map<Technique, Integer> techniques, int searched, boolean trimmed, long millis) {
	}

	/**
	 * @param kind {@code PLACE}, {@code ELIMINATE}, {@code GUESS} or {@code BACKTRACK}
	 * @param eliminations candidates removed: "cell:digit"
	 * @param cleared for a backtrack, the cells cleared
	 */
	record AiMove(String kind, int cell, int digit, List<String> eliminations, List<Integer> cleared,
			Technique technique, String text, List<String> lesson, List<Integer> highlight) {
	}

}
