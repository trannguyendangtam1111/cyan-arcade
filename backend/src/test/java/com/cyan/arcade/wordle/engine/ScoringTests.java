package com.cyan.arcade.wordle.engine;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** The score rule, as documented on {@link Scoring} and in API.md. */
class ScoringTests {

	@ParameterizedTest(name = "solved in {0} → {1}")
	@CsvSource({ "1, 600", "2, 500", "3, 400", "4, 300", "5, 200", "6, 100" })
	void fewerGuessesScoreMore(int guesses, int score) {
		assertThat(Scoring.score(true, guesses, 0, 1)).isEqualTo(score);
	}

	@ParameterizedTest(name = "{0} hints → {1}%")
	@CsvSource({ "0, 100, 300", "1, 90, 270", "2, 75, 225", "3, 60, 180" })
	void everyHintCostsPartOfTheScore(int hints, int percent, int score) {
		assertThat(Scoring.hintPercent(hints)).isEqualTo(percent);
		assertThat(Scoring.score(true, 4, hints, 1)).isEqualTo(score);
	}

	@Test
	void theMultiplierRoundsDown() {
		// 500 × 90% = 450; 200 × 75% = 150; 100 × 60% = 60.
		assertThat(Scoring.score(true, 2, 1, 1)).isEqualTo(450);
		assertThat(Scoring.score(true, 5, 2, 1)).isEqualTo(150);
		assertThat(Scoring.score(true, 6, 3, 1)).isEqualTo(60);
	}

	@Test
	void aStreakAddsTenPerDayAfterTheFirstUpToTenDays() {
		assertThat(Scoring.score(true, 3, 0, 1)).isEqualTo(400);
		assertThat(Scoring.score(true, 3, 0, 2)).isEqualTo(410);
		assertThat(Scoring.score(true, 3, 0, 7)).isEqualTo(460);
		assertThat(Scoring.score(true, 3, 0, 11)).isEqualTo(500);
		assertThat(Scoring.score(true, 3, 0, 365)).isEqualTo(500);
		// Not a daily run: no streak, no bonus.
		assertThat(Scoring.score(true, 3, 0, 0)).isEqualTo(400);
	}

	@Test
	void aFailedPuzzleScoresNothing() {
		assertThat(Scoring.score(false, 6, 0, 0)).isZero();
		assertThat(Scoring.score(false, 6, 3, 0)).isZero();
	}

	@Test
	void theBestPossibleRunIsTheCatalogsMaximum() {
		assertThat(Scoring.score(true, 1, 0, 11)).isEqualTo(Scoring.MAX_SCORE).isEqualTo(700);
	}

	@Test
	void onlyRealRunsHaveAScore() {
		assertThatIllegalArgumentException().isThrownBy(() -> Scoring.score(true, 0, 0, 1));
		assertThatIllegalArgumentException().isThrownBy(() -> Scoring.score(true, 7, 0, 1));
		assertThatIllegalArgumentException().isThrownBy(() -> Scoring.score(true, 3, 4, 1));
	}

	@Test
	void detailsAreReachAtLeastNumbersForAchievementsAndChallenges() {
		assertThat(Scoring.details(true, 3, 0, 5)).isEqualTo(Map.of("solved", 1, "guesses", 3, "hints", 0, "speed", 4,
				"cleanSolve", 1, "oneHintSolve", 0, "streak", 5));
		assertThat(Scoring.details(true, 6, 1, 1)).containsEntry("speed", 1)
			.containsEntry("cleanSolve", 0)
			.containsEntry("oneHintSolve", 1);
		assertThat(Scoring.details(false, 6, 2, 0)).containsEntry("solved", 0)
			.containsEntry("speed", 0)
			.containsEntry("streak", 0)
			.containsEntry("cleanSolve", 0);
	}

}
