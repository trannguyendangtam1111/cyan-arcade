package com.cyan.arcade.score;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.game.GameInfo;
import org.junit.jupiter.api.Test;

import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A run is judged by the mode its session started in: that mode's score limit, its details and its
 * rules. Classic runs are judged exactly as before modes existed.
 */
class RunValidatorTests {

	private static final Duration MINUTE = Duration.ofMinutes(1);

	/** At most 1,000 points by the catalog; the trial has a limit of its own. */
	private static final GameInfo TWO_MODES = new GameInfo(2L, "two-modes", "Two Modes", 1_000, true);

	private static final GameInfo PLAIN = new GameInfo(1L, "plain", "Plain", 100, true);

	private static final GameInfo WITHOUT_RULES = new GameInfo(3L, "no-rules", "No Rules", 50, true);

	private final TwoModeRunRules twoModes = new TwoModeRunRules("two-modes");

	private final RunValidator validator = new RunValidator(
			new GameModes(List.of(this.twoModes, new GameModesTests.ClassicOnly("plain"))));

	// --- Classic, as before ------------------------------------------------------------------------

	@Test
	void rulesWrittenBeforeModesJudgeClassicRunsAsTheyAlwaysHave() {
		GameSession run = session(PLAIN, "classic");

		assertThat(this.validator.check(run, PLAIN, 10, Map.of("level", 3, "extra", 9), MINUTE))
			.isEqualTo(Map.of("level", 3));
		assertRejected(() -> this.validator.check(run, PLAIN, 2, Map.of("level", 3), MINUTE));
		assertRejected(() -> this.validator.check(run, PLAIN, 10, Map.of("extra", 9), MINUTE));
		assertRejected(() -> this.validator.check(run, PLAIN, 101, Map.of("level", 3), MINUTE));
	}

	@Test
	void aClassicRunIsJudgedByClassicsDetailsAndRules() {
		GameSession run = session(TWO_MODES, "classic");

		assertThat(this.validator.check(run, TWO_MODES, 40, Map.of("lines", 4, "pieces", 30), MINUTE))
			.isEqualTo(Map.of("lines", 4));
		assertThat(this.twoModes.judged).containsExactly(
				new TwoModeRunRules.Judged("classic", run.getId(), 40, Map.of("lines", 4)));
		// Classic keeps the catalog's limit.
		assertRejected(() -> this.validator.check(run, TWO_MODES, 1_001, Map.of("lines", 4), MINUTE));
	}

	// --- Another mode --------------------------------------------------------------------------------

	@Test
	void aRunOfAnotherModeIsJudgedByThatModesRules() {
		GameSession run = session(TWO_MODES, "trial");

		Map<String, Integer> kept = this.validator.check(run, TWO_MODES, 45_000, Map.of("pieces", 120), MINUTE);

		assertThat(kept).isEqualTo(Map.of("pieces", 120));
		assertThat(this.twoModes.judged).containsExactly(
				new TwoModeRunRules.Judged("trial", run.getId(), 45_000, Map.of("pieces", 120)));
		assertRejected(() -> this.validator.check(run, TWO_MODES, 1_000, Map.of("pieces", 120), MINUTE));
	}

	@Test
	void onlyTheModesOwnDetailsAreRequiredAndKept() {
		GameSession run = session(TWO_MODES, "trial");

		// Classic's detail is not the trial's: dropped, and the trial's own is missing.
		assertRejected(() -> this.validator.check(run, TWO_MODES, 45_000, Map.of("lines", 4), MINUTE));
		assertThat(this.validator.check(run, TWO_MODES, 45_000, Map.of("pieces", 120, "lines", 4), MINUTE))
			.containsOnlyKeys("pieces");
	}

	@Test
	void aModeWithALimitOfItsOwnUsesItInsteadOfTheGames() {
		GameSession run = session(TWO_MODES, "trial");

		// Above the catalog's 1,000, within the trial's 600,000.
		assertThat(this.validator.check(run, TWO_MODES, 600_000, Map.of("pieces", 1), MINUTE)).isNotEmpty();
		assertRejected(() -> this.validator.check(run, TWO_MODES, 600_001, Map.of("pieces", 1), MINUTE));
		assertRejected(() -> this.validator.check(run, TWO_MODES, -1, Map.of("pieces", 1), MINUTE));
		// Refused before the rules are asked.
		assertThat(this.twoModes.judged).hasSize(1);
	}

	@Test
	void aRunWhoseModeIsNoLongerDeclaredIsRefused() {
		GameSession run = session(PLAIN, "trial");

		assertRejected(() -> this.validator.check(run, PLAIN, 10, Map.of("level", 1), MINUTE));
	}

	// --- A mode without rules of its own -------------------------------------------------------------

	@Test
	void aModeWhoseGameGaveItNoRulesIsNeverJudgedByClassics() {
		// Declares a second mode and forgets to judge it: the mistake must fail closed.
		GameInfo forgetful = new GameInfo(4L, "forgetful", "Forgetful", 100, true);
		RunRules rules = new RunRules() {
			@Override
			public String gameSlug() {
				return "forgetful";
			}

			@Override
			public List<ModeSpec> modes() {
				return List.of(ModeSpec.CLASSIC,
						new ModeSpec("ultra", "Ultra", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, null));
			}

			@Override
			public Set<String> details() {
				return Set.of("level");
			}

			@Override
			public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
				return Optional.empty();
			}
		};
		RunValidator validator = new RunValidator(new GameModes(List.of(rules)));

		// The same run Classic accepts...
		assertThat(validator.check(session(forgetful, "classic"), forgetful, 10, Map.of("level", 3), MINUTE))
			.isEqualTo(Map.of("level", 3));
		// ...is refused in the mode that has no rules of its own, whatever it reports.
		assertRejected(() -> validator.check(session(forgetful, "ultra"), forgetful, 10, Map.of("level", 3), MINUTE));
		assertThat(rules.problemWith("ultra", UUID.randomUUID(), 10, Map.of("level", 3), MINUTE))
			.hasValueSatisfying((reason) -> assertThat(reason).startsWith(RunRules.NO_RULES_FOR_MODE));
		// Classic itself is still judged by the rules written before modes.
		assertThat(rules.problemWith("classic", UUID.randomUUID(), 10, Map.of("level", 3), MINUTE)).isEmpty();
	}

	@Test
	void aGameWithoutRulesGetsTheRangeCheckAloneInClassic() {
		Map<String, Integer> details = Map.of("anything", 1);

		assertThat(this.validator.check(session(WITHOUT_RULES, "classic"), WITHOUT_RULES, 50, details, MINUTE))
			.isEqualTo(details);
		assertRejected(() -> this.validator.check(session(WITHOUT_RULES, "classic"), WITHOUT_RULES, 51, details,
				MINUTE));
		assertRejected(() -> this.validator.check(session(WITHOUT_RULES, "trial"), WITHOUT_RULES, 5, details,
				MINUTE));
	}

	private static GameSession session(GameInfo game, String mode) {
		return GameSession.start(game.id(), null, UUID.randomUUID(), mode, Instant.EPOCH);
	}

	private static void assertRejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable check) {
		assertThatThrownBy(check).isInstanceOfSatisfying(ApiException.class, (e) -> {
			assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
			assertThat(e.getCode()).isEqualTo("SCORE_REJECTED");
		});
	}

}
