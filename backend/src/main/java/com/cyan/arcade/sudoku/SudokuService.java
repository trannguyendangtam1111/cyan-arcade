package com.cyan.arcade.sudoku;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.random.RandomGenerator;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.score.GameSessionService;
import com.cyan.arcade.score.RunSession;
import com.cyan.arcade.sudoku.SudokuRun.Mode;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuRun.Status;
import com.cyan.arcade.sudoku.SudokuRunStore.Result;
import com.cyan.arcade.sudoku.SudokuViews.DifficultyView;
import com.cyan.arcade.sudoku.SudokuViews.HintResponse;
import com.cyan.arcade.sudoku.SudokuViews.HintTaken;
import com.cyan.arcade.sudoku.SudokuViews.HintView;
import com.cyan.arcade.sudoku.SudokuViews.ModeStats;
import com.cyan.arcade.sudoku.SudokuViews.MoveRequest;
import com.cyan.arcade.sudoku.SudokuViews.ResultView;
import com.cyan.arcade.sudoku.SudokuViews.RunResponse;
import com.cyan.arcade.sudoku.SudokuViews.StatsResponse;
import com.cyan.arcade.sudoku.SudokuViews.TodayResponse;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Generator.GenerationException;
import com.cyan.arcade.sudoku.engine.Hints;
import com.cyan.arcade.sudoku.engine.Hints.Advice;
import com.cyan.arcade.sudoku.engine.Hints.HintUnavailableException;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.cyan.arcade.sudoku.engine.Scoring;
import com.cyan.arcade.sudoku.engine.Step;
import com.cyan.arcade.sudoku.engine.Streaks;
import com.cyan.arcade.sudoku.engine.SudokuGame;
import com.cyan.arcade.sudoku.engine.SudokuGame.ActionRejectedException;
import com.cyan.arcade.sudoku.engine.SudokuGame.Hint;
import com.cyan.arcade.sudoku.engine.SudokuGame.HintType;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sudoku, played on the server: the server makes the puzzle and keeps its solution, judges every
 * digit entered (a wrong one is a mistake), gives the hints, keeps the time, and records every
 * action, so the solution never reaches the browser before the run is over and every number a score
 * is made of is the server's own.
 *
 * <p>A ranked run (the daily puzzle, or a practice game) is tied to a platform game session, which
 * the browser opens as for any game and finishes with the run's score once it is over;
 * {@link SudokuRunRules} then checks that score against the run. A player has one daily run per UTC
 * day: it can be picked up again with a new session (after a reload, say) until its score is in, and
 * never after. Relaxed practice games have no session, no score and no statistics.
 */
@Service
class SudokuService {

	static final String GAME_SLUG = "sudoku";

	static final String PLAYER_ID_REQUIRED = "PLAYER_ID_REQUIRED";

	static final String WRONG_SESSION = "WRONG_SESSION";

	static final String DAILY_ALREADY_PLAYED = "DAILY_ALREADY_PLAYED";

	static final String RUN_OVER = "RUN_OVER";

	static final String CELL_LOCKED = "CELL_LOCKED";

	static final String HINT_UNAVAILABLE = "HINT_UNAVAILABLE";

	static final String RUN_NOT_RANKED = "RUN_NOT_RANKED";

	static final String PUZZLE_UNAVAILABLE = "PUZZLE_UNAVAILABLE";

	static final String RUN_TOO_LONG = "RUN_TOO_LONG";

	/** Relaxed games left alone this long are forgotten. */
	static final Duration RELAXED_KEPT_FOR = Duration.ofDays(2);

	private final SudokuRunStore store;

	private final DailyPuzzles dailyPuzzles;

	private final GameSessionService sessions;

	private final Clock clock;

	private final RandomGenerator random = new SecureRandom();

	SudokuService(SudokuRunStore store, DailyPuzzles dailyPuzzles, GameSessionService sessions, Clock clock) {
		this.store = store;
		this.dailyPuzzles = dailyPuzzles;
		this.sessions = sessions;
		this.clock = clock;
	}

	/** Today's puzzle and the rules, and the caller's runs ({@code owner} is {@code null} for an unknown guest). */
	@Transactional
	public TodayResponse today(Owner owner) {
		LocalDate today = DailySchedule.today(this.clock);
		Puzzle puzzle = this.dailyPuzzles.forDay(today);
		RunResponse daily = null;
		RunResponse practice = null;
		if (owner != null) {
			daily = this.store.findDaily(owner, today, false).map(this::view).orElse(null);
			practice = this.store.findPracticeInProgress(owner).map(this::view).orElse(null);
		}
		List<DifficultyView> difficulties = Arrays.stream(Difficulty.values())
			.map((difficulty) -> new DifficultyView(difficulty, difficulty.label(), difficulty.level(),
					difficulty.baseScore(), difficulty.parSeconds()))
			.toList();
		return new TodayResponse(DailySchedule.puzzleNumber(today), today, puzzle.difficulty(),
				DailySchedule.nextPuzzleAt(this.clock), SudokuGame.MAX_HINTS, SudokuGame.RANKED_MISTAKE_LIMIT,
				Scoring.HINT_PERCENTS, difficulties, daily, practice);
	}

	/**
	 * Starts today's puzzle with this game session, or picks the player's run of it up again with a
	 * new one, as long as its score has not been submitted.
	 */
	@Transactional
	public RunResponse startDaily(Owner owner, UUID sessionId) {
		RunSession session = ownSession(owner, sessionId);
		Optional<SudokuRun> bound = this.store.findBySession(session.id());
		if (bound.isPresent()) {
			return view(bound.get());
		}
		LocalDate today = DailySchedule.today(this.clock);
		Optional<SudokuRun> existing = this.store.findDaily(owner, today, true);
		if (existing.isPresent()) {
			return view(pickUp(existing.get(), session.id()));
		}
		Puzzle puzzle = this.dailyPuzzles.forDay(today);
		SudokuRun run = newRun(owner, Mode.DAILY, true, puzzle, session.id(), today, DailySchedule.puzzleNumber(today));
		if (this.store.insert(run)) {
			return view(run);
		}
		// Another request started it at the same moment.
		return this.store.findDaily(owner, today, true)
			.map((started) -> view(pickUp(started, session.id())))
			.orElseThrow(() -> new ConflictException(ErrorCodes.CONFLICT, "Today's puzzle could not be started"));
	}

	/**
	 * A new practice game of a difficulty: ranked with a session, relaxed without. Any practice game
	 * the player had going is abandoned.
	 */
	@Transactional
	public RunResponse startPractice(Owner owner, Difficulty difficulty, UUID sessionId) {
		Instant now = this.clock.instant();
		RunSession session = (sessionId != null) ? ownSession(owner, sessionId) : null;
		if (session != null) {
			Optional<SudokuRun> bound = this.store.findBySession(session.id());
			if (bound.isPresent()) {
				return view(bound.get());
			}
		}
		this.store.deleteRelaxedStartedBefore(now.minus(RELAXED_KEPT_FOR));
		this.store.abandonPractice(owner, now);
		Puzzle puzzle;
		try {
			puzzle = Generator.generate(difficulty, this.random.nextLong());
		}
		catch (GenerationException ex) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, PUZZLE_UNAVAILABLE,
					"No puzzle could be made just now. Try again.");
		}
		SudokuRun run = newRun(owner, Mode.PRACTICE, session != null, puzzle, (session != null) ? session.id() : null,
				null, null);
		this.store.insert(run);
		return view(run);
	}

	/** Ties a ranked run to a new session: after a reload, to finish it and submit its score. */
	@Transactional
	public RunResponse bindSession(Owner owner, UUID runId, UUID sessionId) {
		SudokuRun run = ownedForUpdate(owner, runId);
		if (!run.ranked()) {
			throw new ConflictException(RUN_NOT_RANKED, "A relaxed game is not scored");
		}
		RunSession session = ownSession(owner, sessionId);
		Optional<SudokuRun> bound = this.store.findBySession(session.id());
		if (bound.isPresent() && !bound.get().id().equals(run.id())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, WRONG_SESSION, "That session already has a game");
		}
		return view(pickUp(run, session.id()));
	}

	private SudokuRun pickUp(SudokuRun run, UUID sessionId) {
		if (sessionId.equals(run.sessionId())) {
			return run;
		}
		if (isScored(run)) {
			throw (run.isDaily())
					? new ConflictException(DAILY_ALREADY_PLAYED,
							"You have played today's puzzle. A new one comes at midnight UTC.")
					: new ConflictException(RUN_OVER, "This game has been scored");
		}
		if (run.status() == Status.ABANDONED) {
			throw new ConflictException(RUN_OVER, "This game was left for another");
		}
		this.store.bindSession(run.id(), sessionId);
		return run.withSession(sessionId);
	}

	/** Enters digits (or clears cells with 0), in order. One refused move refuses them all. */
	@Transactional
	public RunResponse move(Owner owner, UUID runId, List<MoveRequest> moves) {
		SudokuRun run = ownedForUpdate(owner, runId);
		requirePlaying(run);
		Instant now = this.clock.instant();
		SudokuGame game = run.game();
		try {
			for (MoveRequest move : moves) {
				if (game.status().isOver()) {
					throw new ConflictException(RUN_OVER, "This game is over");
				}
				game = game.place(move.cell(), move.digit());
			}
		}
		catch (ActionRejectedException ex) {
			throw rejected(ex);
		}
		return view(save(run, game, now));
	}

	/** Takes a hint: three per game, each lowering the score. */
	@Transactional
	public HintResponse hint(Owner owner, UUID runId, HintType type, Integer cell) {
		SudokuRun run = ownedForUpdate(owner, runId);
		requirePlaying(run);
		Instant now = this.clock.instant();
		SudokuGame game = run.game();
		Advice advice;
		try {
			advice = Hints.advise(game, type, cell);
			game = game.hint(type, advice.cell());
		}
		catch (HintUnavailableException ex) {
			throw new ConflictException(HINT_UNAVAILABLE, switch (ex.reason()) {
				case GAME_OVER -> "This game is over";
				case NO_HINTS_LEFT -> "No hints left in this game";
				case CELL_LOCKED -> "That cell is a clue";
				case CELL_ALREADY_RIGHT -> "That cell is already right";
				case NO_LOGICAL_STEP -> "No logical step found from here. Try revealing a cell.";
			});
		}
		catch (ActionRejectedException ex) {
			throw rejected(ex);
		}
		SudokuRun saved = save(run, game, now);
		return new HintResponse(view(saved), hintView(advice));
	}

	/** Stops the run's clock. The board is hidden while paused; the next move starts the clock again. */
	@Transactional
	public RunResponse pause(Owner owner, UUID runId) {
		SudokuRun run = ownedForUpdate(owner, runId);
		if (run.status().isOver() || run.isPaused()) {
			return view(run);
		}
		SudokuRun paused = run.withPause(this.clock.instant(), run.pausedMs());
		this.store.saveProgress(paused);
		return view(paused);
	}

	@Transactional
	public RunResponse resume(Owner owner, UUID runId) {
		SudokuRun run = ownedForUpdate(owner, runId);
		if (run.status().isOver() || !run.isPaused()) {
			return view(run);
		}
		SudokuRun resumed = resumed(run, this.clock.instant());
		this.store.saveProgress(resumed);
		return view(resumed);
	}

	/** The caller's ranked games ({@code owner} is {@code null} for an unknown guest: nothing yet). */
	@Transactional(readOnly = true)
	public StatsResponse stats(Owner owner) {
		List<Result> results = (owner != null) ? this.store.results(owner) : List.of();
		Map<LocalDate, Boolean> byDay = new HashMap<>();
		LocalDate lastDaily = null;
		for (Result result : results) {
			if (result.mode() == Mode.DAILY && result.puzzleDate() != null && result.status().isFinished()) {
				byDay.put(result.puzzleDate(), result.status() == Status.SOLVED);
				if (lastDaily == null || result.puzzleDate().isAfter(lastDaily)) {
					lastDaily = result.puzzleDate();
				}
			}
		}
		LocalDate today = DailySchedule.today(this.clock);
		return new StatsResponse(modeStats(results, Mode.DAILY), modeStats(results, Mode.PRACTICE),
				Streaks.current(byDay, today), Streaks.best(byDay), lastDaily);
	}

	private static ModeStats modeStats(List<Result> all, Mode mode) {
		List<Result> results = all.stream().filter((result) -> result.mode() == mode).toList();
		List<Result> solved = results.stream().filter((result) -> result.status() == Status.SOLVED).toList();
		Map<Difficulty, Integer> best = new EnumMap<>(Difficulty.class);
		for (Difficulty difficulty : Difficulty.values()) {
			best.put(difficulty, null);
		}
		for (Result result : solved) {
			int seconds = (int) (result.activeMs() / 1000);
			best.merge(result.difficulty(), seconds, Math::min);
		}
		int played = results.size();
		Integer averageSeconds = solved.isEmpty() ? null
				: (int) Math.round(solved.stream().mapToLong(Result::activeMs).average().orElse(0) / 1000);
		return new ModeStats(played, solved.size(), (played == 0) ? 0 : Math.round(100f * solved.size() / played),
				averageSeconds, average(solved.stream().mapToInt(Result::mistakes).boxed().toList()),
				average(solved.stream().mapToInt(Result::hints).boxed().toList()), best);
	}

	private static Double average(List<Integer> values) {
		if (values.isEmpty()) {
			return null;
		}
		return Math.round(10.0 * values.stream().mapToInt(Integer::intValue).sum() / values.size()) / 10.0;
	}

	// --- Helpers -----------------------------------------------------------------------------------

	private SudokuRun newRun(Owner owner, Mode mode, boolean ranked, Puzzle puzzle, UUID sessionId, LocalDate date,
			Integer number) {
		return new SudokuRun(UUID.randomUUID(), mode, ranked, puzzle.difficulty(), date, number, puzzle.seed(),
				puzzle.givens(), puzzle.solution(), List.of(), Status.PLAYING, 0, 0, 0, sessionId, owner.userId(),
				owner.playerId(), this.clock.instant(), null, null, 0);
	}

	/** Saves the run after an action: the clock runs again, and an ending stops it for good. */
	private SudokuRun save(SudokuRun run, SudokuGame game, Instant now) {
		SudokuRun running = resumed(run, now);
		Status status = switch (game.status()) {
			case PLAYING -> Status.PLAYING;
			case SOLVED -> Status.SOLVED;
			case FAILED -> Status.FAILED;
		};
		Instant finishedAt = status.isOver() ? now : null;
		int streak = 0;
		if (run.isDaily() && run.ranked() && status == Status.SOLVED) {
			Map<LocalDate, Boolean> results = dailyResults(run);
			results.put(run.puzzleDate(), true);
			streak = Streaks.endingOn(results, run.puzzleDate());
		}
		SudokuRun saved = running.with(game, status, streak, finishedAt, null, running.pausedMs());
		this.store.saveProgress(saved);
		return saved;
	}

	private static SudokuRun resumed(SudokuRun run, Instant now) {
		if (!run.isPaused()) {
			return run;
		}
		long paused = Math.max(0, Duration.between(run.pausedAt(), now).toMillis());
		return run.withPause(null, run.pausedMs() + paused);
	}

	private Map<LocalDate, Boolean> dailyResults(SudokuRun run) {
		Owner owner = new Owner(run.userId(), (run.userId() == null) ? run.playerId() : null);
		Map<LocalDate, Boolean> results = new HashMap<>();
		this.store.results(owner)
			.stream()
			.filter((result) -> result.mode() == Mode.DAILY && result.status().isFinished())
			.forEach((result) -> results.put(result.puzzleDate(), result.status() == Status.SOLVED));
		return results;
	}

	private RunSession ownSession(Owner owner, UUID sessionId) {
		return this.sessions.find(sessionId)
			.filter((candidate) -> GAME_SLUG.equals(candidate.gameSlug()) && !candidate.finished()
					&& candidate.belongsTo(owner.userId(), owner.playerId()))
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, WRONG_SESSION,
					"Start an unfinished Sudoku game session of your own first"));
	}

	private SudokuRun ownedForUpdate(Owner owner, UUID runId) {
		// Someone else's run is as good as missing: a run id alone tells nothing.
		return this.store.findForUpdate(runId)
			.filter((run) -> run.belongsTo(owner))
			.orElseThrow(() -> new NotFoundException("Sudoku run", runId));
	}

	private static void requirePlaying(SudokuRun run) {
		if (run.status().isOver()) {
			throw new ConflictException(RUN_OVER, "This game is over");
		}
	}

	private static ApiException rejected(ActionRejectedException ex) {
		return switch (ex.reason()) {
			case GAME_OVER -> new ConflictException(RUN_OVER, "This game is over");
			case LOCKED_CELL -> new ConflictException(CELL_LOCKED, "Clues and revealed cells cannot be changed");
			case NO_HINTS_LEFT -> new ConflictException(HINT_UNAVAILABLE, "No hints left in this game");
			case CELL_ALREADY_RIGHT -> new ConflictException(HINT_UNAVAILABLE, "That cell is already right");
			case TOO_MANY_ACTIONS -> new ConflictException(RUN_TOO_LONG, "This game has had too many moves");
			case OUT_OF_RANGE -> new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
					"A move is a cell 0-80 and a digit 0-9");
		};
	}

	private boolean isScored(SudokuRun run) {
		return run.sessionId() != null && this.sessions.find(run.sessionId()).map(RunSession::finished).orElse(false);
	}

	RunResponse view(SudokuRun run) {
		SudokuGame game = run.game();
		Instant now = this.clock.instant();
		List<HintTaken> hints = game.actions()
			.stream()
			.filter(Hint.class::isInstance)
			.map(Hint.class::cast)
			.map((hint) -> new HintTaken(hint.type(), hint.cell()))
			.toList();
		ResultView result = null;
		if (run.status().isFinished() && run.ranked()) {
			Scoring.Summary summary = run.summary();
			result = new ResultView(Scoring.score(summary), summary.seconds(),
					Scoring.timePercent(run.difficulty(), summary.seconds()), Scoring.mistakePercent(summary.mistakes()),
					Scoring.hintPercent(summary.hints()), Scoring.details(summary));
		}
		return new RunResponse(run.id(), run.mode().name(), run.ranked(), run.difficulty(), run.puzzleNumber(),
				run.puzzleDate(), run.status().name(), run.givens(),
				Grid.format(game.values()), new ArrayList<>(game.revealedCells()),
				new ArrayList<>(game.wrongCells()), game.mistakes(), game.rule().name(), game.mistakeLimit(),
				game.hints(), game.hintsLeft(), hints, run.played(now).toMillis(), run.isPaused(),
				run.status().isOver() ? run.solution() : null, result, run.ranked() && isScored(run));
	}

	private static HintView hintView(Advice advice) {
		List<Integer> highlight = new ArrayList<>();
		highlight.add(advice.cell());
		List<String> eliminations = new ArrayList<>();
		for (Step step : advice.steps()) {
			step.pattern().stream().filter((cell) -> !highlight.contains(cell)).forEach(highlight::add);
			eliminations.addAll(step.eliminations()
				.stream()
				.map((elimination) -> elimination.cell() + ":" + elimination.digit())
				.collect(Collectors.toList()));
		}
		return new HintView(advice.type(), advice.cell(), advice.digit(), advice.technique(), advice.explanation(),
				highlight, eliminations);
	}

}
