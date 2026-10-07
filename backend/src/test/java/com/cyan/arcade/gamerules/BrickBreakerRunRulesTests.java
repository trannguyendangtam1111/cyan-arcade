package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Brick Breaker's rules on their own: what real runs' numbers look like, and every way a made-up one
 * gives itself away.
 */
class BrickBreakerRunRulesTests {

	private final BrickBreakerRunRules rules = new BrickBreakerRunRules();

	private static final Duration LONG_SESSION = Duration.ofMinutes(30);

	// --- The engine's numbers -----------------------------------------------------------------------

	@Test
	void theLevelsAndScoresAreTheEngines() {
		// The frontend's levels.ts and scoring.ts (pinned by its tests too): the two must stay the same.
		assertThat(BrickBreakerRunRules.LEVEL_BRICKS).containsExactly(44, 40, 46, 46, 58, 48, 58, 80);
		assertThat(BrickBreakerRunRules.ENDLESS_MIN_BRICKS).isEqualTo(36);
		assertThat(BrickBreakerRunRules.ENDLESS_MAX_BRICKS).isEqualTo(96);
		assertThat(BrickBreakerRunRules.MAX_BRICK_POINTS).isEqualTo(1250);
		assertThat(BrickBreakerRunRules.MAX_LEVEL_BONUS).isEqualTo(4100);
		assertThat(BrickBreakerRunRules.bricksThrough(8, true)).isEqualTo(420);
		assertThat(BrickBreakerRunRules.bricksThrough(10, false)).isEqualTo(492);
		assertThat(BrickBreakerRunRules.bricksThrough(10, true)).isEqualTo(612);
	}

	// --- Real runs ----------------------------------------------------------------------------------

	@Test
	void realRunsArePlausible() {
		// Lost on level 1 after 30 bricks, nothing caught.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 0, 3, 0, 95_000), Duration.ofSeconds(96))).isEmpty();
		// Lost on level 1 without breaking anything.
		assertThat(this.rules.problemWith(0, run(1, 0, 0, 0, 1, 0, 0, 3, 0, 9_000), Duration.ofSeconds(10))).isEmpty();
		// Three levels cleared, one perfectly, with power-ups, an extra life and multi-ball.
		assertThat(this.rules.problemWith(48_000, run(4, 150, 22, 30, 5, 12, 9, 4, 1, 420_000), LONG_SESSION)).isEmpty();
		// Deep into Endless.
		assertThat(this.rules.problemWith(400_000, run(12, 650, 50, 115, 8, 101, 124, 4, 9, 1_500_000), LONG_SESSION))
			.isEmpty();
	}

	@Test
	void networkDelayAndPausesAreAllowedFor() {
		// The server started its clock a little late.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 0, 3, 0, 95_000), Duration.ofMillis(93_500))).isEmpty();
		// A long run whose start reached the server late: its game time is a few percent over the session.
		assertThat(this.rules.problemWith(48_000, run(4, 150, 22, 30, 5, 12, 9, 4, 1, 420_000), Duration.ofMillis(403_000)))
			.isEmpty();
		// A long pause: the session is far longer than the game.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 0, 3, 0, 95_000), Duration.ofHours(2))).isEmpty();
	}

	// --- Made-up runs -------------------------------------------------------------------------------

	@Test
	void theScoreMustMatchTheBricks() {
		// 30 bricks cannot make a million points, nor fewer than 100 a brick.
		assertThat(this.rules.problemWith(1_000_000, run(1, 30, 6, 0, 1, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(1_000, run(1, 30, 6, 0, 1, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		// A level cleared earns at least its bonus.
		assertThat(this.rules.problemWith(4_400, run(2, 44, 6, 0, 1, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
	}

	@Test
	void bricksMustMatchTheLevelReached() {
		// Level 3 means levels 1 and 2 (84 bricks) were cleared.
		assertThat(this.rules.problemWith(20_000, run(3, 60, 6, 5, 1, 0, 0, 3, 0, 200_000), LONG_SESSION)).isPresent();
		// Level 1 has only 44 bricks.
		assertThat(this.rules.problemWith(20_000, run(1, 60, 6, 5, 1, 0, 0, 3, 0, 200_000), LONG_SESSION)).isPresent();
		// Not a level at all.
		assertThat(this.rules.problemWith(0, run(0, 0, 0, 0, 1, 0, 0, 3, 0, 1_000), LONG_SESSION)).isPresent();
	}

	@Test
	void powerUpsMustBePossible() {
		// More power-ups than bricks destroyed.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 31, 1, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		// Far more than the drop rates allow.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 25, 1, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		// Fireball, lasers or extra balls without catching anything.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 5, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 5, 3, 0, 95_000), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 3, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		// More balls than the game ever has.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 4, 9, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		// More fireball and laser bricks than bricks.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 4, 1, 20, 20, 3, 0, 95_000), LONG_SESSION)).isPresent();
	}

	@Test
	void theRunMustHaveEndedLikeARun() {
		// A run ends with every life gone: at least three lost, and at most one more per power-up.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 0, 2, 0, 95_000), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 1, 1, 0, 0, 5, 0, 95_000), LONG_SESSION)).isPresent();
		// A combo longer than the bricks, or perfect clears of levels never cleared.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 31, 0, 1, 0, 0, 3, 0, 95_000), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 0, 3, 1, 95_000), LONG_SESSION)).isPresent();
	}

	@Test
	void timeMustMatch() {
		// A game far longer than its session.
		assertThat(this.rules.problemWith(4_200, run(1, 30, 6, 0, 1, 0, 0, 3, 0, 95_000), Duration.ofSeconds(60)))
			.isPresent();
		// Seven levels cleared in five seconds: each level's clear alone takes longer.
		assertThat(this.rules.problemWith(60_000, run(8, 340, 20, 30, 1, 0, 0, 3, 0, 5_000), LONG_SESSION)).isPresent();
	}

	/** A run's details, as the game reports them. */
	private static Map<String, Integer> run(int level, int bricks, int maxCombo, int powerUps, int maxBalls,
			int fireBricks, int laserBricks, int livesLost, int perfectClears, int gameMs) {
		Map<String, Integer> details = new HashMap<>();
		details.put("level", level);
		details.put("bricks", bricks);
		details.put("maxCombo", maxCombo);
		details.put("powerUps", powerUps);
		details.put("maxBalls", maxBalls);
		details.put("fireBricks", fireBricks);
		details.put("laserBricks", laserBricks);
		details.put("livesLost", livesLost);
		details.put("perfectClears", perfectClears);
		details.put("gameMs", gameMs);
		return details;
	}

}
