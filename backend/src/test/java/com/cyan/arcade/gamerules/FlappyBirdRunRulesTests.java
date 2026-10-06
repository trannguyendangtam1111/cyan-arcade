package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Flappy Bird's rules on their own, without the server around them: what a real flight's numbers
 * look like, and every way a made-up one gives itself away.
 */
class FlappyBirdRunRulesTests {

	private final FlappyBirdRunRules rules = new FlappyBirdRunRules();

	// --- The course's timing ------------------------------------------------------------------------

	@Test
	void passTimesAreTheEnginesToTheMillisecond() {
		// Computed by the frontend's difficulty.ts (passTimeMs): the two tables must stay the same.
		Map<Integer, Double> engine = Map.of(0, 2733.333, 4, 9400.0, 5, 10950.633, 14, 24906.329, 15, 26334.901, 29,
				46334.901, 30, 47634.901, 50, 73522.401, 99, 129228.283, 100, 130228.283);
		engine.forEach((pipe, ms) -> assertThat(FlappyBirdRunRules.passTimeMs(pipe)).as("pipe %d", pipe)
			.isCloseTo(ms, within(0.01)));
	}

	@Test
	void theDifficultyTableOnlyEverGetsHarder() {
		for (int i = 1; i < FlappyBirdRunRules.LEVELS.size(); i++) {
			FlappyBirdRunRules.Level before = FlappyBirdRunRules.LEVELS.get(i - 1);
			FlappyBirdRunRules.Level level = FlappyBirdRunRules.LEVELS.get(i);
			assertThat(level.level()).isEqualTo(before.level() + 1);
			assertThat(level.fromPipe()).isGreaterThan(before.fromPipe());
			assertThat(level.speed()).isGreaterThan(before.speed());
			assertThat(level.spacing()).isLessThanOrEqualTo(before.spacing());
		}
		assertThat(FlappyBirdRunRules.levelFor(0).level()).isEqualTo(1);
		assertThat(FlappyBirdRunRules.levelFor(4).level()).isEqualTo(1);
		assertThat(FlappyBirdRunRules.levelFor(5).level()).isEqualTo(2);
		assertThat(FlappyBirdRunRules.levelFor(5000).level()).isEqualTo(7);
	}

	// --- Real flights -------------------------------------------------------------------------------

	@Test
	void realFlightsArePlausible() {
		// A crash into the very first pipe, a short flight, and a long one.
		assertThat(this.rules.problemWith(0, flight(0, 4, 2500), Duration.ofMillis(2600))).isEmpty();
		assertThat(this.rules.problemWith(10, flight(10, 30, 18_000), Duration.ofSeconds(19))).isEmpty();
		assertThat(this.rules.problemWith(100, flight(100, 220, 130_000), Duration.ofSeconds(131))).isEmpty();
		// Falling straight to the ground after the first flap.
		assertThat(this.rules.problemWith(0, flight(0, 1, 900), Duration.ofSeconds(1))).isEmpty();
	}

	@Test
	void networkDelayAndPausesAreAllowedFor() {
		// The server started its clock a little late: the flight looks up to two seconds longer than the session.
		assertThat(this.rules.problemWith(10, flight(10, 30, 18_000), Duration.ofMillis(16_100))).isEmpty();
		// The player paused for ten minutes: the session is far longer than the flight.
		assertThat(this.rules.problemWith(10, flight(10, 30, 18_000), Duration.ofMinutes(10))).isEmpty();
		// The pass is noticed at the end of a step, and frames are not perfectly regular.
		double firstPass = FlappyBirdRunRules.passTimeMs(0);
		assertThat(this.rules.problemWith(1, flight(1, 5, (int) firstPass - 100), Duration.ofSeconds(5))).isEmpty();
	}

	// --- Made-up flights ----------------------------------------------------------------------------

	@Test
	void detailsMustMatchTheScore() {
		Duration session = Duration.ofSeconds(30);
		// More pipes reported than points claimed, or the other way round.
		assertThat(this.rules.problemWith(11, flight(10, 30, 18_000), session)).isPresent();
		// The wrong level for the pipes passed.
		Map<String, Integer> wrongLevel = flight(10, 30, 18_000);
		wrongLevel.put("level", 1);
		assertThat(this.rules.problemWith(10, wrongLevel, session)).isPresent();
		// Seconds that are not the flight time.
		Map<String, Integer> wrongSeconds = flight(10, 30, 18_000);
		wrongSeconds.put("seconds", 60);
		assertThat(this.rules.problemWith(10, wrongSeconds, session)).isPresent();
	}

	@Test
	void pipesMustMatchTheFlightTime() {
		Duration session = Duration.ofMinutes(5);
		// Ten pipes in five seconds: the world never moves that fast.
		assertThat(this.rules.problemWith(10, flight(10, 10, 5_000), session)).isPresent();
		// Only three pipes in a minute: the bird would have flown past many more, or crashed long before.
		assertThat(this.rules.problemWith(3, flight(3, 100, 60_000), session)).isPresent();
		// A crash before the first pipe that took longer than reaching it.
		assertThat(this.rules.problemWith(0, flight(0, 8, 4_000), session)).isPresent();
	}

	@Test
	void theFlightCannotOutlastTheSession() {
		// A 130-second flight in a session the server saw open for 60 seconds.
		assertThat(this.rules.problemWith(100, flight(100, 220, 130_000), Duration.ofSeconds(60))).isPresent();
		// Just past the latency allowance.
		Duration justShort = Duration.ofMillis(18_000).minus(RunRules.LATENCY_ALLOWANCE).minusMillis(1);
		assertThat(this.rules.problemWith(10, flight(10, 30, 18_000), justShort)).isPresent();
	}

	@Test
	void flapsMustBeHumanlyPossibleAndEnoughToStayUp() {
		Duration session = Duration.ofMinutes(3);
		// Not one flap: the flight starts with one.
		assertThat(this.rules.problemWith(0, flight(0, 0, 1_000), session)).isPresent();
		// Five flaps in two minutes: the bird would have hit the ground long ago.
		assertThat(this.rules.problemWith(100, flight(100, 5, 130_000), session)).isPresent();
		// Thirty flaps a second for eighteen seconds.
		assertThat(this.rules.problemWith(10, flight(10, 540, 18_000), session)).isPresent();
		// A very busy but human thumb: twelve a second.
		assertThat(this.rules.problemWith(10, flight(10, 216, 18_000), session)).isEmpty();
	}

	// --- Helpers -------------------------------------------------------------------------------------

	/** A flight's details as the game reports them, with level and seconds worked out like it does. */
	private static Map<String, Integer> flight(int pipes, int flaps, int flightMs) {
		Map<String, Integer> details = new HashMap<>();
		details.put("pipes", pipes);
		details.put("flaps", flaps);
		details.put("flightMs", flightMs);
		details.put("seconds", flightMs / 1000);
		details.put("level", FlappyBirdRunRules.levelFor(pipes).level());
		details.put("seed", 12345);
		return details;
	}

}
