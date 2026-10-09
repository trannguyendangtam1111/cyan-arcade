package com.cyan.arcade.sudoku;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.score.RunRules;
import com.cyan.arcade.sudoku.SudokuRun.Status;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.cyan.arcade.sudoku.engine.Scoring;
import com.cyan.arcade.sudoku.engine.Solver;
import com.cyan.arcade.sudoku.engine.SudokuGame;
import com.cyan.arcade.sudoku.engine.SudokuGame.ActionRejectedException;

import org.springframework.stereotype.Component;

/**
 * Sudoku's {@link RunRules}. The server played this run itself: it holds the puzzle, its solution,
 * every action and the clock. So a submission is not judged by whether it looks possible but by
 * whether it is exactly the run the server recorded for the session:
 *
 * <ul>
 * <li>the session has a ranked run (relaxed games are never scored), and that run is solved or
 * failed;</li>
 * <li>its puzzle is sound: the clues have exactly one solution, the stored one; a daily run's clues
 * are its day's stored puzzle, of that day's difficulty;</li>
 * <li>replayed through the rules, the recorded actions are all allowed and end exactly where the run
 * was recorded to end, with the same mistakes and hints (at most three);</li>
 * <li>the score and every detail are what {@link Scoring} gives for that run, with the playing time
 * the server measured and the streak it worked out when the run was solved.</li>
 * </ul>
 *
 * A session can be finished only once, and a daily run is tied to one session at a time and never
 * to a new one once its score is in, so a day's puzzle is rewarded once.
 */
@Component
class SudokuRunRules implements RunRules {

	private static final Set<String> DETAILS = Scoring
		.details(new Scoring.Summary(true, true, Difficulty.EASY, 1, 0, 0, 1))
		.keySet();

	private final SudokuRunStore store;

	SudokuRunRules(SudokuRunStore store) {
		this.store = store;
	}

	@Override
	public String gameSlug() {
		return SudokuService.GAME_SLUG;
	}

	@Override
	public Set<String> details() {
		return DETAILS;
	}

	/** Without the session, only whether the numbers agree with each other: a Sudoku run must also match its session. */
	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		boolean solved = details.get("solvedLevel") > 0;
		int level = details.get("difficulty");
		int mistakes = details.get("mistakes");
		int hints = details.get("hints");
		int streak = details.get("streak");
		if (level < 1 || level > 4 || streak < 0 || hints < 0
				|| hints > SudokuGame.MAX_HINTS || mistakes < 0 || mistakes > SudokuGame.RANKED_MISTAKE_LIMIT
				|| (solved && mistakes >= SudokuGame.RANKED_MISTAKE_LIMIT)
				|| (!solved && mistakes != SudokuGame.RANKED_MISTAKE_LIMIT)) {
			return Optional.of("not a Sudoku result");
		}
		// A solved daily puzzle always has a streak of at least one; nothing else has one.
		Scoring.Summary summary = new Scoring.Summary(solved, solved && streak > 0, Difficulty.ofLevel(level),
				details.get("seconds"), mistakes, hints, streak);
		if (!Scoring.details(summary).equals(details)) {
			return Optional.of("details do not add up");
		}
		if (score != Scoring.score(summary)) {
			return Optional.of("details do not match the score");
		}
		return Optional.empty();
	}

	@Override
	public Optional<String> problemWith(UUID sessionId, int score, Map<String, Integer> details, Duration elapsed) {
		Optional<String> inconsistent = problemWith(score, details, elapsed);
		if (inconsistent.isPresent()) {
			return inconsistent;
		}
		Optional<SudokuRun> recorded = this.store.findBySession(sessionId);
		if (recorded.isEmpty() || !recorded.get().ranked()) {
			return Optional.of("no ranked Sudoku run for this session");
		}
		SudokuRun run = recorded.get();
		if (!run.status().isFinished() || run.finishedAt() == null) {
			return Optional.of("the puzzle is not over");
		}
		int[] givens = Grid.parse(run.givens());
		if (Solver.countSolutions(givens, 2) != 1
				|| !Solver.solve(givens).map(Grid::format).orElse("").equals(run.solution())) {
			return Optional.of("the puzzle is not sound");
		}
		if (run.isDaily()) {
			Optional<Puzzle> daily = this.store.findDailyPuzzle(run.puzzleDate());
			if (daily.isEmpty() || !daily.get().givens().equals(run.givens())
					|| daily.get().difficulty() != run.difficulty()
					|| !run.puzzleNumber().equals(DailySchedule.puzzleNumber(run.puzzleDate()))) {
				return Optional.of("not the daily puzzle of the run's day");
			}
		}
		SudokuGame replayed;
		try {
			replayed = run.game();
		}
		catch (ActionRejectedException ex) {
			return Optional.of("the recorded actions break the rules: " + ex.reason());
		}
		Status expected = switch (replayed.status()) {
			case PLAYING -> Status.PLAYING;
			case SOLVED -> Status.SOLVED;
			case FAILED -> Status.FAILED;
		};
		if (expected != run.status() || replayed.mistakes() != run.mistakes() || replayed.hints() != run.hints()) {
			return Optional.of("the actions do not end the run where it was recorded to end");
		}
		Scoring.Summary summary = run.summary();
		if (!Scoring.details(summary).equals(details)) {
			return Optional.of("details do not match the recorded run");
		}
		if (score != Scoring.score(summary)) {
			return Optional.of("score does not match the recorded run");
		}
		return Optional.empty();
	}

}
