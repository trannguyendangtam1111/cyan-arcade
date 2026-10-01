package com.cyan.arcade.profile;

import java.time.Instant;

import com.cyan.arcade.user.Avatar;

/**
 * A player's own profile.
 *
 * @param xp total experience points
 * @param xpIntoLevel XP earned since reaching the current level
 * @param xpForNextLevel XP the current level takes in total; with {@code xpIntoLevel} this gives
 * the progress bar
 * @param totalScore sum of the scores of every game the player has finished
 */
public record ProfileResponse(Long id, String username, Avatar avatar, int xp, int level, int xpIntoLevel,
		int xpForNextLevel, long gamesPlayed, long totalScore, int achievementsUnlocked, int achievementsTotal,
		Instant memberSince) {
}
