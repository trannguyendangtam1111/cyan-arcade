package com.cyan.arcade.sudoku;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import com.cyan.arcade.sudoku.SudokuRun.Mode;
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
 *
 * <p>Each kind of ranked run has a leaderboard of its own: {@value #DAILY} for daily puzzles, and one
 * per difficulty for ranked practice ({@code easy} to {@code expert}). A run is started, picked up
 * again and finished only in the mode of its kind (see {@link #modeOf(Mode, Difficulty)}). These
 * modes keep Classic's rules and rewards; they only split its leaderboard. Classic itself stays
 * declared for the scores recorded before the split, and for a run already tied to a Classic
 * session then; no new run is tied to one.
 */
@Component
class SudokuRunRules implements RunRules {

	/** The daily puzzle's leaderboard. */
	static final String DAILY = "daily";

	private static final List<ModeSpec> MODES = List.of(ModeSpec.CLASSIC, ranked(DAILY, "Daily"),
			ranked(Difficulty.EASY), ranked(Difficulty.MEDIUM), ranked(Difficulty.HARD), ranked(Difficulty.EXPERT));

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

	@Override
	public List<ModeSpec> modes() {
		return MODES;
	}

	/** The mode a ranked run of this kind is played in: {@value #DAILY}, or its practice difficulty. */
	static String modeOf(Mode mode, Difficulty difficulty) {
		return (mode == Mode.DAILY) ? DAILY : difficulty.name().toLowerCase(Locale.ROOT);
	}

	static String modeOf(SudokuRun run) {
		return modeOf(run.mode(), run.difficulty());
	}

	/**
	 * Judged as before, and the run must be of the session's mode: a daily run in Daily, a practice
	 * run in its own difficulty. A Classic session is one opened before the leaderboards were split,
	 * whose run is finished as it always was.
	 */
	@Override
	public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (MODES.stream().noneMatch((spec) -> spec.id().equals(mode))) {
			return Optional.of(NO_RULES_FOR_MODE + ": " + mode);
		}
		Optional<String> problem = problemWith(sessionId, score, details, elapsed);
		if (problem.isPresent() || ModeSpec.CLASSIC.id().equals(mode)) {
			return problem;
		}
		// Found: the run was just judged against this session.
		SudokuRun run = this.store.findBySession(sessionId).orElseThrow();
		if (!modeOf(run).equals(mode)) {
			return Optional.of("the run is not of the session's mode");
		}
		return Optional.empty();
	}

	/** Every accepted Sudoku run, solved or failed, completes, as Classic runs always have. */
	@Override
	public boolean completes(String mode, Map<String, Integer> details) {
		return MODES.stream().anyMatch((spec) -> spec.id().equals(mode));
	}

	private static ModeSpec ranked(Difficulty difficulty) {
		return ranked(modeOf(Mode.PRACTICE, difficulty), difficulty.label());
	}

	private static ModeSpec ranked(String id, String name) {
		return new ModeSpec(id, name, true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, null, true);
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
