package com.cyan.arcade.progression;

/**
 * Turns experience points into a level.
 *
 * <p>Level 1 starts at 0 XP. Each level takes 100 XP more than the one before: reaching level 2
 * takes 100 XP, level 3 another 200 (300 in total), level 4 another 300 (600 in total), and so on.
 */
public final class Levels {

	private static final int XP_PER_LEVEL_STEP = 100;

	private Levels() {
	}

	/** Total XP needed to be at the given level. */
	public static int xpToReach(int level) {
		return XP_PER_LEVEL_STEP * level * (level - 1) / 2;
	}

	public static int levelFor(int xp) {
		int level = 1;
		while (xp >= xpToReach(level + 1)) {
			level++;
		}
		return level;
	}

	public static LevelProgress progress(int xp) {
		int level = levelFor(xp);
		int levelStart = xpToReach(level);
		return new LevelProgress(level, xp - levelStart, xpToReach(level + 1) - levelStart);
	}

	/**
	 * Where a player stands within their current level.
	 *
	 * @param xpIntoLevel XP earned since reaching this level
	 * @param xpForNextLevel XP this level takes in total, from its start to the next level
	 */
	public record LevelProgress(int level, int xpIntoLevel, int xpForNextLevel) {
	}

}
