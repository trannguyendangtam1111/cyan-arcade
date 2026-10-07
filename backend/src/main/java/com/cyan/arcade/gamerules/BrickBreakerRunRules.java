package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Brick Breaker ({@code frontend/src/games/brick-breaker/engine}). A run is a climb through levels:
 * eight handcrafted ones with known brick counts, then Endless levels of 36 to 96 bricks. To reach a
 * level every brick of the levels before it was destroyed, so the bricks a run reports must lie
 * between those levels' bricks and those plus the current level's. A run ends when the lives run
 * out: three, plus any extra life caught.
 *
 * <p>Bricks score 100 to 250 by kind, at most ×2.5 for a combo and ×2 under x2 Score; a hit that
 * only cracks a brick scores 10 (two at most before it breaks); a cleared level adds a bonus of 500
 * to 4,100. So the details bound the score from both sides. Power-ups come from destroyed bricks
 * (about a fifth of them, plus special bricks that always drop one), and fireball, laser and extra
 * balls need a power-up. Every limit is far looser than real play, so no real run is refused. The
 * numbers are the engine's ({@code levels.ts}, {@code scoring.ts}, {@code powerUps.ts}): change them
 * together.
 */
@Component
class BrickBreakerRunRules implements RunRules {

	/** Bricks in each handcrafted level, in order. */
	static final int[] LEVEL_BRICKS = { 44, 40, 46, 46, 58, 48, 58, 80 };

	static final int ENDLESS_MIN_BRICKS = 36;

	static final int ENDLESS_MAX_BRICKS = 96;

	static final int START_LIVES = 3;

	static final int MAX_BALLS = 8;

	/** The fewest points a destroyed brick scores, and the most (armored, ×2.5 combo, ×2 score). */
	static final int MIN_BRICK_POINTS = 100;

	static final int MAX_BRICK_POINTS = 250 * 5 / 2 * 2;

	/** Points for a hit that does not destroy a brick, and the most such hits a brick takes. */
	static final int HIT_POINTS = 10;

	static final int MAX_HITS_PER_BRICK = 2;

	/** The smallest and the largest bonus for clearing a level. */
	static final int MIN_LEVEL_BONUS = 500;

	static final int MAX_LEVEL_BONUS = 1500 + 5 * 100 + 600 + 500 + 1000;

	/**
	 * How much longer than the session a run's game time may look, besides the latency allowance: a
	 * run lasts minutes, and its start request can reach the server late on a slow network.
	 */
	static final double CLOCK_SLACK = 0.05;

	/** Every cleared level shows its bonus for this long, in game time. */
	static final long LEVEL_CLEAR_MS = 1800;

	@Override
	public String gameSlug() {
		return "brick-breaker";
	}

	@Override
	public Set<String> details() {
		return Set.of("level", "bricks", "maxCombo", "powerUps", "maxBalls", "fireBricks", "laserBricks", "livesLost",
				"perfectClears", "gameMs");
	}

	/** Bricks in a level: exact for a handcrafted one, Endless's limit otherwise. */
	static int bricksIn(int level, boolean most) {
		if (level <= LEVEL_BRICKS.length) {
			return LEVEL_BRICKS[level - 1];
		}
		return most ? ENDLESS_MAX_BRICKS : ENDLESS_MIN_BRICKS;
	}

	/** Bricks in levels 1 to {@code last}, with Endless levels at their fewest or most. */
	static long bricksThrough(int last, boolean most) {
		long bricks = 0;
		for (int level = 1; level <= last; level++) {
			bricks += bricksIn(level, most);
		}
		return bricks;
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int level = details.get("level");
		int bricks = details.get("bricks");
		int maxCombo = details.get("maxCombo");
		int powerUps = details.get("powerUps");
		int maxBalls = details.get("maxBalls");
		int fireBricks = details.get("fireBricks");
		int laserBricks = details.get("laserBricks");
		int livesLost = details.get("livesLost");
		int perfectClears = details.get("perfectClears");
		int gameMs = details.get("gameMs");
		if (level < 1 || level > 10_000) {
			return Optional.of("not a level");
		}
		int cleared = level - 1;

		if (bricks < bricksThrough(cleared, false) || bricks > bricksThrough(level, true)) {
			return Optional.of("bricks do not match the level reached");
		}
		if (maxCombo > bricks || (bricks > 0 && maxCombo < 1) || fireBricks + (long) laserBricks > bricks
				|| perfectClears > cleared) {
			return Optional.of("details do not add up");
		}
		if (maxBalls < 1 || maxBalls > MAX_BALLS) {
			return Optional.of("more balls than the game allows");
		}
		boolean poweredUp = fireBricks > 0 || laserBricks > 0 || maxBalls > 1;
		if (powerUps > bricks || powerUps > bricks * 0.4 + 2L * level + 5 || (poweredUp && powerUps < 1)) {
			return Optional.of("power-ups do not match the bricks destroyed");
		}
		// The run ended with no lives left: three, plus at most one more per power-up caught.
		if (livesLost < START_LIVES || livesLost > START_LIVES + (long) powerUps) {
			return Optional.of("lives do not match a finished run");
		}
		long longest = Math.round(elapsed.toMillis() * (1 + CLOCK_SLACK)) + LATENCY_ALLOWANCE.toMillis();
		if (gameMs > longest || gameMs < cleared * LEVEL_CLEAR_MS) {
			return Optional.of("game time does not match");
		}
		long fewest = (long) MIN_BRICK_POINTS * bricks + (long) MIN_LEVEL_BONUS * cleared;
		long most = (long) MAX_BRICK_POINTS * bricks
				+ (long) HIT_POINTS * MAX_HITS_PER_BRICK * (bricks + ENDLESS_MAX_BRICKS)
				+ (long) MAX_LEVEL_BONUS * cleared;
		if (score < fewest || score > most) {
			return Optional.of("details do not match the score");
		}
		return Optional.empty();
	}

}
