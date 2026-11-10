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
 * Snake ({@code frontend/src/games/snake/engine}): one point per apple, and every apple makes the
 * snake one cell longer than the three it starts with. The level goes up every five apples. The
 * snake moves one cell per tick and never faster than one tick per 70 ms, and eating an apple takes
 * at least one move.
 *
 * <p><b>Maps</b> ({@code map-pillars}, {@code map-tunnels}, {@code map-rooms}; the layouts are
 * {@code frontend/src/games/snake/engine/snakeMaps.ts}) are the same game on the same 16x16 board with
 * walls in it: the same apples, growth, levels and speed, so the same rules judge them. Each is ranked
 * on a board of its own, highest first, and its highest possible score is its free cells less the
 * starting snake. A map run ends the way a Classic one does, so it earns what finishing a game earns;
 * achievements, challenges and best-score bonuses stay Classic's (the platform's rule for every mode).
 *
 * <p><b>Adventure</b> is six fixed stages ({@link #ADVENTURE_STAGES}, mirrored from
 * {@code frontend/src/games/snake/engine/snakeAdventure.ts}), each a mode of its own
 * ({@code adventure-1} to {@code adventure-6}): a board (open or a map) and an objective, so many
 * apples, some within so many moves. The engine ends a stage the moment its last apple is eaten, so a
 * clear has eaten exactly the objective's apples, within the move limit if there is one; a crash, or
 * the last allowed move made short of the objective, fails it, and these rules refuse it. A clear's
 * score is its game time: the human tick delay at the score before each move, summed over its moves,
 * which these rules pin between the fastest and the slowest way the same moves and apples can add up.
 * Adventure modes are unranked (no board) and complete nothing, so a clear is kept in the player's
 * history and earns no XP and no coins.
 */
@Component
class SnakeRunRules implements RunRules {

	static final int INITIAL_LENGTH = 3;

	static final int POINTS_PER_LEVEL = 5;

	/** The shortest time between two moves a human player gets. */
	static final double FASTEST_TICK_MS = 70;

	/** The human tick at level 1, and how much faster each level makes it (never below {@link #FASTEST_TICK_MS}). */
	static final int BASE_TICK_MS = 150;

	static final int TICK_SPEED_UP_MS = 10;

	/**
	 * The maps, each ranked by points. The highest score is the map's free cells (256 less its walls)
	 * less the three the snake starts on: Pillars has 16 walls, Tunnels 24 and Rooms 44.
	 */
	static final List<ModeSpec> MAP_MODES = List.of(map("map-pillars", "Pillars", 237),
			map("map-tunnels", "Tunnels", 229), map("map-rooms", "Rooms", 209));

	private static ModeSpec map(String id, String name, int maxScore) {
		return new ModeSpec(id, name, true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, maxScore);
	}

	private static boolean isMap(String mode) {
		return MAP_MODES.stream().anyMatch((spec) -> spec.id().equals(mode));
	}

	/**
	 * The most moves a clear of a stage without a move limit may report. The engine has no such limit;
	 * this one is far beyond any real clear (the slowest the AI took over 100 seeds was 448 moves).
	 */
	static final int MOST_MOVES_WITHOUT_A_LIMIT = 20_000;

	/**
	 * One Adventure stage: what the server needs to judge a clear of it. Its board and seed are the
	 * client's alone: they decide where the apples fall, which nothing here can check.
	 * @param board what the stage is played on, for its name
	 * @param apples the apples that clear it
	 * @param moveLimit the moves a clear may take at most, or 0 for no limit
	 */
	record AdventureStage(int id, String board, int apples, int moveLimit) {

		/** The mode the stage is played under. */
		String mode() {
			return "adventure-" + this.id;
		}

		/** The most moves a clear can report. */
		int mostMoves() {
			return (this.moveLimit > 0) ? this.moveLimit : MOST_MOVES_WITHOUT_A_LIMIT;
		}

		/** Unranked: no board. Its score is a game time, at most the slowest its most moves can take. */
		ModeSpec spec() {
			return new ModeSpec(mode(), "Adventure " + this.id + ": " + this.board, false, ModeSpec.Order.ASC,
					ModeSpec.Unit.MILLISECONDS, slowestGameMs(mostMoves(), this.apples));
		}

	}

	/** The six stages, as {@code frontend/src/games/snake/engine/snakeAdventure.ts} defines them. */
	static final List<AdventureStage> ADVENTURE_STAGES = List.of(new AdventureStage(1, "Open", 10, 0),
			new AdventureStage(2, "Pillars", 15, 0), new AdventureStage(3, "Tunnels", 20, 0),
			new AdventureStage(4, "Tunnels", 15, 400), new AdventureStage(5, "Rooms", 25, 0),
			new AdventureStage(6, "Rooms", 30, 900));

	private static final Map<String, AdventureStage> STAGES_BY_MODE = ADVENTURE_STAGES.stream()
		.collect(Collectors.toUnmodifiableMap(AdventureStage::mode, Function.identity()));

	/** A stage clear's details: apples eaten, the snake's length and level, the moves made and the game time. */
	static final Set<String> ADVENTURE_DETAILS = Set.of("apples", "length", "level", "steps", "gameMs");

	/** The human tick delay at a score, as {@code tickDelay} in the frontend's engine: the game time of one move. */
	static int tickMs(int score) {
		return Math.max((int) FASTEST_TICK_MS, BASE_TICK_MS - (score / POINTS_PER_LEVEL) * TICK_SPEED_UP_MS);
	}

	/**
	 * The least game time {@code steps} moves that eat {@code apples} apples, the last one with the last
	 * move, can take: every apple eaten as early as possible, so the snake speeds up soonest.
	 */
	static int fastestGameMs(int steps, int apples) {
		int total = 0;
		for (int move = 1; move <= steps; move++) {
			total += tickMs(Math.min(move - 1, apples - 1));
		}
		return total;
	}

	/** The most: every apple but the last as late as possible, the moves before them at level 1's pace. */
	static int slowestGameMs(int steps, int apples) {
		int total = 0;
		for (int move = 1; move <= steps; move++) {
			total += tickMs(Math.max(0, move - (steps - apples + 1)));
		}
		return total;
	}

	@Override
	public String gameSlug() {
		return "snake";
	}

	@Override
	public List<ModeSpec> modes() {
		return Stream
			.of(Stream.of(ModeSpec.CLASSIC), MAP_MODES.stream(), ADVENTURE_STAGES.stream().map(AdventureStage::spec))
			.flatMap(Function.identity())
			.toList();
	}

	@Override
	public Set<String> details() {
		return Set.of("length", "level");
	}

	@Override
	public Set<String> details(String mode) {
		return STAGES_BY_MODE.containsKey(mode) ? ADVENTURE_DETAILS : details();
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		if (details.get("length") != score + INITIAL_LENGTH || details.get("level") != score / POINTS_PER_LEVEL + 1) {
			return Optional.of("details do not match the score");
		}
		if (score > RunRules.mostActionsIn(elapsed, FASTEST_TICK_MS)) {
			return Optional.of("more apples than moves in the time");
		}
		return Optional.empty();
	}

	/**
	 * A map run is judged exactly as a Classic one; its own highest score is its mode's limit. An
	 * Adventure stage by its own rules; any other mode is refused, never judged as Classic.
	 */
	@Override
	public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (isMap(mode)) {
			return problemWith(score, details, elapsed);
		}
		AdventureStage stage = STAGES_BY_MODE.get(mode);
		if (stage != null) {
			return adventureProblemWith(stage, score, details, elapsed);
		}
		return RunRules.super.problemWith(mode, sessionId, score, details, elapsed);
	}

	/**
	 * A cleared stage: exactly its apples eaten (the engine stops at the last one), the snake as long and
	 * as fast as they make it, within the stage's moves, and a game time those moves can add up to, no
	 * longer than the session lasted. A crash or an exhausted move limit short of the objective is refused.
	 */
	private Optional<String> adventureProblemWith(AdventureStage stage, int score, Map<String, Integer> details,
			Duration elapsed) {
		int apples = details.get("apples");
		int steps = details.get("steps");
		int gameMs = details.get("gameMs");
		if (apples < stage.apples()) {
			return Optional.of("fewer apples than the stage's objective");
		}
		if (apples > stage.apples()) {
			return Optional.of("more apples than the clear that reached the objective");
		}
		if (details.get("length") != apples + INITIAL_LENGTH || details.get("level") != apples / POINTS_PER_LEVEL + 1) {
			return Optional.of("details do not match the apples");
		}
		// Every apple takes a move to reach.
		if (steps < apples) {
			return Optional.of("fewer moves than apples");
		}
		if (steps > stage.mostMoves()) {
			return Optional.of("more moves than the stage allows");
		}
		if (score != gameMs) {
			return Optional.of("score is not the game time");
		}
		if (gameMs < fastestGameMs(steps, apples) || gameMs > slowestGameMs(steps, apples)) {
			return Optional.of("game time does not match the moves");
		}
		// Game time never runs faster than real time, and no move is faster than the fastest tick.
		if (Duration.ofMillis(gameMs).compareTo(elapsed.plus(LATENCY_ALLOWANCE)) > 0) {
			return Optional.of("more game time than the session lasted");
		}
		if (steps > RunRules.mostActionsIn(elapsed, FASTEST_TICK_MS)) {
			return Optional.of("more moves than the time allows");
		}
		return Optional.empty();
	}

	/**
	 * A map run ends when the snake crashes or fills the map, as a Classic run does. An Adventure stage
	 * never completes: a clear is recorded but earns no completion reward.
	 */
	@Override
	public boolean completes(String mode, Map<String, Integer> details) {
		return isMap(mode) || RunRules.super.completes(mode, details);
	}

}
