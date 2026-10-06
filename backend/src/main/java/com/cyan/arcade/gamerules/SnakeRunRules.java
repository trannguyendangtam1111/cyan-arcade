package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Snake ({@code frontend/src/games/snake/engine}): one point per apple, and every apple makes the
 * snake one cell longer than the three it starts with. The level goes up every five apples. The
 * snake moves one cell per tick and never faster than one tick per 70 ms, and eating an apple takes
 * at least one move.
 */
@Component
class SnakeRunRules implements RunRules {

	static final int INITIAL_LENGTH = 3;

	static final int POINTS_PER_LEVEL = 5;

	/** The shortest time between two moves a human player gets. */
	static final double FASTEST_TICK_MS = 70;

	@Override
	public String gameSlug() {
		return "snake";
	}

	@Override
	public Set<String> details() {
		return Set.of("length", "level");
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

}
