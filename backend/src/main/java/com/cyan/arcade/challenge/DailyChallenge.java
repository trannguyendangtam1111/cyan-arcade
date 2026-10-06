package com.cyan.arcade.challenge;

import java.time.LocalDate;

import com.cyan.arcade.progression.CompletedRun;

/**
 * One challenge of one day, as stored in {@code daily_challenges}. It is about either a game
 * ({@code gameId}) or an activity ({@code activity}), never both.
 *
 * @param date the day it can be completed, in UTC
 * @param gameId the game it is played in, or {@code null} for an activity's challenge
 * @param activity the activity it counts ({@link ChallengeGoal#COUNT}), or {@code null}
 * @param activityName what to call that activity on screen, or {@code null}
 * @param detail for {@link ChallengeGoal#DETAIL}, which reported number counts; otherwise {@code null}
 */
record DailyChallenge(Long id, LocalDate date, Long gameId, String activity, String activityName, String title,
		String description, ChallengeGoal goal, String detail, int target, int xpReward, int coinReward) {

	boolean isAboutAGame() {
		return this.gameId != null;
	}

	/** Whether a run of this challenge's game did what the challenge asks. */
	boolean isMetBy(CompletedRun run) {
		return switch (this.goal) {
			case PLAY -> true;
			case SCORE -> run.score() >= this.target;
			case DETAIL -> run.detail(this.detail) >= this.target;
			// Counted over the day, never by a single run.
			case COUNT -> false;
		};
	}

}
