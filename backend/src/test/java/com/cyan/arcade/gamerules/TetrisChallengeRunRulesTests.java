package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.gamerules.TetrisRunRules.Stage;
import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tetris Challenge's run rules, without the platform: what a cleared stage looks like, stage by stage,
 * and what cannot be one (a failed attempt, the wrong objective, impossible garbage, time or pace).
 */
class TetrisChallengeRunRulesTests {

	private final TetrisRunRules rules = new TetrisRunRules();

	/**
	 * A plausible clear of each stage: 1–5 are what the AI did on their fixed seeds in TET-005a; 6 is
	 * the shape of a clear on another seed (the AI does not clear stage 6's own).
	 */
	static Map<String, Integer> cleared(int stage) {
		return switch (stage) {
			case 1 -> details(6, 10, 9_680, 4);
			case 2 -> details(10, 14, 12_880, 6);
			case 3 -> details(30, 55, 48_720, 10);
			case 4 -> details(15, 27, 24_520, 5);
			case 5 -> details(20, 39, 32_480, 7);
			case 6 -> details(20, 31, 24_200, 11);
			default -> throw new IllegalArgumentException("No stage " + stage);
		};
	}

	static Map<String, Integer> details(int lines, int pieces, int gameMs, int garbage) {
		Map<String, Integer> details = new HashMap<>();
		details.put("lines", lines);
		details.put("pieces", pieces);
		details.put("gameMs", gameMs);
		details.put("garbage", garbage);
		return details;
	}

	private static Map<String, Integer> with(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	/** Played in its game time and a little more of real time: the requests' way there. */
	private static Duration playedFor(Map<String, Integer> details) {
		return Duration.ofMillis(details.get("gameMs") + 2_000);
	}

	private Optional<String> judge(int stage, Map<String, Integer> details) {
		return judge(stage, details, playedFor(details));
	}

	private Optional<String> judge(int stage, Map<String, Integer> details, Duration elapsed) {
		return judge(stage, details.get("gameMs"), details, elapsed);
	}

	private Optional<String> judge(int stage, int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith("challenge-" + stage, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The modes -----------------------------------------------------------------------------------

	@Test
	void theSixStagesAreTheFrontendsOwn() {
		// The same table as `frontend/src/games/tetris/stages.ts` (pinned there by tetrisChallenge.test.ts).
		assertThat(TetrisRunRules.CHALLENGE_STAGES).containsExactly(new Stage(1, "Clean-up", 4, 0, 0, 120_000),
				new Stage(2, "Ten on top", 6, 0, 10, 120_000), new Stage(3, "Deep dig", 10, 0, 0, 180_000),
				new Stage(4, "Rising tide", 4, 10, 15, 180_000), new Stage(5, "Pressure", 6, 7, 20, 180_000),
				new Stage(6, "Last stand", 8, 8, 0, 240_000));
	}

	@Test
	void eachStageIsAnUnrankedTimedModeAfterClassicUltraAndSprint() {
		List<ModeSpec> modes = this.rules.modes();

		assertThat(modes).startsWith(ModeSpec.CLASSIC, TetrisRunRules.ULTRA_MODE, TetrisRunRules.SPRINT_MODE);
		assertThat(modes.subList(3, modes.size())).containsExactly(
				new ModeSpec("challenge-1", "Challenge 1: Clean-up", false, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS,
						120_000),
				new ModeSpec("challenge-2", "Challenge 2: Ten on top", false, ModeSpec.Order.ASC,
						ModeSpec.Unit.MILLISECONDS, 120_000),
				new ModeSpec("challenge-3", "Challenge 3: Deep dig", false, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS,
						180_000),
				new ModeSpec("challenge-4", "Challenge 4: Rising tide", false, ModeSpec.Order.ASC,
						ModeSpec.Unit.MILLISECONDS, 180_000),
				new ModeSpec("challenge-5", "Challenge 5: Pressure", false, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS,
						180_000),
				new ModeSpec("challenge-6", "Challenge 6: Last stand", false, ModeSpec.Order.ASC,
						ModeSpec.Unit.MILLISECONDS, 240_000));
	}

	@Test
	void aStageReportsItsGarbageAndTheOtherModesAreAsTheyWere() {
		for (int stage = 1; stage <= 6; stage++) {
			assertThat(this.rules.details("challenge-" + stage)).containsExactlyInAnyOrder("lines", "pieces", "gameMs",
					"garbage");
		}
		assertThat(this.rules.details("classic")).isEqualTo(Set.of("lines", "level", "pieces"));
		assertThat(this.rules.details("ultra")).isEqualTo(TetrisRunRules.ULTRA_DETAILS);
		assertThat(this.rules.details("sprint")).isEqualTo(TetrisRunRules.SPRINT_DETAILS);
	}

	@Test
	void noStageCompletesAnything() {
		for (int stage = 1; stage <= 6; stage++) {
			assertThat(this.rules.completes("challenge-" + stage, cleared(stage))).isFalse();
		}
		// Ultra and Sprint as before.
		assertThat(this.rules.completes("sprint", Map.of("lines", 40))).isTrue();
		assertThat(this.rules.completes("ultra", Map.of("timeUp", 1))).isTrue();
		assertThat(this.rules.completes("ultra", Map.of("timeUp", 0))).isFalse();
	}

	@Test
	void anUndeclaredStageIsRefusedNeverJudgedAsClassic() {
		assertThat(judge(7, cleared(1)))
			.hasValueSatisfying((problem) -> assertThat(problem).startsWith(RunRules.NO_RULES_FOR_MODE));
	}

	// --- Clears --------------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aClearPasses(int stage) {
		assertThat(judge(stage, cleared(stage))).isEmpty();
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aClearMayHavePausedForUpToTheAllowance(int stage) {
		Map<String, Integer> clear = cleared(stage);
		Duration longest = Duration.ofMillis(clear.get("gameMs")).plusSeconds(62);

		assertThat(judge(stage, clear, longest)).isEmpty();
		assertThat(judge(stage, clear, longest.plusSeconds(1))).contains("paused for longer than the mode allows");
	}

	@Test
	void aClearJustShortOfTheLimitPasses() {
		// Stage 1: the last step before two minutes.
		Map<String, Integer> clear = with(cleared(1), "gameMs", 119_960);
		assertThat(judge(1, clear)).isEmpty();
	}

	// --- Failed attempts and the wrong objective ------------------------------------------------------

	@Test
	void aDigStageWithGarbageLeftWasNotCleared() {
		// A top-out on stage 1 with three of its four rows dug.
		assertThat(judge(1, details(5, 12, 9_680, 3))).contains("garbage left: the stage was not cleared");
		// Stage 6: every row that rose must go too (8 + 30 / 8 = 11 rows by the 31st piece).
		assertThat(judge(6, with(cleared(6), "garbage", 10))).contains("garbage left: the stage was not cleared");
	}

	@Test
	void aLineStageShortOfItsGoalWasNotCleared() {
		assertThat(judge(2, details(9, 14, 12_880, 6))).contains("fewer lines than the stage's goal");
		assertThat(judge(5, details(19, 39, 32_480, 7))).contains("fewer lines than the stage's goal");
	}

	@Test
	void aLineStageEndsAtTheClearThatReachesItsGoal() {
		// Stage 2's goal is 10: the clear that reaches it takes at most four lines, so 13 at most.
		assertThat(judge(2, details(13, 20, 12_880, 6))).isEmpty();
		assertThat(judge(2, details(14, 20, 12_880, 6))).contains("more lines than the clear that reached the goal");
	}

	@Test
	void aTimeoutIsRefused() {
		// The run that reaches the limit has timed out.
		assertThat(judge(1, with(cleared(1), "gameMs", 120_000))).contains("game time outside the mode's limit");
		assertThat(judge(6, with(cleared(6), "gameMs", 240_000))).contains("game time outside the mode's limit");
	}

	// --- Garbage -------------------------------------------------------------------------------------

	@Test
	void noMoreGarbageIsClearedThanTheStagePutOnTheBoard() {
		// Stage 2 starts with six rows and none rise.
		assertThat(judge(2, details(10, 14, 12_880, 7)))
			.contains("more garbage cleared than the stage put on the board");
		// Stage 4: 4 rows, then one after pieces 10 and 20; by the 27th piece, six.
		assertThat(judge(4, details(15, 27, 24_520, 6))).isEmpty();
		assertThat(judge(4, details(15, 27, 24_520, 7)))
			.contains("more garbage cleared than the stage put on the board");
		assertThat(judge(4, details(15, 27, 24_520, -1)))
			.contains("more garbage cleared than the stage put on the board");
	}

	@Test
	void garbageRowsAreLines() {
		assertThat(judge(1, details(3, 10, 9_680, 4))).contains("more garbage rows than lines cleared");
	}

	@Test
	void noRowRisesAfterThePieceThatClearedTheStage() {
		Stage lastStand = TetrisRunRules.CHALLENGE_STAGES.get(5);
		assertThat(lastStand.garbageAddedBy(1)).isEqualTo(8);
		// A row rises after the 8th piece, unless it was the one that cleared the stage.
		assertThat(lastStand.garbageAddedBy(8)).isEqualTo(8);
		assertThat(lastStand.garbageAddedBy(9)).isEqualTo(9);
		assertThat(lastStand.garbageAddedBy(16)).isEqualTo(9);
		assertThat(lastStand.garbageAddedBy(17)).isEqualTo(10);
		assertThat(TetrisRunRules.CHALLENGE_STAGES.get(0).garbageAddedBy(500)).isEqualTo(4);
	}

	@Test
	void thePiecesMatchTheLinesAndGarbage() {
		// Stage 2: ten lines of pieces need 100 cells, more than 20 pieces bring.
		assertThat(judge(2, details(10, 20, 12_880, 0))).contains("pieces do not match the lines");
		// But six of them garbage rows need only 4 × 10 + 6 = 46 cells.
		assertThat(judge(2, details(10, 12, 12_880, 6))).isEmpty();
		assertThat(judge(2, details(10, 11, 12_880, 6))).contains("pieces do not match the lines");
		// And no more than a full board is left over.
		assertThat(judge(1, details(6, 57, 9_680, 4))).contains("pieces do not match the lines");
		assertThat(judge(1, details(6, 0, 9_680, 4))).contains("no pieces");
	}

	// --- Time and pace -------------------------------------------------------------------------------

	@Test
	void theScoreIsTheGameTime() {
		Map<String, Integer> clear = cleared(3);
		assertThat(judge(3, 5_000, clear, playedFor(clear))).contains("score is not the game time");
	}

	@Test
	void gameTimeIsInWholeStepsAndNeverAheadOfTheSession() {
		assertThat(judge(3, with(cleared(3), "gameMs", 48_730))).contains("game time not in whole steps");
		assertThat(judge(3, cleared(3), Duration.ofSeconds(40))).contains("more game time than the session lasted");
		assertThat(judge(3, with(cleared(3), "gameMs", 0))).contains("game time outside the mode's limit");
	}

	@Test
	void piecesArePlacedAtAPersonsPace() {
		// 55 pieces in three seconds of game time.
		assertThat(judge(3, with(cleared(3), "gameMs", 3_000), Duration.ofSeconds(5)))
			.contains("more pieces than the game time allows");
	}

}
