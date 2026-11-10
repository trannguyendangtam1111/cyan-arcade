package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Tetris ({@code frontend/src/games/tetris/engine}): a 10 × 20 board. Clearing 1 to 4 lines at
 * once scores 100, 300, 500 or 800 times the level, and the level is one more than every ten lines
 * cleared. Dropping a piece by hand scores 1 per row (soft) or 2 per row (hard), and a piece falls
 * at most the height of the board. From that:
 *
 * <ul>
 * <li>Every piece brings 4 cells and every cleared line takes 10, and what is left fits on the
 * board: {@code 10 × lines ≤ 4 × pieces ≤ 10 × lines + 200}.</li>
 * <li>The lines scored at least 100 a line (all singles) and at most 200 a line (all fours) times
 * the level they were cleared at; the drops at most {@value #MOST_DROP_POINTS} a piece.</li>
 * </ul>
 *
 * Pieces are placed by a person: at most {@value #PIECES_PER_SECOND} a second, beyond the fastest
 * players.
 *
 * <p><b>Ultra</b> ({@value #ULTRA}) is the same game against a clock of game time: two minutes,
 * kept by the engine in fixed {@value #STEP_MS} ms steps that never run faster than real time, ranked
 * by score. A run ends when the time is up or earlier, when the player tops out; it reports its game
 * time ({@code gameMs}) and whether the time ran out ({@code timeUp}, 0 or 1). It is judged by its own
 * rules below, never by Classic's alone, and only a run whose time ran out completed the mode.
 *
 * <p><b>Sprint</b> ({@value #SPRINT}) is a race on the same clock: clear {@value #SPRINT_LINES} lines in
 * as little game time as possible, ranked lowest first. The engine ends the run the moment a clear
 * reaches the goal, and its score is the game time it took ({@code gameMs}, in whole steps). A run that
 * tops out, or reaches the limit of {@value #SPRINT_LIMIT_MS} ms, before the goal is a failed attempt:
 * the client does not submit it and these rules refuse it, so only finished sprints are ever ranked or
 * rewarded.
 *
 * <p><b>Challenge</b> is six fixed stages on the same clock ({@link #CHALLENGE_STAGES}, mirrored from
 * {@code frontend/src/games/tetris/stages.ts}), each a mode of its own ({@code challenge-1} to
 * {@code challenge-6}): rows of garbage (full but for one gap) at the start, perhaps a new row rising
 * from below after every so many pieces, and an objective, a line goal or clearing every garbage row
 * ("dig"). A stage is cleared the moment its objective is met, and its score is the game time it took;
 * a top-out or a timeout fails it, and these rules refuse it. Challenge modes are unranked (no board)
 * and complete nothing, so a clear is kept in the player's history and earns no XP and no coins.
 */
@Component
class TetrisRunRules implements RunRules {

	static final int WIDTH = 10;

	static final int CELLS = WIDTH * 20;

	static final int LINES_PER_LEVEL = 10;

	/** Two points a row for a hard drop, over the board's height and the row a piece may start above it. */
	static final int MOST_DROP_POINTS = 2 * 22;

	static final int PIECES_PER_SECOND = 10;

	/** The two-minute score attack. */
	static final String ULTRA = "ultra";

	static final ModeSpec ULTRA_MODE = new ModeSpec(ULTRA, "Ultra", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS,
			null);

	/** An Ultra run's game time. */
	static final int ULTRA_LIMIT_MS = 120_000;

	/** The engine's clock step: game time only ever moves by whole steps. */
	static final int STEP_MS = 40;

	/**
	 * How much longer than its game time a ranked timed run may take in real time, all told: pauses,
	 * a hidden tab, frames the browser dropped. The player is shown what is left of it while paused.
	 */
	static final Duration PAUSE_ALLOWANCE = Duration.ofSeconds(60);

	static final Set<String> ULTRA_DETAILS = Set.of("lines", "level", "pieces", "gameMs", "timeUp");

	/** The 40-line race. */
	static final String SPRINT = "sprint";

	/** The lines a sprint must clear. */
	static final int SPRINT_LINES = 40;

	/**
	 * A sprint's game-time limit: five minutes, about twice what a casual player needs. The run that
	 * reaches it has timed out, so a finished sprint always took less.
	 */
	static final int SPRINT_LIMIT_MS = 300_000;

	/** Ranked by game time, lowest first; no submitted time may exceed the limit. */
	static final ModeSpec SPRINT_MODE = new ModeSpec(SPRINT, "Sprint", true, ModeSpec.Order.ASC,
			ModeSpec.Unit.MILLISECONDS, SPRINT_LIMIT_MS);

	/** The clear that reaches the goal takes at most four lines: never more than this many in all. */
	static final int MOST_SPRINT_LINES = SPRINT_LINES - 1 + 4;

	static final Set<String> SPRINT_DETAILS = Set.of("lines", "level", "pieces", "gameMs");

	/**
	 * One Challenge stage: what the server needs to judge a clear of it. Its level (gravity) is the
	 * client's alone: the score is a time, so the level changes nothing these rules check.
	 * @param garbageRows rows of garbage it starts with
	 * @param riseEvery a garbage row rises after every this many pieces, or 0 for none
	 * @param lineGoal the lines that clear it, or 0 for a dig stage (cleared with its last garbage row)
	 * @param limitMs its game-time limit: the run that reaches it has timed out
	 */
	record Stage(int id, String name, int garbageRows, int riseEvery, int lineGoal, int limitMs) {

		/** The mode the stage is played under. */
		String mode() {
			return "challenge-" + this.id;
		}

		boolean dig() {
			return this.lineGoal == 0;
		}

		/** Unranked: no board. Its score is a time, and no submitted time may exceed the limit. */
		ModeSpec spec() {
			return new ModeSpec(mode(), "Challenge " + this.id + ": " + this.name, false, ModeSpec.Order.ASC,
					ModeSpec.Unit.MILLISECONDS, this.limitMs);
		}

		/**
		 * The garbage rows a stage cleared with this many pieces had put on the board: a row rises after
		 * every {@code riseEvery}th piece, but not after the piece that cleared the stage (the engine
		 * stops there).
		 */
		int garbageAddedBy(int pieces) {
			return this.garbageRows + ((this.riseEvery > 0) ? (pieces - 1) / this.riseEvery : 0);
		}

	}

	/** The six stages, as {@code frontend/src/games/tetris/stages.ts} defines them. */
	static final List<Stage> CHALLENGE_STAGES = List.of(new Stage(1, "Clean-up", 4, 0, 0, 120_000),
			new Stage(2, "Ten on top", 6, 0, 10, 120_000), new Stage(3, "Deep dig", 10, 0, 0, 180_000),
			new Stage(4, "Rising tide", 4, 10, 15, 180_000), new Stage(5, "Pressure", 6, 7, 20, 180_000),
			new Stage(6, "Last stand", 8, 8, 0, 240_000));

	private static final Map<String, Stage> STAGES_BY_MODE = CHALLENGE_STAGES.stream()
		.collect(Collectors.toUnmodifiableMap(Stage::mode, Function.identity()));

	/** A stage clear's details: its game time, pieces, lines and the garbage rows among those lines. */
	static final Set<String> CHALLENGE_DETAILS = Set.of("lines", "pieces", "gameMs", "garbage");

	/** A cleared line of pieces held 10 of their cells; a cleared garbage row just 1, its gap. */
	private static final int CELLS_IN_A_GARBAGE_ROW_CLEAR = 1;

	@Override
	public String gameSlug() {
		return "tetris";
	}

	@Override
	public List<ModeSpec> modes() {
		return Stream
			.concat(Stream.of(ModeSpec.CLASSIC, ULTRA_MODE, SPRINT_MODE), CHALLENGE_STAGES.stream().map(Stage::spec))
			.toList();
	}

	@Override
	public Set<String> details() {
		return Set.of("lines", "level", "pieces");
	}

	@Override
	public Set<String> details(String mode) {
		if (ULTRA.equals(mode)) {
			return ULTRA_DETAILS;
		}
		if (STAGES_BY_MODE.containsKey(mode)) {
			return CHALLENGE_DETAILS;
		}
		return SPRINT.equals(mode) ? SPRINT_DETAILS : details();
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int lines = details.get("lines");
		int pieces = details.get("pieces");
		Optional<String> layout = layoutProblemWith(lines, details.get("level"), pieces);
		if (layout.isPresent()) {
			return layout;
		}
		long lineScore = linePointsAtLeast(lines);
		if (score < lineScore || score > 2 * lineScore + (long) MOST_DROP_POINTS * pieces) {
			return Optional.of("details do not match the score");
		}
		if (pieces > RunRules.mostActionsIn(elapsed, 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the time allows");
		}
		return Optional.empty();
	}

	/**
	 * Classic by Classic's rules, Ultra, Sprint and each Challenge stage by their own; any other mode is
	 * refused, never judged as Classic.
	 */
	@Override
	public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (ULTRA.equals(mode)) {
			return ultraProblemWith(score, details, elapsed);
		}
		if (SPRINT.equals(mode)) {
			return sprintProblemWith(score, details, elapsed);
		}
		Stage stage = STAGES_BY_MODE.get(mode);
		if (stage != null) {
			return challengeProblemWith(stage, score, details, elapsed);
		}
		return RunRules.super.problemWith(mode, sessionId, score, details, elapsed);
	}

	/**
	 * Only an Ultra run whose time ran out reached the mode's end; an early top-out did not. A sprint
	 * completes by clearing its lines, the only sprint these rules accept. A Challenge stage never does:
	 * a clear is recorded but earns no completion reward (v1).
	 */
	@Override
	public boolean completes(String mode, Map<String, Integer> details) {
		if (ULTRA.equals(mode)) {
			return details.get("timeUp") == 1;
		}
		if (SPRINT.equals(mode)) {
			return details.get("lines") >= SPRINT_LINES;
		}
		if (STAGES_BY_MODE.containsKey(mode)) {
			return false;
		}
		return RunRules.super.completes(mode, details);
	}

	private Optional<String> ultraProblemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int gameMs = details.get("gameMs");
		int timeUp = details.get("timeUp");
		int pieces = details.get("pieces");
		Optional<String> clock = clockProblemWith(gameMs, ULTRA_LIMIT_MS, elapsed);
		if (clock.isPresent()) {
			return clock;
		}
		if (timeUp != 0 && timeUp != 1) {
			return Optional.of("timeUp is neither 0 nor 1");
		}
		// The engine ends the run at exactly the limit and says so; a top-out ends it before.
		if ((timeUp == 1) != (gameMs == ULTRA_LIMIT_MS)) {
			return Optional.of("timeUp does not match the game time");
		}
		// The Classic consistency checks: level, pieces against lines, score against both, pace in real time.
		Optional<String> classic = problemWith(score, details, elapsed);
		if (classic.isPresent()) {
			return classic;
		}
		// Pace in game time, which is what the pieces were placed in.
		if (pieces > RunRules.mostActionsIn(Duration.ofMillis(gameMs), 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the game time allows");
		}
		// No lower bound on pieces: a rotation can kick a piece up a row, so a player turning it
		// keeps it in play as long as they like, and a real run may place none in two minutes.
		return Optional.empty();
	}

	/**
	 * A finished sprint: its score is its game time, below the limit, and the clear that ended it
	 * reached the goal. A top-out or a timeout before the goal is refused, never ranked.
	 */
	private Optional<String> sprintProblemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int gameMs = details.get("gameMs");
		int lines = details.get("lines");
		int pieces = details.get("pieces");
		// The run that reaches the limit has timed out: a finished sprint is at least a step short of it.
		Optional<String> clock = clockProblemWith(gameMs, SPRINT_LIMIT_MS - STEP_MS, elapsed);
		if (clock.isPresent()) {
			return clock;
		}
		// What is ranked is the game time, exactly as the run reports it.
		if (score != gameMs) {
			return Optional.of("score is not the game time");
		}
		if (lines < SPRINT_LINES) {
			return Optional.of("fewer lines than the sprint's goal");
		}
		// The engine stops at the clear that reaches the goal.
		if (lines > MOST_SPRINT_LINES) {
			return Optional.of("more lines than the clear that reached the goal");
		}
		Optional<String> layout = layoutProblemWith(lines, details.get("level"), pieces);
		if (layout.isPresent()) {
			return layout;
		}
		// Paced in real time and in game time; with at least 100 pieces, no sprint takes under 8 s.
		if (pieces > RunRules.mostActionsIn(elapsed, 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the time allows");
		}
		if (pieces > RunRules.mostActionsIn(Duration.ofMillis(gameMs), 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the game time allows");
		}
		return Optional.empty();
	}

	/**
	 * A cleared stage: its score is its game time, below the stage's limit, and its objective was met at
	 * the end. A top-out or a timeout before the objective is refused.
	 */
	private Optional<String> challengeProblemWith(Stage stage, int score, Map<String, Integer> details,
			Duration elapsed) {
		int gameMs = details.get("gameMs");
		int lines = details.get("lines");
		int pieces = details.get("pieces");
		int garbage = details.get("garbage");
		// The run that reaches the limit has timed out: a clear is at least a step short of it.
		Optional<String> clock = clockProblemWith(gameMs, stage.limitMs() - STEP_MS, elapsed);
		if (clock.isPresent()) {
			return clock;
		}
		if (score != gameMs) {
			return Optional.of("score is not the game time");
		}
		// Every stage needs pieces to clear anything.
		if (pieces < 1) {
			return Optional.of("no pieces");
		}
		int added = stage.garbageAddedBy(pieces);
		if (garbage < 0 || garbage > added) {
			return Optional.of("more garbage cleared than the stage put on the board");
		}
		// A garbage row is cleared as a line, like any other.
		if (garbage > lines) {
			return Optional.of("more garbage rows than lines cleared");
		}
		if (stage.dig()) {
			if (garbage != added) {
				return Optional.of("garbage left: the stage was not cleared");
			}
		}
		else if (lines < stage.lineGoal()) {
			return Optional.of("fewer lines than the stage's goal");
		}
		// The engine stops at the clear that reaches the goal.
		else if (lines > stage.lineGoal() + 3) {
			return Optional.of("more lines than the clear that reached the goal");
		}
		// Every piece brings 4 cells; a cleared line of pieces took 10 of them, a garbage row 1 (its
		// gap); what is left fits on the board.
		long used = (long) WIDTH * (lines - garbage) + (long) CELLS_IN_A_GARBAGE_ROW_CLEAR * garbage;
		long cells = 4L * pieces;
		if (cells < used || cells > used + CELLS) {
			return Optional.of("pieces do not match the lines");
		}
		if (pieces > RunRules.mostActionsIn(elapsed, 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the time allows");
		}
		if (pieces > RunRules.mostActionsIn(Duration.ofMillis(gameMs), 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the game time allows");
		}
		return Optional.empty();
	}

	/**
	 * A timed run's game time against the server's clock: above 0 and at most {@code mostGameMs}, in
	 * whole steps, never more than the session lasted, and short of it by no more than the pause
	 * allowance.
	 */
	private static Optional<String> clockProblemWith(int gameMs, int mostGameMs, Duration elapsed) {
		if (gameMs <= 0 || gameMs > mostGameMs) {
			return Optional.of("game time outside the mode's limit");
		}
		if (gameMs % STEP_MS != 0) {
			return Optional.of("game time not in whole steps");
		}
		// Game time never runs faster than real time.
		if (Duration.ofMillis(gameMs).compareTo(elapsed.plus(LATENCY_ALLOWANCE)) > 0) {
			return Optional.of("more game time than the session lasted");
		}
		// Real time beyond the game time is the pause allowance, and no more.
		if (elapsed.compareTo(Duration.ofMillis(gameMs).plus(PAUSE_ALLOWANCE).plus(LATENCY_ALLOWANCE)) > 0) {
			return Optional.of("paused for longer than the mode allows");
		}
		return Optional.empty();
	}

	/**
	 * What the board allows: the level follows the lines, and every piece brings 4 cells while every
	 * cleared line takes 10, with what is left fitting on the board.
	 */
	private static Optional<String> layoutProblemWith(int lines, int level, int pieces) {
		if (level != lines / LINES_PER_LEVEL + 1) {
			return Optional.of("details do not match the score");
		}
		long cells = 4L * pieces;
		if (cells < (long) WIDTH * lines || cells > (long) WIDTH * lines + CELLS) {
			return Optional.of("pieces do not match the lines");
		}
		return Optional.empty();
	}

	/** What clearing these lines one at a time scores: 100 a line, times the level of each. */
	static long linePointsAtLeast(int lines) {
		long points = 0;
		for (int line = 0; line < lines; line++) {
			points += 100L * (line / LINES_PER_LEVEL + 1);
		}
		return points;
	}

}
