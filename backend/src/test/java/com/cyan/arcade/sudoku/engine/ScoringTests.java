package com.cyan.arcade.sudoku.engine;

import java.time.LocalDate;
import java.util.Map;

import com.cyan.arcade.sudoku.engine.Scoring.Summary;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The score formula, its caps, and the details a run reports. Also the daily streaks. */
class ScoringTests {

	@Test
	void aSolveAtParWithNoMistakeOrHintScoresItsBase() {
		for (Difficulty difficulty : Difficulty.values()) {
			Summary atPar = new Summary(true, false, difficulty, difficulty.parSeconds(), 0, 0, 0);
			assertThat(Scoring.score(atPar)).isEqualTo(difficulty.baseScore());
		}
	}

	@Test
	void timeMistakesAndHintsEachTakeTheirShare() {
		// Medium (2,000, par 600 s) in 300 s: 125%; one mistake: 85%; two hints: 75%.
		Summary run = new Summary(true, false, Difficulty.MEDIUM, 300, 1, 2, 0);
		assertThat(Scoring.timePercent(Difficulty.MEDIUM, 300)).isEqualTo(125);
		assertThat(Scoring.mistakePercent(1)).isEqualTo(85);
		assertThat(Scoring.hintPercent(2)).isEqualTo(75);
		assertThat(Scoring.score(run)).isEqualTo(2000 * 125 * 85 * 75 / 1_000_000);
		assertThat(Scoring.HINT_PERCENTS).containsExactly(100, 90, 75, 60);
	}

	@Test
	void theTimeBonusIsCappedBothWays() {
		assertThat(Scoring.timePercent(Difficulty.EXPERT, 0)).isEqualTo(150);
		assertThat(Scoring.timePercent(Difficulty.EXPERT, 10 * Difficulty.EXPERT.parSeconds())).isEqualTo(50);
		Summary fastest = new Summary(true, false, Difficulty.EXPERT, 0, 0, 0, 0);
		assertThat(Scoring.score(fastest)).isEqualTo(Scoring.MAX_SCORE);
		assertThat(Scoring.mistakePercent(10)).isEqualTo(55);
	}

	@Test
	void aFailedGameScoresNothing() {
		assertThat(Scoring.score(new Summary(false, true, Difficulty.EXPERT, 10, 3, 0, 0))).isZero();
	}

	@Test
	void detailsSayWhatTheRunWas() {
		Map<String, Integer> hardDaily = Scoring.details(new Summary(true, true, Difficulty.HARD, 400, 0, 0, 3));
		assertThat(hardDaily).hasSize(10)
			.containsEntry("difficulty", 3)
			.containsEntry("seconds", 400)
			.containsEntry("solvedLevel", 3)
			.containsEntry("flawless", 3)
			.containsEntry("cleanSolve", 3)
			.containsEntry("speedSolve", 1)
			.containsEntry("dailyGrade", 4)
			.containsEntry("streak", 3);
		// The daily grade drops with each hint or mistake and outside par time.
		assertThat(Scoring.details(new Summary(true, true, Difficulty.HARD, 4000, 0, 0, 1))).containsEntry("dailyGrade", 3);
		assertThat(Scoring.details(new Summary(true, true, Difficulty.HARD, 400, 1, 0, 1))).containsEntry("dailyGrade", 2);
		assertThat(Scoring.details(new Summary(true, true, Difficulty.HARD, 400, 0, 1, 1))).containsEntry("dailyGrade", 1);

		// Practice never sets a daily flag or a streak, whatever it claims.
		Map<String, Integer> practice = Scoring.details(new Summary(true, false, Difficulty.EASY, 9999, 2, 1, 5));
		assertThat(practice).containsEntry("dailyGrade", 0)
			.containsEntry("streak", 0)
			.containsEntry("flawless", 0)
			.containsEntry("cleanSolve", 0)
			.containsEntry("speedSolve", 0)
			.containsEntry("solvedLevel", 1);

		Map<String, Integer> failed = Scoring.details(new Summary(false, true, Difficulty.EXPERT, 100, 3, 0, 0));
		assertThat(failed).containsEntry("solvedLevel", 0).containsEntry("dailyGrade", 0).containsEntry("streak", 0);
	}

	@Test
	void streaksCountSolvedDaysInARowOnce() {
		LocalDate today = LocalDate.of(2026, 10, 9);
		Map<LocalDate, Boolean> results = Map.of(today.minusDays(3), true, today.minusDays(2), false,
				today.minusDays(1), true, today, true);
		assertThat(Streaks.endingOn(results, today)).isEqualTo(2);
		assertThat(Streaks.current(results, today)).isEqualTo(2);
		assertThat(Streaks.current(results, today.plusDays(1))).isEqualTo(2);
		assertThat(Streaks.current(results, today.plusDays(2))).isZero();
		assertThat(Streaks.best(Map.of(today.minusDays(5), true, today.minusDays(4), true, today.minusDays(3), true,
				today, true))).isEqualTo(3);
	}

}
