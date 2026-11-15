package com.cyan.arcade.progression;

import java.util.OptionalInt;

/**
 * A player's numbers that achievement goals compare (see {@link Achievement.Goal}), supplied by the
 * module that records runs. Only shown to the player; unlocking is decided by the rules, run by run.
 */
public interface AchievementProgress {

	/** Classic games finished, counted as games-played achievements count them. */
	long gamesPlayed();

	/** The best Classic score in a game, or empty when the player has none there. */
	OptionalInt bestScore(String gameSlug);

}
