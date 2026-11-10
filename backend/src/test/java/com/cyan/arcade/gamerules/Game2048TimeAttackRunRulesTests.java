package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 2048 Time Attack's run rules, without the platform: what a real two-minute run looks like against
 * the server's clock, and what cannot be one.
 */
class Game2048TimeAttackRunRulesTests {

	private static final String TIME_ATTACK = "time-attack";

	/** Two minutes of game time and a few seconds of pauses and requests. */
	private static final Duration PLAYED = Duration.ofSeconds(125);

	private final Game2048RunRules rules = new Game2048RunRules();

	/** A run whose time ran out: 400 moves, a 512 on the board (a good player scores about 6,000). */
	static Map<String, Integer> timeUp() {
		return details(512, 400, 120_000, 1);
	}

	/** A run stuck on a full board after 45 seconds and 120 moves, with a 64 at most. */
	static Map<String, Integer> stuck() {
		return details(64, 120, 45_000, 0);
	}

	static Map<String, Integer> details(int highestTile, int moves, int gameMs, int timeUp) {
		Map<String, Integer> details = new HashMap<>();
		details.put("highestTile", highestTile);
		details.put("moves", moves);
		details.put("gameMs", gameMs);
		details.put("timeUp", timeUp);
		return details;
	}

	private Optional<String> judge(int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(TIME_ATTACK, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The mode ------------------------------------------------------------------------------------

	@Test
	void timeAttackIsDeclaredRankedHighestFirstInPointsAfterClassicAndMovesLimit() {
		assertThat(this.rules.modes()).startsWith(ModeSpec.CLASSIC, Game2048RunRules.MOVES,
				new ModeSpec("time-attack", "Time Attack", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, 80_608));
		assertThat(this.rules.details(TIME_ATTACK)).containsExactlyInAnyOrder("highestTile", "moves", "gameMs", "timeUp");
		// Classic and Moves Limit report what they always did.
		assertThat(this.rules.details("classic")).containsExactlyInAnyOrder("highestTile", "moves");
		assertThat(this.rules.details("moves")).containsExactlyInAnyOrder("highestTile", "moves");
	}

	@Test
	void theHighestScoreIsTheMostTheFastestPaceCanMakeInTwoMinutes() {
		// 15 moves a second over 120 s, plus the 2 s latency allowance: 1830 moves, 8 + 4 × 1830 = 7328 on
		// the board at most, so a 4096 at best: 7328 × 11.
		assertThat(Game2048RunRules.mostMovesIn(120_000)).isEqualTo(1830);
		assertThat(Game2048RunRules.mostPointsIn(1830)).isEqualTo(80_608);
		assertThat(judge(80_608, details(4096, 1830, 120_000, 1), PLAYED)).isEmpty();
		assertThat(judge(80_612, details(4096, 1830, 120_000, 1), PLAYED)).isPresent();
	}

	// --- Accepted runs -------------------------------------------------------------------------------

	@Test
	void aRunWhoseTimeRanOutIsAcceptedAndCompletesTheMode() {
		assertThat(judge(6000, timeUp(), PLAYED)).isEmpty();
		assertThat(this.rules.completes(TIME_ATTACK, timeUp())).isTrue();
	}

	@Test
	void aRunStuckBeforeTheTimeIsUpIsAcceptedButDoesNotComplete() {
		assertThat(judge(600, stuck(), Duration.ofSeconds(50))).isEmpty();
		assertThat(this.rules.completes(TIME_ATTACK, stuck())).isFalse();
		// The fewest moves a board is stuck after, and the last step before the limit.
		assertThat(judge(0, details(4, 14, 2_000, 0), Duration.ofSeconds(3))).isEmpty();
		assertThat(judge(600, details(64, 120, 119_990, 0), PLAYED)).isEmpty();
	}

	@Test
	void aSingleMoveThenWaitingOutTheClockIsARealRun() {
		assertThat(judge(0, details(4, 1, 120_000, 1), PLAYED)).isEmpty();
	}

	// --- The clock -----------------------------------------------------------------------------------

	@Test
	void theTimeIsUpExactlyAtTwoMinutesAndAtNoOtherGameTime() {
		assertThat(judge(6000, details(512, 400, 120_000, 1), PLAYED)).isEmpty();
		assertThat(judge(6000, details(512, 400, 120_000, 0), PLAYED)).contains("timeUp does not match the game time");
		assertThat(judge(6000, details(512, 400, 119_990, 1), PLAYED)).contains("timeUp does not match the game time");
		assertThat(judge(6000, details(512, 400, 60_000, 1), PLAYED)).contains("timeUp does not match the game time");
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, -10, 120_010, 130_000, Integer.MAX_VALUE })
	void gameTimeOutsideTheLimitIsRefused(int gameMs) {
		assertThat(judge(600, details(64, 120, gameMs, 0), PLAYED)).contains("game time outside the mode's limit");
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 15, 44_995, 119_999 })
	void gameTimeOutOfStepIsRefused(int gameMs) {
		assertThat(judge(600, details(64, 120, gameMs, 0), PLAYED)).contains("game time not in whole steps");
	}

	@Test
	void timeUpIsZeroOrOne() {
		assertThat(judge(6000, details(512, 400, 120_000, 2), PLAYED)).contains("timeUp is neither 0 nor 1");
	}

	@Test
	void tooFewMovesForTheRunToHaveEndedAreRefused() {
		assertThat(judge(0, details(4, 0, 120_000, 1), PLAYED)).contains("too few moves for the run to have ended");
		assertThat(judge(0, details(4, 13, 30_000, 0), PLAYED)).contains("too few moves for the run to have ended");
	}

	// --- Against the server's clock ------------------------------------------------------------------

	@Test
	void gameTimeNeverRunsAheadOfTheSessionBeyondTheLatencyAllowance() {
		// Two minutes of game time in a session of 118 s: the 2 s for the requests, no more.
		assertThat(judge(6000, timeUp(), Duration.ofSeconds(118))).isEmpty();
		assertThat(judge(6000, timeUp(), Duration.ofMillis(117_990))).contains("more game time than the session lasted");
		assertThat(judge(6000, timeUp(), Duration.ofSeconds(60))).contains("more game time than the session lasted");
		assertThat(judge(600, stuck(), Duration.ofMillis(42_990))).contains("more game time than the session lasted");
	}

	@Test
	void theSessionMayOutlastTheGameTimeByTheSixtySecondPauseAllowanceAndTheLatencyAllowanceOnly() {
		// 120 s of game time, 60 s of pauses and 2 s for the requests.
		assertThat(judge(6000, timeUp(), Duration.ofSeconds(182))).isEmpty();
		assertThat(judge(6000, timeUp(), Duration.ofMillis(182_001))).contains("paused for longer than the mode allows");
		assertThat(judge(6000, timeUp(), Duration.ofMinutes(10))).contains("paused for longer than the mode allows");
		// A stuck run is held to its own game time: 45 s + 62 s.
		assertThat(judge(600, stuck(), Duration.ofSeconds(107))).isEmpty();
		assertThat(judge(600, stuck(), Duration.ofSeconds(108))).contains("paused for longer than the mode allows");
	}

	// --- Pace and Classic's checks -------------------------------------------------------------------

	@Test
	void atMostFifteenMovesASecondOfGameTime() {
		assertThat(judge(10_000, details(1024, 1830, 120_000, 1), PLAYED)).isEmpty();
		assertThat(judge(10_000, details(1024, 1831, 120_000, 1), PLAYED)).contains("more moves than the game time allows");
		// 45 s + 2 s at 15 a second: 705 moves.
		assertThat(judge(5000, details(512, 705, 45_000, 0), Duration.ofSeconds(50))).isEmpty();
		assertThat(judge(5000, details(512, 706, 45_000, 0), Duration.ofSeconds(50)))
			.contains("more moves than the game time allows");
	}

	@Test
	void classicConsistencyChecksStillApply() {
		// Not a 2048 score, a tile that is not a power of two, and a score the tile and moves cannot make.
		assertThat(judge(6002, timeUp(), PLAYED)).contains("not a 2048 result");
		assertThat(judge(6000, details(500, 400, 120_000, 1), PLAYED)).contains("not a 2048 result");
		assertThat(judge(20_480, details(2048, 400, 120_000, 1), PLAYED)).contains("details do not match the score");
		assertThat(judge(1000, timeUp(), PLAYED)).contains("details do not match the score");
	}

	// --- Classic and Moves Limit -------------------------------------------------------------------------

	@Test
	void classicAndMovesLimitRunsAreJudgedAsBefore() {
		Map<String, Integer> classic = Game2048MovesRunRulesTests.details(2048, 1200);
		assertThat(this.rules.problemWith("classic", UUID.randomUUID(), 20_480, classic, Duration.ofHours(1))).isEmpty();
		assertThat(this.rules.completes("classic", classic)).isTrue();
		assertThat(this.rules.problemWith("moves", UUID.randomUUID(), 4500, Game2048MovesRunRulesTests.fullRun(),
				Duration.ofMinutes(5)))
			.isEmpty();
		assertThat(this.rules.completes("moves", Game2048MovesRunRulesTests.fullRun())).isTrue();
		assertThat(this.rules.completes("moves", Game2048MovesRunRulesTests.stuck())).isFalse();
		// An undeclared mode is still refused, never judged as Classic.
		assertThat(this.rules.problemWith("puzzle-7", UUID.randomUUID(), 600, classic, Duration.ofHours(1))).isPresent();
	}

}
