package com.cyan.arcade.challenge;

/**
 * A challenge that can be given out on some day. {@link ChallengeTemplates} lists them, and the
 * generator turns one into that day's {@link DailyChallenge}.
 *
 * @param description what to do; for a game's challenge, {@code %s} stands for the game's name
 * @param detail for {@link ChallengeGoal#DETAIL}, which reported number counts; otherwise {@code null}
 * @param xpReward experience points for completing it
 * @param coinReward coins for completing it
 */
record ChallengeTemplate(String title, String description, ChallengeGoal goal, String detail, int target,
		int xpReward, int coinReward) {

	/** Finish one game. Fits every game. */
	static ChallengeTemplate play(String title, String description, int xpReward, int coinReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.PLAY, null, 1, xpReward, coinReward);
	}

	/** Reach a score in one game. */
	static ChallengeTemplate score(String title, String description, int target, int xpReward, int coinReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.SCORE, null, target, xpReward, coinReward);
	}

	/** Reach a value in a number the game reports about the run (lines, highest tile, ...). */
	static ChallengeTemplate detail(String title, String description, String detail, int target, int xpReward,
			int coinReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.DETAIL, detail, target, xpReward, coinReward);
	}

	/** Do an activity this many times in the day. */
	static ChallengeTemplate count(String title, String description, int target, int xpReward, int coinReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.COUNT, null, target, xpReward, coinReward);
	}

	String describe(String gameName) {
		return this.description.formatted(gameName);
	}

}
