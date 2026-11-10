package com.cyan.arcade.gamerules;

import java.time.Duration;
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

/** Snake's map modes, without the platform: declared ranked by points, and judged exactly as Classic is. */
class SnakeMapsRunRulesTests {

	private static final Duration HALF_HOUR = Duration.ofMinutes(30);

	private final SnakeRunRules rules = new SnakeRunRules();

	/** What the engine reports with a score: three cells plus one per apple, a level per five apples. */
	static Map<String, Integer> details(int score) {
		return Map.of("length", score + 3, "level", score / 5 + 1);
	}

	private Optional<String> judge(String mode, int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(mode, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The modes -----------------------------------------------------------------------------------

	@Test
	void classicComesFirstThenTheThreeMapsRankedHighestFirstInPoints() {
		// The six Adventure stages follow (SnakeAdventureRunRulesTests).
		assertThat(this.rules.modes()).startsWith(ModeSpec.CLASSIC,
				new ModeSpec("map-pillars", "Pillars", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, 237),
				new ModeSpec("map-tunnels", "Tunnels", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, 229),
				new ModeSpec("map-rooms", "Rooms", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, 209));
	}

	@Test
	void eachMapsHighestScoreIsItsFreeCellsLessTheStartingSnake() {
		// 256 cells less the walls (16, 24, 44), less the 3 the snake starts on.
		assertThat(this.rules.modes().stream().skip(1).limit(3).map(ModeSpec::maxScore)).containsExactly(256 - 16 - 3,
				256 - 24 - 3, 256 - 44 - 3);
	}

	@ParameterizedTest
	@ValueSource(strings = { "classic", "map-pillars", "map-tunnels", "map-rooms" })
	void everyModeReportsClassicsDetails(String mode) {
		assertThat(this.rules.details(mode)).isEqualTo(Set.of("length", "level"));
	}

	// --- Judging ---------------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(strings = { "map-pillars", "map-tunnels", "map-rooms" })
	void anHonestMapRunIsAccepted(String mode) {
		assertThat(judge(mode, 0, details(0), Duration.ofSeconds(3))).isEmpty();
		assertThat(judge(mode, 42, details(42), Duration.ofMinutes(2))).isEmpty();
		assertThat(judge(mode, 200, details(200), HALF_HOUR)).isEmpty();
	}

	@ParameterizedTest
	@ValueSource(strings = { "map-pillars", "map-tunnels", "map-rooms" })
	void aMapRunWhoseDetailsDoNotMatchItsScoreIsRefused(String mode) {
		assertThat(judge(mode, 20, Map.of("length", 22, "level", 5), HALF_HOUR)).contains("details do not match the score");
		assertThat(judge(mode, 20, Map.of("length", 23, "level", 4), HALF_HOUR)).contains("details do not match the score");
	}

	@ParameterizedTest
	@ValueSource(strings = { "map-pillars", "map-tunnels", "map-rooms" })
	void aMapRunFasterThanTheSnakeCanMoveIsRefused(String mode) {
		// 5 s plus the 2 s allowance hold 100 moves of 70 ms: 100 apples at most.
		assertThat(judge(mode, 100, details(100), Duration.ofSeconds(5))).isEmpty();
		assertThat(judge(mode, 101, details(101), Duration.ofSeconds(5))).contains("more apples than moves in the time");
	}

	@Test
	void mapsAreJudgedExactlyAsClassicIs() {
		for (int score : new int[] { 0, 7, 99, 101, 200 }) {
			for (Duration elapsed : new Duration[] { Duration.ofSeconds(5), HALF_HOUR }) {
				Optional<String> classic = judge("classic", score, details(score), elapsed);
				for (String map : new String[] { "map-pillars", "map-tunnels", "map-rooms" }) {
					assertThat(judge(map, score, details(score), elapsed)).as("%s, %d in %s", map, score, elapsed)
						.isEqualTo(classic);
				}
			}
		}
	}

	@ParameterizedTest
	@ValueSource(strings = { "ultra", "map-maze", "adventure-7" })
	void aModeSnakeDoesNotHaveIsNeverJudgedAsClassic(String mode) {
		assertThat(judge(mode, 10, details(10), HALF_HOUR)).hasValueSatisfying(
				(problem) -> assertThat(problem).startsWith(RunRules.NO_RULES_FOR_MODE));
	}

	// --- Completion --------------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(strings = { "classic", "map-pillars", "map-tunnels", "map-rooms" })
	void everyClassicOrMapRunCompletes(String mode) {
		assertThat(this.rules.completes(mode, details(12))).isTrue();
	}

	@Test
	void anyOtherModeDoesNot() {
		assertThat(this.rules.completes("map-maze", details(12))).isFalse();
	}

	@Test
	void classicIsJudgedAsBefore() {
		assertThat(this.rules.problemWith(30, details(30), HALF_HOUR)).isEmpty();
		assertThat(this.rules.problemWith(30, Map.of("length", 30, "level", 7), HALF_HOUR))
			.contains("details do not match the score");
		assertThat(this.rules.problemWith(101, details(101), Duration.ofSeconds(5)))
			.contains("more apples than moves in the time");
	}

}
