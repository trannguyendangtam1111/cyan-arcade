package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.gamerules.SnakeRunRules.AdventureStage;
import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Snake Adventure's run rules, without the platform: what a cleared stage looks like, stage by stage,
 * and what cannot be one (a crash or an exhausted move limit short of the objective, the wrong apples,
 * moves, game time or pace).
 */
class SnakeAdventureRunRulesTests {

	private final SnakeRunRules rules = new SnakeRunRules();

	/**
	 * A real clear of each stage: what the AI did on the stage's fixed seed in the frontend engine
	 * (SNK-002a), its game time summed as the client sums it.
	 */
	static Map<String, Integer> cleared(int stage) {
		return switch (stage) {
			case 1 -> details(10, 178, 25_920);
			case 2 -> details(15, 179, 24_920);
			case 3 -> details(20, 172, 23_500);
			case 4 -> details(15, 263, 36_800);
			case 5 -> details(25, 362, 46_160);
			case 6 -> details(30, 425, 50_890);
			default -> throw new IllegalArgumentException("No stage " + stage);
		};
	}

	/** A run's details: the length and level its apples make, its moves and game time. */
	static Map<String, Integer> details(int apples, int steps, int gameMs) {
		Map<String, Integer> details = new HashMap<>();
		details.put("apples", apples);
		details.put("length", apples + 3);
		details.put("level", apples / 5 + 1);
		details.put("steps", steps);
		details.put("gameMs", gameMs);
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
		return this.rules.problemWith("adventure-" + stage, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The modes -----------------------------------------------------------------------------------

	@Test
	void theSixStagesAreTheFrontendsOwn() {
		// The same table as `frontend/src/games/snake/engine/snakeAdventure.ts` (pinned by snakeAdventure.test.ts).
		assertThat(SnakeRunRules.ADVENTURE_STAGES).containsExactly(new AdventureStage(1, "Open", 10, 0),
				new AdventureStage(2, "Pillars", 15, 0), new AdventureStage(3, "Tunnels", 20, 0),
				new AdventureStage(4, "Tunnels", 15, 400), new AdventureStage(5, "Rooms", 25, 0),
				new AdventureStage(6, "Rooms", 30, 900));
	}

	@Test
	void theStagesFollowClassicAndTheMapsUnrankedAsTimes() {
		List<ModeSpec> modes = this.rules.modes();
		assertThat(modes).extracting(ModeSpec::id)
			.containsExactly("classic", "map-pillars", "map-tunnels", "map-rooms", "adventure-1", "adventure-2",
					"adventure-3", "adventure-4", "adventure-5", "adventure-6");
		assertThat(modes.subList(4, 10)).extracting(ModeSpec::name)
			.containsExactly("Adventure 1: Open", "Adventure 2: Pillars", "Adventure 3: Tunnels", "Adventure 4: Tunnels",
					"Adventure 5: Rooms", "Adventure 6: Rooms");
		assertThat(modes.subList(4, 10)).allSatisfy((mode) -> {
			assertThat(mode.ranked()).isFalse();
			assertThat(mode.order()).isEqualTo(ModeSpec.Order.ASC);
			assertThat(mode.unit()).isEqualTo(ModeSpec.Unit.MILLISECONDS);
		});
	}

	@Test
	void eachStagesHighestTimeIsTheSlowestItsMostMovesCanTake() {
		// Stage 4: 386 moves at 150 ms, then 4 at 150, 5 at 140 and 5 at 130 for apples 1 to 14.
		assertThat(this.rules.modes().get(7).maxScore()).isEqualTo(386 * 150 + 4 * 150 + 5 * 140 + 5 * 130);
		assertThat(this.rules.modes().get(9).maxScore()).isEqualTo(SnakeRunRules.slowestGameMs(900, 30));
		// Without a move limit, the server's own bound of 20,000 moves.
		assertThat(this.rules.modes().get(4).maxScore()).isEqualTo(SnakeRunRules.slowestGameMs(20_000, 10));
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aStageReportsItsOwnDetails(int stage) {
		assertThat(this.rules.details("adventure-" + stage))
			.isEqualTo(Set.of("apples", "length", "level", "steps", "gameMs"));
	}

	@Test
	void classicAndTheMapsKeepTheirDetails() {
		for (String mode : new String[] { "classic", "map-pillars", "map-tunnels", "map-rooms" }) {
			assertThat(this.rules.details(mode)).isEqualTo(Set.of("length", "level"));
		}
	}

	// --- Game time -------------------------------------------------------------------------------------

	@Test
	void aMoveTakesTheHumanTickAtItsScore() {
		// As `tickDelay` in the frontend engine: 150 ms, 10 ms faster every five apples, never under 70 ms.
		assertThat(SnakeRunRules.tickMs(0)).isEqualTo(150);
		assertThat(SnakeRunRules.tickMs(4)).isEqualTo(150);
		assertThat(SnakeRunRules.tickMs(5)).isEqualTo(140);
		assertThat(SnakeRunRules.tickMs(29)).isEqualTo(100);
		assertThat(SnakeRunRules.tickMs(40)).isEqualTo(70);
		assertThat(SnakeRunRules.tickMs(200)).isEqualTo(70);
	}

	@Test
	void theGameTimeOfSomeMovesLiesBetweenEatingEarlyAndEatingLate() {
		// One apple a move: only one way.
		assertThat(SnakeRunRules.fastestGameMs(10, 10)).isEqualTo(5 * 150 + 5 * 140)
			.isEqualTo(SnakeRunRules.slowestGameMs(10, 10));
		// Twelve moves for ten apples: two of them at a slower pace, early or late.
		assertThat(SnakeRunRules.fastestGameMs(12, 10)).isEqualTo(5 * 150 + 7 * 140);
		assertThat(SnakeRunRules.slowestGameMs(12, 10)).isEqualTo(7 * 150 + 5 * 140);
	}

	// --- Clears ----------------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aRealClearIsAccepted(int stage) {
		assertThat(judge(stage, cleared(stage))).isEmpty();
		// Paused along the way: game time is what counts, so a longer session is fine.
		assertThat(judge(stage, cleared(stage), Duration.ofMinutes(20))).isEmpty();
	}

	@Test
	void aClearOnTheLastAllowedMoveIsAccepted() {
		int gameMs = SnakeRunRules.fastestGameMs(400, 15);
		assertThat(judge(4, details(15, 400, gameMs))).isEmpty();
		assertThat(judge(6, details(30, 900, SnakeRunRules.slowestGameMs(900, 30)))).isEmpty();
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aClearAtEitherEndOfItsGameTimeIsAccepted(int stage) {
		Map<String, Integer> clear = cleared(stage);
		int apples = clear.get("apples");
		int steps = clear.get("steps");
		assertThat(judge(stage, details(apples, steps, SnakeRunRules.fastestGameMs(steps, apples)))).isEmpty();
		assertThat(judge(stage, details(apples, steps, SnakeRunRules.slowestGameMs(steps, apples)))).isEmpty();
	}

	// --- Failed and impossible runs --------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aRunShortOfItsObjectiveIsRefused(int stage) {
		// A crash, or a move limit used up, one apple short.
		Map<String, Integer> clear = cleared(stage);
		int apples = clear.get("apples") - 1;
		int steps = clear.get("steps");
		int gameMs = SnakeRunRules.fastestGameMs(steps, apples);
		assertThat(judge(stage, details(apples, steps, gameMs))).contains("fewer apples than the stage's objective");
		assertThat(judge(stage, details(0, 3, 450))).contains("fewer apples than the stage's objective");
	}

	@Test
	void anExhaustedMoveLimitIsRefused() {
		assertThat(judge(4, details(15, 401, SnakeRunRules.fastestGameMs(401, 15))))
			.contains("more moves than the stage allows");
		assertThat(judge(6, details(30, 901, SnakeRunRules.fastestGameMs(901, 30))))
			.contains("more moves than the stage allows");
		// Without a limit, the server's own bound.
		assertThat(judge(1, details(10, 20_000, SnakeRunRules.fastestGameMs(20_000, 10)), Duration.ofHours(2)))
			.isEmpty();
		assertThat(judge(1, details(10, 20_001, SnakeRunRules.fastestGameMs(20_001, 10)), Duration.ofHours(2)))
			.contains("more moves than the stage allows");
	}

	@Test
	void moreApplesThanTheObjectiveAreRefused() {
		// The engine stops at the apple that reaches the objective.
		assertThat(judge(1, details(11, 178, SnakeRunRules.fastestGameMs(178, 11))))
			.contains("more apples than the clear that reached the objective");
	}

	@Test
	void detailsThatDoNotMatchTheApplesAreRefused() {
		assertThat(judge(2, with(cleared(2), "length", 17))).contains("details do not match the apples");
		assertThat(judge(2, with(cleared(2), "level", 3))).contains("details do not match the apples");
	}

	@Test
	void fewerMovesThanApplesAreRefused() {
		assertThat(judge(1, details(10, 9, SnakeRunRules.fastestGameMs(9, 10)))).contains("fewer moves than apples");
	}

	@Test
	void aScoreThatIsNotTheGameTimeIsRefused() {
		Map<String, Integer> clear = cleared(3);
		assertThat(judge(3, 1_000, clear, playedFor(clear))).contains("score is not the game time");
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void aGameTimeTheMovesCannotAddUpToIsRefused(int stage) {
		Map<String, Integer> clear = cleared(stage);
		int apples = clear.get("apples");
		int steps = clear.get("steps");
		int fastest = SnakeRunRules.fastestGameMs(steps, apples);
		int slowest = SnakeRunRules.slowestGameMs(steps, apples);
		assertThat(judge(stage, details(apples, steps, fastest - 10))).contains("game time does not match the moves");
		assertThat(judge(stage, details(apples, steps, slowest + 10))).contains("game time does not match the moves");
	}

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void moreGameTimeThanTheSessionLastedIsRefused(int stage) {
		Map<String, Integer> clear = cleared(stage);
		Duration justLongEnough = Duration.ofMillis(clear.get("gameMs") - 2_000);
		assertThat(judge(stage, clear, justLongEnough)).isEmpty();
		assertThat(judge(stage, clear, justLongEnough.minusMillis(1)))
			.contains("more game time than the session lasted");
	}

	@Test
	void anyOtherAdventureStageIsNeverJudgedAsClassic() {
		assertThat(judge(7, cleared(1))).hasValueSatisfying(
				(problem) -> assertThat(problem).startsWith(RunRules.NO_RULES_FOR_MODE));
	}

	// --- Completion --------------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 1, 2, 3, 4, 5, 6 })
	void noStageCompletes(int stage) {
		// No completion reward: a clear earns no XP and no coins.
		assertThat(this.rules.completes("adventure-" + stage, cleared(stage))).isFalse();
	}

	@Test
	void classicAndTheMapsStillComplete() {
		for (String mode : new String[] { "classic", "map-pillars", "map-tunnels", "map-rooms" }) {
			assertThat(this.rules.completes(mode, SnakeMapsRunRulesTests.details(12))).isTrue();
		}
	}

}
