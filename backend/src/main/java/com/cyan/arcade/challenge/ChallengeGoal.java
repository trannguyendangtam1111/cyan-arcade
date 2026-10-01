package com.cyan.arcade.challenge;

/** What a single run has to do to complete a challenge. */
enum ChallengeGoal {

	/** Finish a game, whatever the score. */
	PLAY,

	/** Reach a score. */
	SCORE,

	/** Reach a value in a number the game reports about the run, such as lines or the highest tile. */
	DETAIL

}
