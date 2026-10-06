package com.cyan.arcade.user;

import java.time.Instant;

import com.cyan.arcade.common.security.Role;

/**
 * What other features may know about a player. The password hash never leaves the {@code user}
 * package except through {@link UserService#findCredentials}.
 *
 * @param username the account's identity: unique, used to sign in and in profile links, never changed
 * @param displayName what other players see; the player may change it
 * @param bio a few words by the player, or {@code null}
 */
public record UserAccount(Long id, String username, String displayName, String bio, Avatar avatar, Role role, int xp,
		Instant createdAt) {

	static UserAccount from(User user) {
		return new UserAccount(user.getId(), user.getUsername(), user.getDisplayName(), user.getBio(),
				user.getAvatar(), user.getRole(), user.getXp(), user.getCreatedAt());
	}

}
