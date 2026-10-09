package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Dino Run's run rules, without the platform: what a real run looks like, and what cannot be one. */
class DinoRunRunRulesTests {

	private final DinoRunRunRules rules = new DinoRunRunRules();

	/** A run of this score as the engine would report it, ending halfway through its last 10 units. */
	static Map<String, Integer> honest(int score) {
		long steps = (DinoRunRunRules.stepsToReach(10.0 * score) + DinoRunRunRules.stepsToReach(10.0 * score + 10)) / 2;
		int runMs = (int) Math.round(steps * DinoRunRunRules.STEP_MS);
		int obstacles = (int) Math.max(0, Math.floor((10.0 * score - 600) / 700));
		Map<String, Integer> details = new HashMap<>();
		details.put("meters", score);
		details.put("runMs", runMs);
		details.put("seconds", runMs / 1000);
		details.put("level", DinoRunRunRules.levelFor(score));
		details.put("obstacles", obstacles);
		details.put("jumps", obstacles);
		details.put("ducks", 0);
		details.put("seed", 12345);
		return details;
	}

	private static Map<String, Integer> with(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	private static final Duration LONG_SESSION = Duration.ofMinutes(30);

	@Test
	void theSpeedCurveIsTheEnginesToTheStep() {
		// The same numbers as the engine's own test (frontend dinoEngine.test.ts): change both together.
		assertThat(DinoRunRunRules.stepsToReach(1000)).isEqualTo(361);
		assertThat(DinoRunRunRules.stepsToReach(10_000)).isEqualTo(3342);
		assertThat(DinoRunRunRules.stepsToReach(60_000)).isEqualTo(14753);
		assertThat(DinoRunRunRules.stepsToReach(100_000)).isEqualTo(21709);
		assertThat(DinoRunRunRules.stepsToReach(0)).isZero();
	}

	@Test
	void realRunsPass() {
		for (int score : new int[] { 0, 1, 99, 150, 1000, 4500, 6000, 20_000 }) {
			assertThat(this.rules.problemWith(score, honest(score), LONG_SESSION.multipliedBy(4))).as("score %d", score).isEmpty();
		}
	}

	@Test
	void aScoreNeedsTheTimeItsDistanceTakes() {
		Map<String, Integer> run = honest(1000);
		// The same score in two seconds less: not a run this course allows.
		int faster = run.get("runMs") - 2000;
		assertThat(this.rules.problemWith(1000, with(with(run, "runMs", faster), "seconds", faster / 1000), LONG_SESSION)).isPresent();
		int slower = run.get("runMs") + 2000;
		assertThat(this.rules.problemWith(1000, with(with(run, "runMs", slower), "seconds", slower / 1000), LONG_SESSION)).isPresent();
		// A run longer than the session that carried it.
		assertThat(this.rules.problemWith(1000, run, Duration.ofSeconds(10))).isPresent();
	}

	@Test
	void theDetailsMustAgreeWithTheScore() {
		Map<String, Integer> run = honest(1000);
		assertThat(this.rules.problemWith(1001, run, LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(1000, with(run, "level", 8), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(1000, with(run, "seconds", 1), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(1000, with(run, "seed", -1), LONG_SESSION)).isPresent();
	}

	@Test
	void obstaclesJumpsAndDucksMustBePlausible() {
		Map<String, Integer> run = honest(1000);
		assertThat(this.rules.problemWith(1000, with(run, "obstacles", 200), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(20_000, with(honest(20_000), "obstacles", 0), LONG_SESSION.multipliedBy(4))).isPresent();
		assertThat(this.rules.problemWith(1000, with(run, "jumps", 10_000), LONG_SESSION)).isPresent();
		assertThat(this.rules.problemWith(1000, with(with(run, "jumps", 0), "ducks", 0), LONG_SESSION)).isPresent();
		// Ducking counts too: bats are passed under.
		assertThat(this.rules.problemWith(1000, with(with(run, "jumps", 0), "ducks", run.get("obstacles")), LONG_SESSION)).isEmpty();
	}

	@Test
	void levelsFollowTheEnginesTable() {
		assertThat(DinoRunRunRules.levelFor(0)).isEqualTo(1);
		assertThat(DinoRunRunRules.levelFor(149)).isEqualTo(1);
		assertThat(DinoRunRunRules.levelFor(150)).isEqualTo(2);
		assertThat(DinoRunRunRules.levelFor(4500)).isEqualTo(8);
		assertThat(DinoRunRunRules.levelFor(1_000_000)).isEqualTo(8);
	}

}
