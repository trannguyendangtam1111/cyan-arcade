package com.cyan.arcade.score;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.game.GameInfo;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Which modes each game has, as its rules declare them, and which a run may start in. */
class GameModesTests {

	private static final GameInfo PLAIN = new GameInfo(1L, "plain", "Plain", 1_000, true);

	private static final GameInfo TWO_MODES = new GameInfo(2L, "two-modes", "Two Modes", 1_000, true);

	private static final GameInfo WITHOUT_RULES = new GameInfo(3L, "no-rules", "No Rules", null, true);

	private static final GameInfo UNSCORED = new GameInfo(4L, "unscored", "Unscored", null, false);

	private final GameModes modes = new GameModes(List.of(new ClassicOnly("plain"), new TwoModeRunRules("two-modes")));

	@Test
	void rulesThatDeclareNothingHaveClassicAlone() {
		assertThat(new ClassicOnly("plain").modes()).containsExactly(ModeSpec.CLASSIC);
		assertThat(this.modes.modesOf(PLAIN)).containsExactly(ModeSpec.CLASSIC);
		assertThat(ModeSpec.CLASSIC).isEqualTo(new ModeSpec("classic", "Classic", true, ModeSpec.Order.DESC,
				ModeSpec.Unit.POINTS, null));
	}

	@Test
	void aGameListsTheModesItsRulesDeclareInTheirOrder() {
		assertThat(this.modes.modesOf(TWO_MODES)).containsExactly(ModeSpec.CLASSIC, TwoModeRunRules.TRIAL);
	}

	@Test
	void aScoredGameWithoutRulesHasClassicAndAnUnscoredGameHasNoModes() {
		assertThat(this.modes.modesOf(WITHOUT_RULES)).containsExactly(ModeSpec.CLASSIC);
		assertThat(this.modes.modesOf(UNSCORED)).isEmpty();
	}

	@Test
	void aRunStartsInClassicUnlessItNamesAnotherDeclaredMode() {
		assertThat(this.modes.resolve(PLAIN, null)).isEqualTo(ModeSpec.CLASSIC);
		assertThat(this.modes.resolve(PLAIN, "classic")).isEqualTo(ModeSpec.CLASSIC);
		assertThat(this.modes.resolve(TWO_MODES, null)).isEqualTo(ModeSpec.CLASSIC);
		assertThat(this.modes.resolve(TWO_MODES, "trial")).isEqualTo(TwoModeRunRules.TRIAL);
	}

	@ParameterizedTest
	@ValueSource(strings = { "trial", "ultra" })
	void aModeTheGameDoesNotDeclareIsABadRequest(String mode) {
		assertThatThrownBy(() -> this.modes.resolve(PLAIN, mode)).isInstanceOfSatisfying(ApiException.class, (e) -> {
			assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
			assertThat(e.getCode()).isEqualTo("UNKNOWN_MODE");
			assertThat(e.getMessage()).isEqualTo("Plain has no mode '" + mode + "'");
		});
	}

	@Test
	void anUnscoredGameCannotStartInAnyMode() {
		assertThatThrownBy(() -> this.modes.resolve(UNSCORED, null)).isInstanceOf(ApiException.class);
	}

	@Test
	void aModeStaysDeclaredForRunsUnderWayEvenIfTheGameStopsBeingScored() {
		assertThat(this.modes.declared("two-modes", "trial")).contains(TwoModeRunRules.TRIAL);
		assertThat(this.modes.declared("no-rules", "classic")).contains(ModeSpec.CLASSIC);
		assertThat(this.modes.declared("plain", "trial")).isEmpty();
	}

	// --- Declarations are checked when the application starts ---------------------------------------

	@Test
	void aGameMustKeepClassic() {
		assertThatThrownBy(() -> new GameModes(List.of(new TwoModeRunRules("trial-only", TwoModeRunRules.TRIAL))))
			.isInstanceOf(IllegalStateException.class)
			.hasMessage("trial-only does not declare the Classic mode");
	}

	@Test
	void aGameCannotRedefineClassic() {
		// Every recorded run is Classic: turning its board around would reorder every existing ranking.
		ModeSpec lowestFirst = new ModeSpec("classic", "Classic", true, ModeSpec.Order.ASC, ModeSpec.Unit.POINTS, null);

		assertThatThrownBy(() -> new GameModes(List.of(new TwoModeRunRules("turned", lowestFirst))))
			.isInstanceOf(IllegalStateException.class)
			.hasMessage("turned changes the Classic mode");
	}

	@Test
	void aGameCannotDeclareAModeTwice() {
		ModeSpec again = new ModeSpec("trial", "Another Trial", false, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, null);

		assertThatThrownBy(() -> new GameModes(
				List.of(new TwoModeRunRules("twice", ModeSpec.CLASSIC, TwoModeRunRules.TRIAL, again))))
			.isInstanceOf(IllegalStateException.class)
			.hasMessage("twice declares mode 'trial' twice");
	}

	@ParameterizedTest
	@ValueSource(strings = { "Trial", "", "1v1", "-trial", "time_trial", "abcdefghijklmnopqrstuvwxy" })
	void aModeIdMustBeWellFormed(String id) {
		assertThatThrownBy(() -> new ModeSpec(id, "Trial", true, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS, null))
			.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void aModeNeedsANameAnOrderAUnitAndNoNegativeLimit() {
		assertThatThrownBy(() -> new ModeSpec("trial", " ", true, ModeSpec.Order.ASC, ModeSpec.Unit.POINTS, null))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new ModeSpec("trial", "Trial", true, null, ModeSpec.Unit.POINTS, null))
			.isInstanceOf(NullPointerException.class);
		assertThatThrownBy(() -> new ModeSpec("trial", "Trial", true, ModeSpec.Order.ASC, null, null))
			.isInstanceOf(NullPointerException.class);
		assertThatThrownBy(() -> new ModeSpec("trial", "Trial", true, ModeSpec.Order.ASC, ModeSpec.Unit.POINTS, -1))
			.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void onlyClassicAndModesThatSayTheyShareItCountAsClassic() {
		GameModes withSplit = new GameModes(List.of(new SplitBoards("plain"), new TwoModeRunRules("two-modes")));
		assertThat(ModeSpec.CLASSIC.classicProgression()).isFalse();
		assertThat(TwoModeRunRules.TRIAL.classicProgression()).isFalse();
		assertThat(withSplit.countsAsClassic("plain", "classic")).isTrue();
		assertThat(withSplit.countsAsClassic("plain", "split")).isTrue();
		assertThat(withSplit.countsAsClassic("two-modes", "trial")).isFalse();
		assertThat(withSplit.countsAsClassic("plain", "trial")).isFalse();
		assertThat(withSplit.countsAsClassic("no-rules", "split")).isFalse();
		// Classic's rewards are for higher scores: a time or an unranked mode cannot share them.
		assertThatThrownBy(() -> new ModeSpec("split", "Split", false, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, null, true))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new ModeSpec("split", "Split", true, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS, null, true))
			.isInstanceOf(IllegalArgumentException.class);
	}

	/** Classic split into another board that keeps Classic's rewards, as Sudoku's difficulties do. */
	static final class SplitBoards implements RunRules {

		private final String gameSlug;

		SplitBoards(String gameSlug) {
			this.gameSlug = gameSlug;
		}

		@Override
		public String gameSlug() {
			return this.gameSlug;
		}

		@Override
		public Set<String> details() {
			return Set.of();
		}

		@Override
		public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
			return Optional.empty();
		}

		@Override
		public List<ModeSpec> modes() {
			return List.of(ModeSpec.CLASSIC,
					new ModeSpec("split", "Split", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, null, true));
		}

	}

	/** Rules written before modes existed: they override none of the mode-aware methods. */
	static final class ClassicOnly implements RunRules {

		private final String gameSlug;

		ClassicOnly(String gameSlug) {
			this.gameSlug = gameSlug;
		}

		@Override
		public String gameSlug() {
			return this.gameSlug;
		}

		@Override
		public Set<String> details() {
			return Set.of("level");
		}

		@Override
		public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
			return (details.get("level") > score) ? Optional.of("level above the score") : Optional.empty();
		}

	}

}
