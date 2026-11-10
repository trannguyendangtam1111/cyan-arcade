package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.gamerules.Game2048RunRules.PuzzleStage;
import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/**
 * 2048 Puzzle's run rules, without the platform: the six stages as the frontend defines them, the clears
 * the game's own players made of them, and what cannot be one. The server does not replay the board, so
 * these are bounds, not proof: they pass every real clear and refuse what no play from the stage's start
 * can reach.
 */
class Game2048PuzzleRunRulesTests {

	private static final Duration FIVE_MINUTES = Duration.ofMinutes(5);

	private final Game2048RunRules rules = new Game2048RunRules();

	private static Map<String, Integer> clear(int highestTile, int moves) {
		return Game2048MovesRunRulesTests.details(highestTile, moves);
	}

	private Optional<String> judge(String mode, int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(mode, UUID.randomUUID(), score, details, elapsed);
	}

	private Optional<String> judge(String mode, int score, Map<String, Integer> details) {
		return judge(mode, score, details, FIVE_MINUTES);
	}

	// --- The modes -----------------------------------------------------------------------------------

	@Test
	void theSixStagesAreDeclaredUnrankedAfterTheRankedModes() {
		assertThat(this.rules.modes()).extracting(ModeSpec::id)
			.containsExactly("classic", "moves", "time-attack", "puzzle-1", "puzzle-2", "puzzle-3", "puzzle-4", "puzzle-5",
					"puzzle-6");
		assertThat(this.rules.modes().subList(3, 9)).extracting(ModeSpec::name)
			.containsExactly("Puzzle 1: First Steps", "Puzzle 2: Chain Reaction", "Puzzle 3: Clutter", "Puzzle 4: Half Built",
					"Puzzle 5: Locked Column", "Puzzle 6: Endgame");
		assertThat(this.rules.modes().subList(3, 9)).allSatisfy((spec) -> {
			assertThat(spec.ranked()).isFalse();
			assertThat(spec.order()).isEqualTo(ModeSpec.Order.DESC);
			assertThat(spec.unit()).isEqualTo(ModeSpec.Unit.POINTS);
		});
		// The highest score each stage's whole budget allows.
		assertThat(this.rules.modes().subList(3, 9)).extracting(ModeSpec::maxScore)
			.containsExactly(1324, 910, 896, 1828, 1180, 3054);
		for (int stage = 1; stage <= 6; stage++) {
			assertThat(this.rules.details("puzzle-" + stage)).containsExactlyInAnyOrder("highestTile", "moves");
		}
	}

	@Test
	void theStagesMirrorTheFrontendTable() {
		assertThat(Game2048RunRules.PUZZLE_STAGES).extracting(PuzzleStage::mode, PuzzleStage::target,
				PuzzleStage::moveLimit)
			.containsExactly(tuple("puzzle-1", 128, 60),
					tuple("puzzle-2", 256, 20),
					tuple("puzzle-3", 128, 26),
					tuple("puzzle-4", 512, 36),
					tuple("puzzle-5", 512, 10),
					tuple("puzzle-6", 1024, 36));
		assertThat(Game2048RunRules.PUZZLE_STAGES.get(1).board())
			.isEqualTo(List.of(128, 64, 32, 16, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 4, 0));
		assertThat(Game2048RunRules.PUZZLE_STAGES).extracting(PuzzleStage::fewestMoves)
			.containsExactly(20, 4, 5, 9, 1, 8);
	}

	@Test
	void aMergeScoresExactlyWhatItAddsToTheBoardsPotential() {
		// Two 64s (5 × 64 each) become a 128 (6 × 128): 768 − 640 = 128, the merge's points.
		assertThat(Game2048RunRules.potential(128) - 2 * Game2048RunRules.potential(64)).isEqualTo(128);
		assertThat(Game2048RunRules.potential(2)).isZero();
		assertThat(Game2048RunRules.potential(4)).isEqualTo(4);
		assertThat(Game2048RunRules.potential(0)).isZero();
	}

	// --- Accepted clears -----------------------------------------------------------------------------

	/** The recorded clearing lines of {@code game2048Puzzle.test.ts}, and the game's AI, on each stage's seed. */
	@ParameterizedTest
	@CsvSource({ "puzzle-1, 128, 39, 576", "puzzle-1, 128, 49, 616", "puzzle-2, 256, 12, 536", "puzzle-2, 256, 15, 544",
			"puzzle-3, 128, 12, 480", "puzzle-3, 128, 22, 508", "puzzle-4, 512, 21, 1092", "puzzle-4, 512, 25, 1104",
			"puzzle-5, 512, 6, 612", "puzzle-5, 512, 6, 580", "puzzle-6, 1024, 20, 2172", "puzzle-6, 1024, 27, 2220" })
	void realClearsAreAccepted(String mode, int target, int moves, int score) {
		assertThat(judge(mode, score, clear(target, moves))).isEmpty();
	}

	@Test
	void aClearOnTheLastAllowedMoveIsAccepted() {
		assertThat(judge("puzzle-5", 612, clear(512, 10))).isEmpty();
		assertThat(judge("puzzle-1", 616, clear(128, 60))).isEmpty();
	}

	@Test
	void theScoreBoundsAreInclusive() {
		// Stage 2 in 12 moves: the target built with every spawn a 4 scores at least 480, and a board that
		// size holds at most 718.
		assertThat(judge("puzzle-2", 480, clear(256, 12))).isEmpty();
		assertThat(judge("puzzle-2", 716, clear(256, 12))).isEmpty();
		assertThat(judge("puzzle-2", 476, clear(256, 12))).isPresent();
		assertThat(judge("puzzle-2", 720, clear(256, 12))).isPresent();
		// Stage 5 starts with the two 256s: the clearing merge alone scores 512.
		assertThat(judge("puzzle-5", 512, clear(512, 1))).isEmpty();
		assertThat(judge("puzzle-5", 508, clear(512, 1))).isPresent();
	}

	// --- Refused claims ------------------------------------------------------------------------------

	@Test
	void aRunShortOfTheTargetIsNotAClear() {
		assertThat(judge("puzzle-1", 576, clear(64, 39))).hasValue("highest tile short of the stage's target");
		assertThat(judge("puzzle-2", 400, clear(128, 20))).hasValue("highest tile short of the stage's target");
	}

	@Test
	void aTileAboveTheTargetCannotBeMade() {
		assertThat(judge("puzzle-1", 1200, clear(256, 50))).hasValue("highest tile above the stage's target");
	}

	@Test
	void eachStageIsJudgedByItsOwnTarget() {
		// Stage 1's clear is not a clear of stage 4, whose target is 512.
		assertThat(judge("puzzle-4", 576, clear(128, 39))).hasValue("highest tile short of the stage's target");
		// Nor is stage 4's clear one of stage 1.
		assertThat(judge("puzzle-1", 1092, clear(512, 21))).hasValue("highest tile above the stage's target");
	}

	@Test
	void aClearPastTheBudgetIsRefused() {
		assertThat(judge("puzzle-5", 612, clear(512, 11))).hasValue("more moves than the stage allows");
		assertThat(judge("puzzle-2", 600, clear(256, 21))).hasValue("more moves than the stage allows");
		assertThat(judge("puzzle-6", 2400, clear(1024, 37))).hasValue("more moves than the stage allows");
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, -1 })
	void aClearNeedsAMove(int moves) {
		assertThat(judge("puzzle-5", 612, clear(512, moves))).hasValue("no move made");
	}

	@Test
	void aClearFasterThanSpawnsCanFillTheBoardIsRefused() {
		// Stage 1 holds 54: a 128 needs 74 more, so at least 19 spawns, the first after move 1.
		assertThat(judge("puzzle-1", 512, clear(128, 19))).hasValue("too few moves to reach the target");
		assertThat(judge("puzzle-1", 512, clear(128, 20))).isEmpty();
	}

	@ParameterizedTest
	@ValueSource(ints = { 538, 534, 0, -4 })
	void aScoreNoClearCanHaveIsRefused(int score) {
		assertThat(judge("puzzle-2", score, clear(256, 12))).hasValue("score does not match a clear in these moves");
	}

	@Test
	void aScoreBeyondTheBoardIsRefused() {
		assertThat(judge("puzzle-6", 20_000, clear(1024, 20))).hasValue("score does not match a clear in these moves");
	}

	@Test
	void movesFasterThanAPersonPlaysAreRefused() {
		// 25 a second, with the platform's latency allowance: 60 moves need at least 400 ms of session.
		assertThat(judge("puzzle-1", 616, clear(128, 60), Duration.ZERO)).hasValue("more moves than the time allows");
		assertThat(judge("puzzle-1", 616, clear(128, 60), Duration.ofSeconds(1))).isEmpty();
	}

	// --- No rewards, and the other modes unchanged ---------------------------------------------------

	@Test
	void aStageNeverCompletes() {
		for (int stage = 1; stage <= 6; stage++) {
			assertThat(this.rules.completes("puzzle-" + stage, clear(128, 39))).isFalse();
		}
	}

	@Test
	void theOtherModesAreJudgedAsBefore() {
		// Classic's own bounds, which a Puzzle start would break, still apply to Classic.
		assertThat(judge(ModeSpec.CLASSIC.id(), 576, clear(128, 39))).hasValue("details do not match the score");
		assertThat(judge("moves", 4500, Game2048MovesRunRulesTests.fullRun())).isEmpty();
		assertThat(this.rules.completes(ModeSpec.CLASSIC.id(), clear(128, 39))).isTrue();
		assertThat(this.rules.completes("moves", Game2048MovesRunRulesTests.fullRun())).isTrue();
	}

	@Test
	void aStageThatIsNotDeclaredIsRefused() {
		assertThat(judge("puzzle-7", 576, clear(128, 39)))
			.hasValueSatisfying((problem) -> assertThat(problem).startsWith(RunRules.NO_RULES_FOR_MODE));
		assertThat(judge("puzzle-0", 576, clear(128, 39))).isPresent();
	}

}
