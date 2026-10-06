package com.cyan.arcade.profile;

import java.time.Instant;

import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.user.Avatar;

/**
 * A player's own profile.
 *
 * @param username the account's identity, which never changes
 * @param displayName what other players see
 * @param bio a few words by the player, or {@code null}
 * @param xp total experience points
 * @param xpIntoLevel XP earned since reaching the current level
 * @param xpForNextLevel XP the current level takes in total; with {@code xpIntoLevel} this gives
 * the progress bar
 * @param coins the player's coin balance
 * @param totalScore sum of the scores of every game the player has finished
 * @param title the title the player wears, or {@code null}
 * @param badge the badge the player wears, or {@code null}
 * @param cosmetic the frame the player wears around their avatar, or {@code null}
 */
public record ProfileResponse(Long id, String username, String displayName, String bio, Avatar avatar, Role role,
		int xp, int level, int xpIntoLevel, int xpForNextLevel, long coins, long gamesPlayed, long totalScore,
		int achievementsUnlocked, int achievementsTotal, Cosmetic title, Cosmetic badge, Cosmetic cosmetic,
		Instant memberSince) {

	/** Something worn on the profile, bought in the shop. */
	public record Cosmetic(String code, String name, String icon) {
	}

}
