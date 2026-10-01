package com.cyan.arcade.progression;

import java.util.List;

/**
 * What a finished run earned the player.
 *
 * @param xpEarned everything this run added: the run itself, a personal-best bonus, achievements
 * and bonuses
 * @param achievements achievements unlocked by this run
 * @param bonuses what other features added on top, such as a completed daily challenge
 * @param totalXp the player's XP afterwards
 * @param level the player's level afterwards
 * @param leveledUp whether this run took the player to a new level
 */
public record Rewards(int xpEarned, boolean personalBest, List<UnlockedAchievement> achievements,
		List<Bonus> bonuses, int totalXp, int level, boolean leveledUp) {

	public record UnlockedAchievement(String code, String name, String description, int xp) {

		static UnlockedAchievement of(Achievement achievement) {
			return new UnlockedAchievement(achievement.code(), achievement.name(), achievement.description(),
					achievement.xp());
		}

	}

}
