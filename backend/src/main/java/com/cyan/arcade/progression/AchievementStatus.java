package com.cyan.arcade.progression;

import java.time.Instant;

/**
 * An achievement as one player sees it.
 *
 * @param unlockedAt when the player unlocked it, or {@code null} while it is still locked
 */
public record AchievementStatus(String code, String name, String description, int xp, boolean unlocked,
		Instant unlockedAt) {
}
