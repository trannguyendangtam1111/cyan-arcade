package com.cyan.arcade.progression;

import java.time.Instant;

/**
 * An achievement as one player sees it.
 *
 * @param coins coins awarded on unlocking
 * @param unlockedAt when the player unlocked it, or {@code null} while it is still locked
 * @param progress how far the player is towards {@code target}, never above it; {@code null} when it
 * is unlocked, has no measurable goal, or progress was not asked for
 * @param target the value the achievement's rule must see, when progress is shown; {@code null} with
 * {@code progress}
 * @param goal what {@code progress} counts, so it can be explained: games finished under Classic rules
 * (Classic runs of every game and Sudoku's ranked boards), or the best Classic score of one game;
 * {@code null} with {@code progress}
 */
public record AchievementStatus(String code, String name, String description, int xp, int coins, boolean unlocked,
		Instant unlockedAt, Integer progress, Integer target, Achievement.Goal.Kind goal) {

	/** Without progress: what every caller but the player's own achievements list needs. */
	public AchievementStatus(String code, String name, String description, int xp, int coins, boolean unlocked,
			Instant unlockedAt) {
		this(code, name, description, xp, coins, unlocked, unlockedAt, null, null, null);
	}

}
