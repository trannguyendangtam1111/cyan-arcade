package com.cyan.arcade.challenge;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import com.cyan.arcade.progression.CompletedRun;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** The rules of daily challenges on their own: which one a game gets, and what completes it. */
class ChallengeRulesTests {

	private static final LocalDate SOME_DAY = LocalDate.of(2026, 10, 1);

	private final ChallengeTemplates templates = new ChallengeTemplates();

	@ParameterizedTest
	@ValueSource(strings = { "snake", "2048", "tetris" })
	void everyGameHasChallengesOfItsOwnPlusTheOnesThatFitAnyGame(String gameSlug) {
		List<ChallengeTemplate> options = this.templates.forGame(gameSlug);

		assertThat(options).hasSizeGreaterThan(2);
		assertThat(options).extracting(ChallengeTemplate::goal).contains(ChallengeGoal.PLAY);
		assertThat(options).extracting(ChallengeTemplate::title).doesNotHaveDuplicates();
		assertThat(options).allSatisfy((template) -> {
			assertThat(template.xpReward()).isPositive();
			assertThat(template.target()).isPositive();
			assertThat(template.detail() != null).isEqualTo(template.goal() == ChallengeGoal.DETAIL);
		});
	}

	@Test
	void aGameWithoutChallengesOfItsOwnStillGetsOne() {
		ChallengeTemplate template = this.templates.pick("minesweeper", 3, SOME_DAY);

		assertThat(template.goal()).isEqualTo(ChallengeGoal.PLAY);
		assertThat(template.describe("Minesweeper")).isEqualTo("Finish a game of Minesweeper.");
	}

	@Test
	void theSameDayAlwaysGivesTheSameChallenge() {
		assertThat(this.templates.pick("tetris", 2, SOME_DAY)).isEqualTo(this.templates.pick("tetris", 2, SOME_DAY));
	}

	@ParameterizedTest
	@ValueSource(strings = { "snake", "2048", "tetris" })
	void aGamesChallengesTakeTurnsSoEveryOneComesAround(String gameSlug) {
		List<ChallengeTemplate> options = this.templates.forGame(gameSlug);

		List<ChallengeTemplate> overOneRound = IntStream.range(0, options.size())
			.mapToObj((day) -> this.templates.pick(gameSlug, 0, SOME_DAY.plusDays(day)))
			.toList();

		assertThat(overOneRound).containsExactlyInAnyOrderElementsOf(options);
		// And tomorrow is never the same as today.
		assertThat(this.templates.pick(gameSlug, 0, SOME_DAY.plusDays(1)))
			.isNotEqualTo(this.templates.pick(gameSlug, 0, SOME_DAY));
	}

	@Test
	void aPlayChallengeIsMetByAnyFinishedGame() {
		assertThat(challenge(ChallengeGoal.PLAY, null, 1).isMetBy(run(0, Map.of()))).isTrue();
	}

	@Test
	void aScoreChallengeIsMetByReachingTheScore() {
		DailyChallenge challenge = challenge(ChallengeGoal.SCORE, null, 10);

		assertThat(challenge.isMetBy(run(9, Map.of()))).isFalse();
		assertThat(challenge.isMetBy(run(10, Map.of()))).isTrue();
		assertThat(challenge.isMetBy(run(25, Map.of()))).isTrue();
	}

	@Test
	void aDetailChallengeLooksAtTheNumberTheGameReported() {
		DailyChallenge challenge = challenge(ChallengeGoal.DETAIL, "lines", 5);

		assertThat(challenge.isMetBy(run(9000, Map.of("lines", 4)))).isFalse();
		assertThat(challenge.isMetBy(run(0, Map.of("lines", 5)))).isTrue();
		// A run that did not report the number has not reached it, whatever else it reported.
		assertThat(challenge.isMetBy(run(9000, Map.of("highestTile", 2048)))).isFalse();
	}

	private static DailyChallenge challenge(ChallengeGoal goal, String detail, int target) {
		return new DailyChallenge(1L, SOME_DAY, 1L, null, null, "Title", "Description", goal, detail, target, 30, 60);
	}

	private static CompletedRun run(int score, Map<String, Integer> details) {
		return new CompletedRun(UUID.randomUUID(), 1L, "tetris", score, details, false, 1);
	}

}
