package com.cyan.arcade.challenge;

/**
 * A challenge a game can be given on some day. {@link ChallengeTemplates} lists them, and the
 * generator turns one into that day's {@link DailyChallenge}.
 *
 * @param description what to do; {@code %s} stands for the game's name
 * @param detail for {@link ChallengeGoal#DETAIL}, which reported number counts; otherwise {@code null}
 * @param xpReward experience points for completing it
 */
record ChallengeTemplate(String title, String description, ChallengeGoal goal, String detail, int target,
		int xpReward) {

	/** Finish one game. Fits every game. */
	static ChallengeTemplate play(String title, String description, int xpReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.PLAY, null, 1, xpReward);
	}

	/** Reach a score in one game. */
	static ChallengeTemplate score(String title, String description, int target, int xpReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.SCORE, null, target, xpReward);
	}

	/** Reach a value in a number the game reports about the run (lines, highest tile, ...). */
	static ChallengeTemplate detail(String title, String description, String detail, int target, int xpReward) {
		return new ChallengeTemplate(title, description, ChallengeGoal.DETAIL, detail, target, xpReward);
	}

	String describe(String gameName) {
		return this.description.formatted(gameName);
	}

}
