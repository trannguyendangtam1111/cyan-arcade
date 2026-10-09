package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Dino Run ({@code frontend/src/games/dino-run/engine}): the score is a tenth of the distance run.
 * The world moves at its own pace whatever the runner does: in fixed steps of 1/120 s, each step
 * moving {@code speed(distance) / 120} units, with {@code speed = min(690, 330 + 0.006 × distance)}
 * (the engine's {@code difficulty.ts} and {@code physics.ts}; the two must stay the same). So how long
 * a run of a given score lasted is fixed to the step: this class plays the same recurrence and checks
 * the run's game time against it. Game time stops while paused, so it can be shorter than the time
 * the server measured, never longer.
 *
 * <p>The rest is plausibility, not proof: obstacles cleared within what the course's spacing allows
 * for the distance, no more jumps or ducks than time allows, and some jumping or ducking for the
 * obstacles cleared. What it cannot check is which inputs were made: a client that plays a fake run as
 * slowly as a real one, with consistent numbers, could submit it.
 */
@Component
class DinoRunRunRules implements RunRules {

	static final double START_SPEED = 330;

	static final double MAX_SPEED = 690;

	static final double SPEED_PER_UNIT = 0.006;

	static final double STEP_MS = 1000.0 / 120;

	static final double STEP_S = STEP_MS / 1000;

	/** The score each difficulty level starts at (the engine's {@code LEVELS}). */
	static final List<Integer> LEVEL_FROM_SCORE = List.of(0, 150, 400, 800, 1400, 2200, 3200, 4500);

	/** How far the runner goes before the first obstacle's front reaches it. */
	static final double FIRST_OBSTACLE_DISTANCE = 580;

	/** The course never puts obstacles closer together than this (the slowest fair gap plus a width). */
	static final double FEWEST_UNITS_PER_OBSTACLE = 300;

	/** Nor further apart than this (the widest gap at top speed plus the widest group). */
	static final double MOST_UNITS_PER_OBSTACLE = 1600;

	/** The shortest a jump can be, dropping fast all the way: 2 × 840 / (2600 × 3.2) s. */
	static final double SHORTEST_JUMP_MS = 200;

	@Override
	public String gameSlug() {
		return "dino-run";
	}

	@Override
	public Set<String> details() {
		return Set.of("meters", "runMs", "seconds", "level", "obstacles", "jumps", "ducks", "seed");
	}

	static int levelFor(int score) {
		int level = 1;
		for (int i = 0; i < LEVEL_FROM_SCORE.size(); i++) {
			if (score >= LEVEL_FROM_SCORE.get(i)) {
				level = i + 1;
			}
		}
		return level;
	}

	/**
	 * Steps until the distance run first reaches {@code distance}, exactly as the engine counts them
	 * (the same floating-point operations in the same order).
	 */
	static long stepsToReach(double distance) {
		double run = 0;
		long steps = 0;
		while (run < distance) {
			double speed = Math.min(MAX_SPEED, START_SPEED + SPEED_PER_UNIT * run);
			run += speed * STEP_S;
			steps++;
		}
		return steps;
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int runMs = details.get("runMs");
		int obstacles = details.get("obstacles");
		int jumps = details.get("jumps");
		int ducks = details.get("ducks");
		if (details.get("meters") != score || details.get("seconds") != runMs / 1000
				|| details.get("level") != levelFor(score) || details.get("seed") < 0 || runMs < 0 || obstacles < 0
				|| jumps < 0 || ducks < 0) {
			return Optional.of("details do not match the score");
		}
		if (runMs > elapsed.plus(LATENCY_ALLOWANCE).toMillis()) {
			return Optional.of("run longer than the session");
		}
		// The run ended at a step where the distance was in [10 × score, 10 × score + 10).
		double earliest = stepsToReach(10.0 * score) * STEP_MS;
		double latest = stepsToReach(10.0 * score + 10) * STEP_MS;
		if (runMs < earliest - STEP_MS || runMs > latest + STEP_MS) {
			return Optional.of("distance does not match the run's time");
		}
		double distance = 10.0 * score + 10;
		if (obstacles > distance / FEWEST_UNITS_PER_OBSTACLE + 2) {
			return Optional.of("more obstacles than the course has");
		}
		if (obstacles < Math.floor((distance - FIRST_OBSTACLE_DISTANCE - MOST_UNITS_PER_OBSTACLE) / MOST_UNITS_PER_OBSTACLE) - 1) {
			return Optional.of("fewer obstacles than the course has");
		}
		if (jumps > runMs / SHORTEST_JUMP_MS + 2 || ducks > runMs / (2 * STEP_MS) + 2) {
			return Optional.of("more jumps or ducks than the time allows");
		}
		if (obstacles > 0 && jumps + ducks < Math.max(1, (obstacles - 1) / 3.0)) {
			return Optional.of("obstacles cleared without jumping or ducking");
		}
		return Optional.empty();
	}

}
