package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Tetris Sprint's run rules, without the platform: what a finished 40-line race looks like, and what cannot be one. */
class TetrisSprintRunRulesTests {

	private static final String SPRINT = "sprint";

	private static final int LIMIT = 300_000;

	private final TetrisRunRules rules = new TetrisRunRules();

	/** A finished sprint: 40 lines in 100 pieces, a minute of game time. */
	static Map<String, Integer> finished() {
		return finishedIn(60_000);
	}

	/** The same sprint, finished in this much game time. */
	static Map<String, Integer> finishedIn(int gameMs) {
		return details(40, 100, gameMs);
	}

	static Map<String, Integer> details(int lines, int pieces, int gameMs) {
		Map<String, Integer> details = new HashMap<>();
		details.put("lines", lines);
		details.put("level", lines / 10 + 1);
		details.put("pieces", pieces);
		details.put("gameMs", gameMs);
		return details;
	}

	private static Map<String, Integer> with(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	/** Judges a run whose score is its own game time, as the client sends it. */
	private Optional<String> judge(Map<String, Integer> details, Duration elapsed) {
		return judge(details.get("gameMs"), details, elapsed);
	}

	private Optional<String> judge(int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(SPRINT, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The mode ------------------------------------------------------------------------------------

	@Test
	void sprintIsDeclaredRankedFastestFirstInMillisecondsBelowItsLimit() {
		assertThat(this.rules.modes()).startsWith(ModeSpec.CLASSIC, TetrisRunRules.ULTRA_MODE,
				new ModeSpec("sprint", "Sprint", true, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS, LIMIT));
	}

	@Test
	void sprintReportsItsGameTimeAndNoTimeUp() {
		assertThat(this.rules.details(SPRINT)).containsExactlyInAnyOrder("lines", "level", "pieces", "gameMs");
		// Classic's and Ultra's are as they were.
		assertThat(this.rules.details("classic")).isEqualTo(Set.of("lines", "level", "pieces"));
		assertThat(this.rules.details("ultra")).contains("timeUp");
	}

	// --- Finished sprints ----------------------------------------------------------------------------

	@Test
	void aFinishedSprintPasses() {
		assertThat(judge(finished(), Duration.ofSeconds(62))).isEmpty();
		// Played straight through, a little faster than the server saw it start.
		assertThat(judge(finished(), Duration.ofMillis(58_500))).isEmpty();
		// A slow one, a step short of the limit.
		assertThat(judge(details(40, 140, LIMIT - 40), Duration.ofSeconds(301))).isEmpty();
	}

	@Test
	void theClearThatReachesTheGoalMayGoPastIt() {
		// 39 lines, then a Tetris: 43, the most a finished sprint can have.
		assertThat(judge(details(43, 108, 70_000), Duration.ofSeconds(71))).isEmpty();
		assertThat(judge(details(44, 110, 70_000), Duration.ofSeconds(71)))
			.contains("more lines than the clear that reached the goal");
	}

	@Test
	void theFastestSprintIsBoundedByThePace() {
		// 100 pieces at most ten a second, with the latency allowance: 8 s of game time and of real time.
		assertThat(judge(finishedIn(8_000), Duration.ofSeconds(8))).isEmpty();
		assertThat(judge(finishedIn(7_960), Duration.ofSeconds(8))).contains("more pieces than the game time allows");
		assertThat(judge(finishedIn(8_000), Duration.ofMillis(7_990))).contains("more pieces than the time allows");
	}

	@Test
	void aPauseWithinTheAllowancePassesAndALongerOneDoesNot() {
		assertThat(judge(finished(), Duration.ofMillis(60_000 + 62_000))).isEmpty();
		assertThat(judge(finished(), Duration.ofMillis(60_000 + 62_001)))
			.contains("paused for longer than the mode allows");
	}

	// --- Failed attempts -----------------------------------------------------------------------------

	@Test
	void aTopOutBeforeTheGoalIsRefused() {
		assertThat(judge(details(25, 70, 45_000), Duration.ofSeconds(46))).contains("fewer lines than the sprint's goal");
		assertThat(judge(details(39, 100, 60_000), Duration.ofSeconds(61))).contains("fewer lines than the sprint's goal");
	}

	@Test
	void aTimeoutIsRefused() {
		// The run that reaches the limit has timed out, whatever it reports.
		assertThat(judge(details(30, 90, LIMIT), Duration.ofSeconds(301))).contains("game time outside the mode's limit");
		assertThat(judge(details(40, 140, LIMIT), Duration.ofSeconds(301))).contains("game time outside the mode's limit");
	}

	// --- The clock and the score ---------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 0, -40, LIMIT + 40, 1_000_000 })
	void gameTimeOutsideTheLimitIsRefused(int gameMs) {
		assertThat(judge(with(finished(), "gameMs", gameMs), Duration.ofMinutes(30)))
			.contains("game time outside the mode's limit");
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 60_001, 60_020, LIMIT - 41 })
	void gameTimeOfPartStepsIsRefused(int gameMs) {
		assertThat(judge(finishedIn(gameMs), Duration.ofMillis(gameMs))).contains("game time not in whole steps");
	}

	@Test
	void gameTimeCannotOutrunTheSession() {
		assertThat(judge(finished(), Duration.ofSeconds(58))).isEmpty();
		assertThat(judge(finished(), Duration.ofMillis(57_990))).contains("more game time than the session lasted");
	}

	@Test
	void theScoreIsTheGameTimeAndNothingElse() {
		// Tetris points in place of the time, and a time a step faster than the run's own.
		assertThat(judge(5000, finished(), Duration.ofSeconds(62))).contains("score is not the game time");
		assertThat(judge(59_960, finished(), Duration.ofSeconds(62))).contains("score is not the game time");
	}

	@Test
	void theBoardsConsistencyChecksApply() {
		Duration elapsed = Duration.ofSeconds(62);
		assertThat(judge(with(finished(), "level", 4), elapsed)).contains("details do not match the score");
		// Forty lines need at least 100 pieces, and leave no more than the board holds.
		assertThat(judge(details(40, 99, 60_000), elapsed)).contains("pieces do not match the lines");
		assertThat(judge(details(40, 151, 60_000), elapsed)).contains("pieces do not match the lines");
	}

	// --- Completion ----------------------------------------------------------------------------------

	@Test
	void aSprintCompletesByClearingItsLines() {
		assertThat(this.rules.completes(SPRINT, finished())).isTrue();
		assertThat(this.rules.completes(SPRINT, details(43, 108, 70_000))).isTrue();
		assertThat(this.rules.completes(SPRINT, details(39, 100, 60_000))).isFalse();
		// Classic and Ultra as before.
		assertThat(this.rules.completes("classic", Map.of("lines", 0, "level", 1, "pieces", 3))).isTrue();
		assertThat(this.rules.completes("ultra", TetrisUltraRunRulesTests.fullRun())).isTrue();
		assertThat(this.rules.completes("ultra", TetrisUltraRunRulesTests.toppedOut())).isFalse();
	}

	@Test
	void aSprintIsNeverJudgedAsClassicOrUltra() {
		// A plausible Classic run, sent as a sprint: without its clock it is no sprint.
		Map<String, Integer> classic = Map.of("lines", 40, "level", 5, "pieces", 100);
		assertThat(this.rules.problemWith(12_000, classic, Duration.ofSeconds(62))).isEmpty();
		assertThat(this.rules.details(SPRINT)).isNotEqualTo(classic.keySet());
		// A full Ultra run's numbers fail a sprint's goal.
		assertThat(judge(120_000, TetrisUltraRunRulesTests.fullRun(), Duration.ofSeconds(125)))
			.contains("fewer lines than the sprint's goal");
	}

}
