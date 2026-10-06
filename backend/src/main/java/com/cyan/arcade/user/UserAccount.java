package com.cyan.arcade.user;

import java.time.Instant;

import com.cyan.arcade.common.security.Role;

/**
 * What other features may know about a player. The password hash never leaves the {@code user}
 * package except through {@link UserService#findCredentials}.
 */
public record UserAccount(Long id, String username, Avatar avatar, Role role, int xp, Instant createdAt) {

	static UserAccount from(User user) {
		return new UserAccount(user.getId(), user.getUsername(), user.getAvatar(), user.getRole(), user.getXp(),
				user.getCreatedAt());
	}

}
