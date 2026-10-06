package com.cyan.arcade.profile;

import java.time.Instant;
import java.util.List;

import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.leaderboard.PlayerRanks;
import com.cyan.arcade.profile.ProfileResponse.Cosmetic;
import com.cyan.arcade.user.Avatar;

/**
 * What anyone may see of a player. Deliberately less than their own profile: no account id, no
 * coins or coin history, no inventory beyond what they wear, nothing about sign-in.
 *
 * @param title the title the player wears, or {@code null}
 * @param badge the badge the player wears, or {@code null}
 * @param cosmetic the frame the player wears around their avatar, or {@code null}
 * @param achievements the achievements the player has unlocked, newest first
 * @param achievementsTotal how many achievements there are
 * @param you whether the caller is this player (who may edit it)
 */
public record PublicProfileResponse(String username, String displayName, Avatar avatar, String bio, Role role,
		int level, Instant memberSince, Cosmetic title, Cosmetic badge, Cosmetic cosmetic, Stats stats,
		List<Achievement> achievements, int achievementsTotal, PlayerRanks ranks, boolean you) {

	/**
	 * The player's numbers: the same as on their own profile, without coins.
	 *
	 * @param activities numbers other modules keep, e.g. packs opened
	 */
	public record Stats(long gamesPlayed, long totalScore, long playTimeMs, List<StatsResponse.Activity> activities,
			List<StatsResponse.Game> games) {
	}

	public record Achievement(String code, String name, String description, Instant unlockedAt) {
	}

}
