package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Flappy Bird ({@code frontend/src/games/flappy-bird/engine}): one point per pipe flown past. The
 * world scrolls at its own pace whatever the bird does, and the pace, the distance between pipes and
 * the size of the gaps come from a fixed table by the number of pipes passed (the engine's
 * {@code difficulty.ts}; the two must stay the same). So when each pipe is passed is fixed: a flight
 * that scored {@code n} lasted at least the time to pass pipe {@code n − 1} and less than the time to
 * pass pipe {@code n}. The flight's game time stops while the game is paused, so it can be shorter
 * than the time the server measured, never longer.
 *
 * <p>The bird falls under gravity and each flap sends it up at a set speed, so staying in the air
 * takes at least a flap or so every second; nobody taps more than {@value #MOST_FLAPS_PER_SECOND} times
 * a second for a whole flight. Both limits are far looser than the physics, so no real flight is
 * refused.
 */
@Component
class FlappyBirdRunRules implements RunRules {

	/** One row of the difficulty table; it applies from pipe {@code fromPipe} on. */
	record Level(int level, int fromPipe, double speed, double spacing) {
	}

	static final List<Level> LEVELS = List.of(new Level(1, 0, 150, 250), new Level(2, 5, 158, 245),
			new Level(3, 15, 168, 240), new Level(4, 30, 180, 234), new Level(5, 50, 192, 228),
			new Level(6, 75, 204, 222), new Level(7, 100, 216, 216));

	static final double BIRD_X = 120;

	static final double FIRST_PIPE_X = 460;

	static final double PIPE_WIDTH = 70;

	/**
	 * How far a flight's game time may be from the course's timing: the engine notices a pass at the
	 * end of a 1/120 s step, and the frames it is shown at are not perfectly regular.
	 */
	static final long TIMING_TOLERANCE_MS = 250;

	/** A real flight needs about 1.6 flaps a second to stay up; this is far below that. */
	static final double FEWEST_FLAPS_PER_SECOND = 0.6;

	static final int MOST_FLAPS_PER_SECOND = 20;

	@Override
	public String gameSlug() {
		return "flappy-bird";
	}

	@Override
	public Set<String> details() {
		return Set.of("pipes", "flaps", "flightMs", "seconds", "level", "seed");
	}

	static Level levelFor(int pipe) {
		Level current = LEVELS.get(0);
		for (Level level : LEVELS) {
			if (pipe >= level.fromPipe()) {
				current = level;
			}
		}
		return current;
	}

	/** Game time from the first flap until pipe number {@code pipe} (0 for the first) is passed. */
	static double passTimeMs(int pipe) {
		double seconds = (FIRST_PIPE_X + PIPE_WIDTH - BIRD_X) / levelFor(0).speed();
		for (int next = 1; next <= pipe; next++) {
			Level level = levelFor(next);
			seconds += level.spacing() / level.speed();
		}
		return seconds * 1000;
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int pipes = details.get("pipes");
		int flaps = details.get("flaps");
		int flightMs = details.get("flightMs");
		if (pipes != score || details.get("level") != levelFor(pipes).level()
				|| details.get("seconds") != flightMs / 1000) {
			return Optional.of("details do not match the score");
		}
		if (flightMs > elapsed.plus(LATENCY_ALLOWANCE).toMillis()) {
			return Optional.of("flight longer than the session");
		}
		if ((score > 0 && flightMs < passTimeMs(score - 1) - TIMING_TOLERANCE_MS)
				|| flightMs >= passTimeMs(score) + TIMING_TOLERANCE_MS) {
			return Optional.of("pipes passed do not match the flight time");
		}
		double flightSeconds = flightMs / 1000.0;
		if (flaps < 1 || flaps < Math.floor(flightSeconds * FEWEST_FLAPS_PER_SECOND) - 2) {
			return Optional.of("too few flaps to stay in the air");
		}
		if (flaps > flightSeconds * MOST_FLAPS_PER_SECOND + 2) {
			return Optional.of("more flaps than the time allows");
		}
		return Optional.empty();
	}

}
