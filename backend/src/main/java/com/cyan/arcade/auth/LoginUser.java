package com.cyan.arcade.auth;

import com.cyan.arcade.user.UserCredentials;

import org.springframework.security.core.userdetails.User;

/**
 * A player as Spring Security sees them while a password is being checked. It exists only for the
 * duration of a login attempt; what is kept in the session afterwards is the much smaller
 * {@code AuthenticatedUser}.
 */
final class LoginUser extends User {

	private final Long id;

	LoginUser(UserCredentials credentials) {
		super(credentials.username(), credentials.passwordHash(), AuthConfig.PLAYER_AUTHORITIES);
		this.id = credentials.id();
	}

	Long getId() {
		return this.id;
	}

}
