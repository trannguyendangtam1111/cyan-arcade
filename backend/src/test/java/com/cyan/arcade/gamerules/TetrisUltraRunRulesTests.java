package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Tetris Ultra's run rules, without the platform: what a real two-minute run looks like, and what cannot be one. */
class TetrisUltraRunRulesTests {

	private static final String ULTRA = "ultra";

	private static final int LIMIT = 120_000;

	private final TetrisRunRules rules = new TetrisRunRules();

	/** A full run: 20 lines in 60 pieces, time up, a little over two minutes of real time. */
	static Map<String, Integer> fullRun() {
		return details(20, 60, LIMIT, 1);
	}

	/** An early top-out: no lines, 25 pieces stacked in 9 seconds. */
	static Map<String, Integer> toppedOut() {
		return details(0, 25, 9_000, 0);
	}

	static Map<String, Integer> details(int lines, int pieces, int gameMs, int timeUp) {
		Map<String, Integer> details = new HashMap<>();
		details.put("lines", lines);
		details.put("level", lines / 10 + 1);
		details.put("pieces", pieces);
		details.put("gameMs", gameMs);
		details.put("timeUp", timeUp);
		return details;
	}

	private static Map<String, Integer> with(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	private Optional<String> judge(int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(ULTRA, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The mode ------------------------------------------------------------------------------------

	@Test
	void ultraIsDeclaredRankedHighestFirstInPointsAfterAnUnchangedClassic() {
		// The Challenge stages follow (`TetrisChallengeRunRulesTests`).
		assertThat(this.rules.modes()).startsWith(ModeSpec.CLASSIC,
				new ModeSpec("ultra", "Ultra", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, null),
				TetrisRunRules.SPRINT_MODE);
	}

	@Test
	void ultraReportsItsGameTimeAndClassicStillDoesNot() {
		assertThat(this.rules.details(ULTRA)).containsExactlyInAnyOrder("lines", "level", "pieces", "gameMs", "timeUp");
		assertThat(this.rules.details("classic")).isEqualTo(Set.of("lines", "level", "pieces"));
		assertThat(this.rules.details()).isEqualTo(Set.of("lines", "level", "pieces"));
	}

	// --- Real runs -----------------------------------------------------------------------------------

	@Test
	void aFullRunPasses() {
		assertThat(judge(5000, fullRun(), Duration.ofSeconds(125))).isEmpty();
		// Played straight through, a little faster than the server saw it start (the request's way there).
		assertThat(judge(5000, fullRun(), Duration.ofMillis(LIMIT - 1500))).isEmpty();
		// With every second of the pause allowance used.
		assertThat(judge(5000, fullRun(), Duration.ofMillis(LIMIT + 60_000 + 2_000))).isEmpty();
	}

	@Test
	void anEarlyTopOutPassesHoweverFewItsPieces() {
		assertThat(judge(300, toppedOut(), Duration.ofSeconds(10))).isEmpty();
		// A slow top-out: few pieces over a long time.
		assertThat(judge(0, details(0, 12, 60_000, 0), Duration.ofSeconds(70))).isEmpty();
		// The quickest: barely a step of game time, about ten pieces dropped at once.
		assertThat(judge(200, details(0, 10, 40, 0), Duration.ofSeconds(3))).isEmpty();
	}

	@Test
	void aRunThatKeptItsPiecesInPlayByTurningThemPasses() {
		// A rotation can kick a piece up a row (frontend engine), so turning it keeps it from locking:
		// the engine plays two minutes with no piece placed, and a top-out after a long spin is real too.
		assertThat(judge(0, details(0, 0, LIMIT, 1), Duration.ofSeconds(121))).isEmpty();
		assertThat(judge(0, details(0, 3, LIMIT, 1), Duration.ofSeconds(121))).isEmpty();
		assertThat(judge(150, details(0, 10, 100_000, 0), Duration.ofSeconds(101))).isEmpty();
		// Its game time and timeUp are still checked as ever.
		assertThat(judge(0, details(0, 0, LIMIT, 0), Duration.ofSeconds(121))).contains("timeUp does not match the game time");
	}

	// --- The clock -----------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 0, -40, LIMIT + 40, 1_000_000 })
	void gameTimeOutsideTheLimitIsRefused(int gameMs) {
		assertThat(judge(300, with(toppedOut(), "gameMs", gameMs), Duration.ofMinutes(30)))
			.contains("game time outside the mode's limit");
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 1_020, 9_001, LIMIT - 1 })
	void gameTimeOfPartStepsIsRefused(int gameMs) {
		assertThat(judge(300, with(toppedOut(), "gameMs", gameMs), Duration.ofSeconds(125)))
			.contains("game time not in whole steps");
	}

	@Test
	void timeUpMustMatchTheGameTime() {
		// Claiming the time ran out before it did.
		assertThat(judge(300, with(toppedOut(), "timeUp", 1), Duration.ofSeconds(10)))
			.contains("timeUp does not match the game time");
		// Reaching the limit without the time running out.
		assertThat(judge(5000, with(fullRun(), "timeUp", 0), Duration.ofSeconds(125)))
			.contains("timeUp does not match the game time");
		for (int timeUp : new int[] { 2, -1 }) {
			assertThat(judge(5000, with(fullRun(), "timeUp", timeUp), Duration.ofSeconds(125)))
				.contains("timeUp is neither 0 nor 1");
		}
	}

	@Test
	void gameTimeCannotOutrunTheSession() {
		// Two minutes of game time in a session of 1:58 is the most the latency allowance covers.
		assertThat(judge(5000, fullRun(), Duration.ofSeconds(118))).isEmpty();
		assertThat(judge(5000, fullRun(), Duration.ofMillis(117_990)))
			.contains("more game time than the session lasted");
		assertThat(judge(300, toppedOut(), Duration.ofSeconds(5))).contains("more game time than the session lasted");
	}

	@Test
	void theSessionCannotOutlastTheGameTimeByMoreThanThePauseAllowance() {
		assertThat(judge(5000, fullRun(), Duration.ofMillis(LIMIT + 62_000))).isEmpty();
		assertThat(judge(5000, fullRun(), Duration.ofMillis(LIMIT + 62_001)))
			.contains("paused for longer than the mode allows");
		// An early top-out gets the same allowance over its own game time, not the mode's two minutes.
		assertThat(judge(300, toppedOut(), Duration.ofSeconds(9 + 62))).isEmpty();
		assertThat(judge(300, toppedOut(), Duration.ofSeconds(9 + 63))).contains("paused for longer than the mode allows");
	}

	// --- The game's own consistency ------------------------------------------------------------------

	@Test
	void classicsConsistencyChecksStillApply() {
		Duration elapsed = Duration.ofSeconds(125);
		assertThat(judge(5000, with(fullRun(), "level", 2), elapsed)).contains("details do not match the score");
		// Twenty lines need at least 50 pieces.
		assertThat(judge(5000, with(fullRun(), "pieces", 49), elapsed)).contains("pieces do not match the lines");
		// Below twenty single lines, and above twenty fours with every piece hard-dropped from the top.
		assertThat(judge(2999, fullRun(), elapsed)).contains("details do not match the score");
		assertThat(judge(2 * 3000 + 44 * 60 + 1, fullRun(), elapsed)).contains("details do not match the score");
	}

	@Test
	void piecesArePacedByTheGameTime() {
		// 4 s of game time allow (4 + 2) × 10 = 60 pieces, however long the session.
		Map<String, Integer> run = details(20, 60, 4_000, 0);
		long score = TetrisRunRules.linePointsAtLeast(20);
		assertThat(judge((int) score, run, Duration.ofSeconds(60))).isEmpty();
		assertThat(judge((int) score, with(run, "pieces", 61), Duration.ofSeconds(60)))
			.contains("more pieces than the game time allows");
	}

	// --- Never judged as Classic ---------------------------------------------------------------------

	@Test
	void anUltraRunIsNeverJudgedByClassicsRulesAlone() {
		// Plausible in Classic, with Classic's details: without its clock it is no Ultra run.
		Map<String, Integer> classicOnly = Map.of("lines", 20, "level", 3, "pieces", 60);
		assertThat(this.rules.problemWith(5000, classicOnly, Duration.ofSeconds(125))).isEmpty();
		assertThat(this.rules.details(ULTRA)).isNotEqualTo(classicOnly.keySet());
		// The same run, its clock claiming a fourth minute: refused by Ultra's rules, which Classic does not have.
		assertThat(judge(5000, with(fullRun(), "gameMs", 180_000), Duration.ofMinutes(3))).isPresent();
	}

	@Test
	void anyOtherModeIsRefusedNotJudgedAsClassic() {
		Map<String, Integer> classicRun = Map.of("lines", 20, "level", 3, "pieces", 60);
		assertThat(this.rules.problemWith("marathon", UUID.randomUUID(), 5000, classicRun, Duration.ofSeconds(125)))
			.hasValueSatisfying((problem) -> assertThat(problem).startsWith(RunRules.NO_RULES_FOR_MODE));
		assertThat(this.rules.problemWith("classic", UUID.randomUUID(), 5000, classicRun, Duration.ofSeconds(125)))
			.isEmpty();
	}

	// --- Completion ----------------------------------------------------------------------------------

	@Test
	void onlyAnUltraRunWhoseTimeRanOutCompletesIt() {
		assertThat(this.rules.completes(ULTRA, fullRun())).isTrue();
		assertThat(this.rules.completes(ULTRA, toppedOut())).isFalse();
		// Classic as always; a mode Tetris does not define completes nothing.
		assertThat(this.rules.completes("classic", Map.of("lines", 0, "level", 1, "pieces", 3))).isTrue();
		assertThat(this.rules.completes("marathon", fullRun())).isFalse();
	}

}
