package com.cyan.arcade.progression;

/**
 * What {@link ProgressionService#rewardCompletion} paid for a completed game.
 *
 * @param xp the XP added
 * @param coins the coins credited: fewer than asked for (none) when the day's paid games were used up
 */
public record CompletionReward(int xp, int coins) {
}
