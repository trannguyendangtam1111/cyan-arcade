package com.cyan.arcade.challenge;

import java.time.LocalDate;

import com.cyan.arcade.progression.CompletedRun;

/**
 * One challenge of one day, as stored in {@code daily_challenges}.
 *
 * @param date the day it can be completed, in UTC
 * @param detail for {@link ChallengeGoal#DETAIL}, which reported number counts; otherwise {@code null}
 */
record DailyChallenge(Long id, LocalDate date, Long gameId, String title, String description, ChallengeGoal goal,
		String detail, int target, int xpReward) {

	/** Whether a run of this challenge's game did what the challenge asks. */
	boolean isMetBy(CompletedRun run) {
		return switch (this.goal) {
			case PLAY -> true;
			case SCORE -> run.score() >= this.target;
			case DETAIL -> run.detail(this.detail) >= this.target;
		};
	}

}
