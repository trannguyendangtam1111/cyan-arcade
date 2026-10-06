package com.cyan.arcade.challenge;

/** What a player has to do to complete a challenge. */
enum ChallengeGoal {

	/** Finish a game, whatever the score. */
	PLAY,

	/** Reach a score. */
	SCORE,

	/** Reach a value in a number the game reports about the run, such as lines or the highest tile. */
	DETAIL,

	/**
	 * Do something on the platform a number of times during the day, such as opening card packs.
	 * Not about a game: counted from {@link com.cyan.arcade.common.platform.PlayerActivity} events.
	 */
	COUNT

}
