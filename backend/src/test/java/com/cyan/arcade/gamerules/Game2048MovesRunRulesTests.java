package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 2048 Moves Limit's run rules, without the platform: what a real 300-move run looks like, and what cannot be one. */
class Game2048MovesRunRulesTests {

	private static final String MOVES = "moves";

	private static final Duration FIVE_MINUTES = Duration.ofMinutes(5);

	private final Game2048RunRules rules = new Game2048RunRules();

	/** A full run: every one of the 300 moves used, a 256 on the board (an expert scores about 4,500). */
	static Map<String, Integer> fullRun() {
		return details(256, 300);
	}

	/** A run stuck on a full board after 120 moves, with a 64 at most. */
	static Map<String, Integer> stuck() {
		return details(64, 120);
	}

	static Map<String, Integer> details(int highestTile, int moves) {
		Map<String, Integer> details = new HashMap<>();
		details.put("highestTile", highestTile);
		details.put("moves", moves);
		return details;
	}

	private Optional<String> judge(int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(MOVES, UUID.randomUUID(), score, details, elapsed);
	}

	// --- The mode ------------------------------------------------------------------------------------

	@Test
	void movesLimitIsDeclaredRankedHighestFirstInPointsAfterAnUnchangedClassic() {
		assertThat(this.rules.modes()).startsWith(ModeSpec.CLASSIC,
				new ModeSpec("moves", "Moves Limit", true, ModeSpec.Order.DESC, ModeSpec.Unit.POINTS, 10_872),
				Game2048RunRules.TIME_ATTACK);
		assertThat(this.rules.details(MOVES)).isEqualTo(this.rules.details());
		assertThat(this.rules.details()).containsExactlyInAnyOrder("highestTile", "moves");
	}

	@Test
	void theHighestScoreIsTheMostThreeHundredMovesCanMake() {
		// 8 + 4 × 300 = 1208 on the board at most, so a 1024 at best: 1208 × 9.
		assertThat(Game2048RunRules.mostPointsIn(300)).isEqualTo(10_872);
		assertThat(judge(10_872, details(1024, 300), FIVE_MINUTES)).isEmpty();
		assertThat(judge(10_876, details(1024, 300), FIVE_MINUTES)).isPresent();
	}

	// --- Accepted runs -------------------------------------------------------------------------------

	@Test
	void aFullRunIsAccepted() {
		assertThat(judge(4500, fullRun(), FIVE_MINUTES)).isEmpty();
	}

	@Test
	void aRunStuckBeforeTheLimitIsAccepted() {
		assertThat(judge(600, stuck(), FIVE_MINUTES)).isEmpty();
	}

	@Test
	void theFewestMovesABoardCanBeStuckAfterAreAccepted() {
		// Fourteen moves without a merge fill the board: 2 + 14 tiles.
		assertThat(judge(0, details(4, 14), Duration.ofSeconds(30))).isEmpty();
	}

	// --- Refused runs --------------------------------------------------------------------------------

	@ParameterizedTest
	@ValueSource(ints = { 301, 302, 1000, 20_000 })
	void moreMovesThanTheLimitAreRefused(int moves) {
		assertThat(judge(4500, details(256, moves), Duration.ofHours(2))).contains("more moves than the limit");
	}

	@ParameterizedTest
	@ValueSource(ints = { -1, 0, 1, 13 })
	void tooFewMovesForTheRunToHaveEndedAreRefused(int moves) {
		assertThat(judge(0, details(4, moves), FIVE_MINUTES)).contains("too few moves for the run to have ended");
	}

	@Test
	void impossibleTilesAreRefused() {
		// Not a power of two, too small, beyond the board, and more than 300 moves can build.
		assertThat(judge(4500, details(300, 300), FIVE_MINUTES)).contains("not a 2048 result");
		assertThat(judge(0, details(1, 300), FIVE_MINUTES)).contains("not a 2048 result");
		assertThat(judge(4500, details(1 << 18, 300), FIVE_MINUTES)).contains("not a 2048 result");
		assertThat(judge(20_480, details(2048, 300), FIVE_MINUTES)).contains("details do not match the score");
	}

	@Test
	void impossibleScoresAreRefused() {
		// Not a multiple of four.
		assertThat(judge(4502, fullRun(), FIVE_MINUTES)).contains("not a 2048 result");
		// Too much for the board 300 moves can build, and too little for its highest tile.
		assertThat(judge(10_000, fullRun(), FIVE_MINUTES)).contains("details do not match the score");
		assertThat(judge(500, fullRun(), FIVE_MINUTES)).contains("details do not match the score");
	}

	@Test
	void moreMovesThanTheTimeAllowsAreRefused() {
		// At most 25 a second: 300 moves need 12 s, less the 2 s allowed for latency.
		assertThat(judge(4500, fullRun(), Duration.ofSeconds(9))).contains("more moves than the time allows");
		assertThat(judge(4500, fullRun(), Duration.ofSeconds(10))).isEmpty();
	}

	// --- Completion ----------------------------------------------------------------------------------

	@Test
	void onlyARunThatUsedEveryMoveCompletes() {
		assertThat(this.rules.completes(MOVES, fullRun())).isTrue();
		assertThat(this.rules.completes(MOVES, stuck())).isFalse();
		assertThat(this.rules.completes(MOVES, details(256, 299))).isFalse();
	}

	// --- Classic is unchanged ------------------------------------------------------------------------

	@Test
	void classicIsJudgedAndCompletedAsBefore() {
		// Past 300 moves, and stuck after a single one, both as Classic always allowed.
		Map<String, Integer> longRun = details(2048, 1200);
		assertThat(this.rules.problemWith(ModeSpec.CLASSIC.id(), UUID.randomUUID(), 20_480, longRun, Duration.ofHours(1)))
			.isEmpty();
		assertThat(this.rules.problemWith(20_480, longRun, Duration.ofHours(1))).isEmpty();
		assertThat(this.rules.problemWith(ModeSpec.CLASSIC.id(), UUID.randomUUID(), 0, details(4, 1), FIVE_MINUTES))
			.isEmpty();
		assertThat(this.rules.completes(ModeSpec.CLASSIC.id(), details(4, 1))).isTrue();
	}

	@Test
	void anUndeclaredModeIsRefusedNeverJudgedAsClassic() {
		assertThat(this.rules.problemWith("puzzle-7", UUID.randomUUID(), 4500, fullRun(), FIVE_MINUTES))
			.hasValueSatisfying((problem) -> assertThat(problem).startsWith(RunRules.NO_RULES_FOR_MODE));
		assertThat(this.rules.completes("puzzle-7", fullRun())).isFalse();
	}

}
