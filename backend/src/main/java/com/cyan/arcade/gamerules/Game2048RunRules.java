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
 * 2048 ({@code frontend/src/games/2048/engine}). The board starts with two tiles of 2 or 4, and
 * every move that changes it adds one more. Merging two tiles scores the new tile's value. From
 * that:
 *
 * <ul>
 * <li>Tiles only ever join, so the board's total is at most {@code 8 + 4 × moves}, and no tile is
 * bigger than that total.</li>
 * <li>A tile of 2^k scored at most (k − 1) × 2^k to build (every piece a 2) and at least
 * (k − 2) × 2^k (every piece a 4). So the score is at least that for the highest tile, and at most
 * the board's total times (k − 1) for the highest tile.</li>
 * <li>Every merge scores a power of two of at least 4, so the score is a multiple of 4.</li>
 * </ul>
 *
 * The moves themselves are made by a person: at most {@value #MOVES_PER_SECOND} a second, far
 * faster than anyone plays for long.
 *
 * <p><b>Moves Limit</b> ({@code moves}) is the same game cut off after {@value #MOVE_LIMIT} valid moves
 * (a move that changes nothing is not one): the engine ends the run right after the last of them, or
 * earlier when no move is left. Its runs are judged exactly as Classic's, within the limit, and
 * ranked on a board of their own, highest first. A run that ended early was stuck on a full board,
 * which takes at least {@value #FEWEST_MOVES_TO_FILL} moves. Only a run that used every move
 * completes, earning what finishing a game earns; a stuck run is ranked but earns no completion
 * reward. Achievements, challenges and best-score bonuses stay Classic's (the platform's rule for
 * every mode).
 *
 * <p><b>Time Attack</b> ({@value #TIME_ATTACK_MODE}) is the same game against a clock of game time:
 * {@value #TIME_LIMIT_MS} ms, kept by the engine in fixed {@value #STEP_MS} ms steps that never run
 * faster than real time. The clock starts on the first valid move and runs while the player thinks;
 * pausing stops it (and hides the board). A run ends when the time is up or earlier, when no move is
 * left; it reports its game time ({@code gameMs}) and whether the time ran out ({@code timeUp}, 0 or 1).
 * It is judged by Classic's checks plus its own: the game time against the session's real time, which
 * may exceed it by the {@link #PAUSE_ALLOWANCE} and no more, and a pace of at most
 * {@value #TIME_ATTACK_MOVES_PER_SECOND} moves a second of game time. It is ranked on a board of its
 * own, highest first, and only a run whose time ran out completes it.
 *
 * <p><b>Puzzle</b> is six fixed stages ({@link #PUZZLE_STAGES}, mirrored from
 * {@code frontend/src/games/2048/engine/game2048Puzzles.ts}), each a mode of its own ({@code puzzle-1}
 * to {@code puzzle-6}): a starting board, a seed, a target tile and a budget of valid moves. The engine
 * ends a stage the moment its target is made, the last allowed move included, and spawns nothing after
 * that move; using every move short of it, or getting stuck, fails it, and only a clear is reported. The
 * server does not replay the board (its seed and the moves are the client's alone), so it judges a clear
 * by what any play from that start must satisfy: see {@link #puzzleProblemWith}. Puzzle modes are unranked
 * (no board) and complete nothing, so a clear is kept in the player's history and earns no XP and no
 * coins.
 */
@Component
class Game2048RunRules implements RunRules {

	static final int MOVES_PER_SECOND = 25;

	/** A 4 × 4 board cannot hold a tile above 2^17. */
	static final int LARGEST_TILE = 1 << 17;

	/** The Moves Limit mode's id, as the frontend's {@code modes.ts} names it. */
	static final String MOVES_MODE = "moves";

	/** The valid moves a Moves Limit run has, as {@code MOVES_LIMIT} in the frontend's engine. */
	static final int MOVE_LIMIT = 300;

	/**
	 * The fewest moves a stuck board can follow: it is full (16 tiles), and the board starts with two
	 * tiles and gains at most one per move.
	 */
	static final int FEWEST_MOVES_TO_FILL = 16 - 2;

	/** Moves Limit: ranked by points, highest first, up to the most {@value #MOVE_LIMIT} moves can score. */
	static final ModeSpec MOVES = new ModeSpec(MOVES_MODE, "Moves Limit", true, ModeSpec.Order.DESC,
			ModeSpec.Unit.POINTS, mostPointsIn(MOVE_LIMIT));

	/** The Time Attack mode's id, as the frontend's {@code modes.ts} names it. */
	static final String TIME_ATTACK_MODE = "time-attack";

	/** A Time Attack run's game time, as {@code TIME_ATTACK_MS} in the frontend's engine. */
	static final int TIME_LIMIT_MS = 120_000;

	/** The engine's clock step ({@code CLOCK_STEP_MS}): game time only ever moves by whole steps. */
	static final int STEP_MS = 10;

	/**
	 * How much longer than its game time a Time Attack run may take in real time, all told: pauses, a
	 * hidden tab, frames the browser dropped, and the moment before the clock starts while the session
	 * opens. On top of it, the platform's {@link RunRules#LATENCY_ALLOWANCE} for the requests.
	 */
	static final Duration PAUSE_ALLOWANCE = Duration.ofSeconds(60);

	/** The fastest a Time Attack run is played, in moves a second of game time. */
	static final int TIME_ATTACK_MOVES_PER_SECOND = 15;

	/** The details a Time Attack run reports: Classic's, its game time and whether the time ran out. */
	static final Set<String> TIME_ATTACK_DETAILS = Set.of("highestTile", "moves", "gameMs", "timeUp");

	/**
	 * Time Attack: ranked by points, highest first, up to the most the fastest pace can score in the
	 * whole game time.
	 */
	static final ModeSpec TIME_ATTACK = new ModeSpec(TIME_ATTACK_MODE, "Time Attack", true, ModeSpec.Order.DESC,
			ModeSpec.Unit.POINTS, mostPointsIn(mostMovesIn(TIME_LIMIT_MS)));

	/**
	 * One Puzzle stage: what the server needs to judge a clear of it. Its seed is the client's alone: it
	 * decides where the tiles spawn, which nothing here can check.
	 * @param board the starting board, row by row, 0 for an empty cell
	 * @param target the tile that clears the stage, a power of two above every tile on the board
	 * @param moveLimit the valid moves a clear may take at most
	 */
	record PuzzleStage(int id, String name, List<Integer> board, int target, int moveLimit) {

		PuzzleStage {
			board = List.copyOf(board);
			if (board.size() != 16 || Integer.bitCount(target) != 1 || moveLimit < 1
					|| board.stream().anyMatch((tile) -> tile != 0 && (tile < 2 || Integer.bitCount(tile) != 1))
					|| board.stream().anyMatch((tile) -> tile >= target)) {
				throw new IllegalArgumentException("not a Puzzle stage: " + id);
			}
		}

		/** The mode the stage is played under. */
		String mode() {
			return "puzzle-" + this.id;
		}

		/** The sum of the starting board's tiles. */
		int boardTotal() {
			return this.board.stream().mapToInt(Integer::intValue).sum();
		}

		/** The starting board's {@link #potential}. */
		long startPotential() {
			return this.board.stream().mapToLong(Game2048RunRules::potential).sum();
		}

		/** The target's power of two. */
		int targetPower() {
			return Integer.numberOfTrailingZeros(this.target);
		}

		/**
		 * The highest score a clear in this many moves can have: every spawn a 4 (which raises the total
		 * most) and every tile at the end as large as the target, less what the start already holds.
		 */
		long mostPoints(int moves) {
			long spawns = moves - 1L;
			long finalTotal = boardTotal() + 4 * spawns;
			return (targetPower() - 1) * finalTotal - startPotential() - 4 * spawns;
		}

		/**
		 * The lowest score a clear in this many moves can have: the target built, every spawn a 4 (whose
		 * own worth was never scored), and at least the merge that made the target.
		 */
		long fewestPoints(int moves) {
			long spawns = moves - 1L;
			long built = (long) this.target * (targetPower() - 1) - startPotential() - 4 * spawns;
			return Math.max(this.target, built);
		}

		/** Spawns add at most 4 each, so a target above the board's total needs that many spawns first. */
		int fewestMoves() {
			int missing = this.target - boardTotal();
			return 1 + Math.max(0, (missing + 3) / 4);
		}

		/** Unranked: no board. Its score is points, at most what its whole budget can score. */
		ModeSpec spec() {
			return new ModeSpec(mode(), "Puzzle " + this.id + ": " + this.name, false, ModeSpec.Order.DESC,
					ModeSpec.Unit.POINTS, (int) mostPoints(this.moveLimit));
		}

	}

	/** The six stages, as {@code frontend/src/games/2048/engine/game2048Puzzles.ts} defines them. */
	static final List<PuzzleStage> PUZZLE_STAGES = List.of(
			new PuzzleStage(1, "First Steps", List.of(0, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 0, 32, 0, 0, 16), 128, 60),
			new PuzzleStage(2, "Chain Reaction", List.of(128, 64, 32, 16, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 4, 0), 256,
					20),
			new PuzzleStage(3, "Clutter", List.of(4, 2, 8, 2, 0, 8, 2, 4, 16, 4, 32, 8, 2, 16, 4, 2), 128, 26),
			new PuzzleStage(4, "Half Built", List.of(256, 128, 64, 0, 0, 0, 0, 32, 0, 2, 0, 0, 0, 0, 0, 0), 512, 36),
			new PuzzleStage(5, "Locked Column", List.of(256, 4, 2, 4, 16, 2, 8, 0, 8, 4, 2, 8, 256, 2, 4, 2), 512,
					10),
			new PuzzleStage(6, "Endgame", List.of(512, 256, 128, 64, 2, 8, 16, 0, 4, 2, 4, 0, 2, 0, 0, 0), 1024, 36));

	private static final Map<String, PuzzleStage> PUZZLE_STAGES_BY_MODE = PUZZLE_STAGES.stream()
		.collect(Collectors.toUnmodifiableMap(PuzzleStage::mode, Function.identity()));

	/**
	 * A tile's potential: v × (log2 v − 1), 0 for an empty cell or a 2. Merging two tiles raises the
	 * board's potential by exactly the points the merge scores, a spawned 2 adds nothing and a spawned 4
	 * adds 4. So a run's score is its final board's potential, less its start's, less 4 for every 4 that
	 * spawned.
	 */
	static long potential(int tile) {
		return (tile < 2) ? 0 : (long) tile * (Integer.numberOfTrailingZeros(tile) - 1);
	}

	/**
	 * The most moves a Time Attack run can make in this much game time, at
	 * {@value #TIME_ATTACK_MOVES_PER_SECOND} a second, with the platform's latency allowance on top (as
	 * for every pace). Whole numbers only, so the bound is exact.
	 */
	static int mostMovesIn(int gameMs) {
		long ms = gameMs + RunRules.LATENCY_ALLOWANCE.toMillis();
		return (int) (ms * TIME_ATTACK_MOVES_PER_SECOND / 1000);
	}

	/**
	 * The highest score that many moves allow: the board's total at most {@code 8 + 4 × moves}, its
	 * highest tile the largest power of two within that total, and the score at most the total times
	 * one less than that tile's power (see the bounds above).
	 */
	static int mostPointsIn(int moves) {
		long boardTotal = 8L + 4L * moves;
		int power = 63 - Long.numberOfLeadingZeros(boardTotal);
		return (int) (boardTotal * (power - 1));
	}

	@Override
	public String gameSlug() {
		return "2048";
	}

	@Override
	public List<ModeSpec> modes() {
		return Stream.concat(Stream.of(ModeSpec.CLASSIC, MOVES, TIME_ATTACK), PUZZLE_STAGES.stream().map(PuzzleStage::spec))
			.toList();
	}

	@Override
	public Set<String> details() {
		return Set.of("highestTile", "moves");
	}

	@Override
	public Set<String> details(String mode) {
		return TIME_ATTACK_MODE.equals(mode) ? TIME_ATTACK_DETAILS : details();
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int highestTile = details.get("highestTile");
		int moves = details.get("moves");
		if (highestTile < 2 || highestTile > LARGEST_TILE || Integer.bitCount(highestTile) != 1 || score % 4 != 0) {
			return Optional.of("not a 2048 result");
		}
		long boardTotal = 8L + 4L * moves;
		int power = Integer.numberOfTrailingZeros(highestTile);
		if (highestTile > boardTotal || score > boardTotal * (power - 1)
				|| score < (long) highestTile * Math.max(0, power - 2)) {
			return Optional.of("details do not match the score");
		}
		if (moves > RunRules.mostActionsIn(elapsed, 1000.0 / MOVES_PER_SECOND)) {
			return Optional.of("more moves than the time allows");
		}
		return Optional.empty();
	}

	/**
	 * A Moves Limit run: within the limit, and over only when it could be (every move used, or a board
	 * full enough to be stuck), then judged exactly as a Classic run. A Time Attack run: see
	 * {@link #timeAttackProblemWith}. A Puzzle stage: see {@link #puzzleProblemWith}. Any other mode is
	 * refused, never judged as Classic.
	 */
	@Override
	public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (TIME_ATTACK_MODE.equals(mode)) {
			return timeAttackProblemWith(score, details, elapsed);
		}
		PuzzleStage stage = PUZZLE_STAGES_BY_MODE.get(mode);
		if (stage != null) {
			return puzzleProblemWith(stage, score, details, elapsed);
		}
		if (!MOVES_MODE.equals(mode)) {
			return RunRules.super.problemWith(mode, sessionId, score, details, elapsed);
		}
		int moves = details.get("moves");
		if (moves > MOVE_LIMIT) {
			return Optional.of("more moves than the limit");
		}
		if (moves < FEWEST_MOVES_TO_FILL) {
			return Optional.of("too few moves for the run to have ended");
		}
		return problemWith(score, details, elapsed);
	}

	/**
	 * A Moves Limit run completes only when it used every move, a Time Attack run only when its time ran
	 * out; one stuck earlier does not.
	 */
	@Override
	public boolean completes(String mode, Map<String, Integer> details) {
		if (MOVES_MODE.equals(mode)) {
			return details.get("moves") == MOVE_LIMIT;
		}
		if (TIME_ATTACK_MODE.equals(mode)) {
			return details.get("timeUp") == 1;
		}
		return RunRules.super.completes(mode, details);
	}

	/**
	 * A Time Attack run. Its game time is above 0 and at most the limit, in whole steps, and the engine
	 * stops the clock exactly at the limit and says so ({@code timeUp} 1); a run that ended before was
	 * stuck on a full board. Against the server's clock (the session's start to the finish), the game
	 * time never runs ahead of real time, and real time beyond it, the pauses, is at most the pause
	 * allowance: the client's own count of its pauses is never asked for nor trusted. Then Classic's
	 * checks, and the pace in game time, which is what the moves were made in.
	 */
	private Optional<String> timeAttackProblemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int gameMs = details.get("gameMs");
		int timeUp = details.get("timeUp");
		int moves = details.get("moves");
		if (gameMs <= 0 || gameMs > TIME_LIMIT_MS) {
			return Optional.of("game time outside the mode's limit");
		}
		if (gameMs % STEP_MS != 0) {
			return Optional.of("game time not in whole steps");
		}
		if (timeUp != 0 && timeUp != 1) {
			return Optional.of("timeUp is neither 0 nor 1");
		}
		if ((timeUp == 1) != (gameMs == TIME_LIMIT_MS)) {
			return Optional.of("timeUp does not match the game time");
		}
		// The clock starts with the first valid move; a run that ended early was stuck on a full board.
		if (moves < ((timeUp == 1) ? 1 : FEWEST_MOVES_TO_FILL)) {
			return Optional.of("too few moves for the run to have ended");
		}
		// Game time never runs faster than real time.
		if (Duration.ofMillis(gameMs).compareTo(elapsed.plus(LATENCY_ALLOWANCE)) > 0) {
			return Optional.of("more game time than the session lasted");
		}
		// Real time beyond the game time is the pause allowance, and no more.
		if (elapsed.compareTo(Duration.ofMillis(gameMs).plus(PAUSE_ALLOWANCE).plus(LATENCY_ALLOWANCE)) > 0) {
			return Optional.of("paused for longer than the mode allows");
		}
		Optional<String> classic = problemWith(score, details, elapsed);
		if (classic.isPresent()) {
			return classic;
		}
		if (moves > mostMovesIn(gameMs)) {
			return Optional.of("more moves than the game time allows");
		}
		return Optional.empty();
	}

	/**
	 * A cleared Puzzle stage. Its highest tile is exactly the target: every tile on the start is below it,
	 * a merge only doubles, and the engine stops the moment the target is made. It took from 1 move to
	 * the stage's budget, and enough of them for spawns to bring the board's total up to the target. Every
	 * valid move but the clearing one spawned a 2 or a 4, so the score lies between what building the
	 * target from that start can score and what the most a board of that size can hold can score (see
	 * {@link #potential}), and is a multiple of 4. The moves were made at a person's pace.
	 *
	 * <p>These are bounds every honest clear meets, not proof of one: without the moves the server cannot
	 * replay the board, so a made-up clear within them is not caught.
	 */
	private Optional<String> puzzleProblemWith(PuzzleStage stage, int score, Map<String, Integer> details,
			Duration elapsed) {
		int highestTile = details.get("highestTile");
		int moves = details.get("moves");
		if (highestTile < stage.target()) {
			return Optional.of("highest tile short of the stage's target");
		}
		if (highestTile > stage.target()) {
			return Optional.of("highest tile above the stage's target");
		}
		if (moves < 1) {
			return Optional.of("no move made");
		}
		if (moves > stage.moveLimit()) {
			return Optional.of("more moves than the stage allows");
		}
		if (moves < stage.fewestMoves()) {
			return Optional.of("too few moves to reach the target");
		}
		if (score % 4 != 0 || score < stage.fewestPoints(moves) || score > stage.mostPoints(moves)) {
			return Optional.of("score does not match a clear in these moves");
		}
		if (moves > RunRules.mostActionsIn(elapsed, 1000.0 / MOVES_PER_SECOND)) {
			return Optional.of("more moves than the time allows");
		}
		return Optional.empty();
	}

}
