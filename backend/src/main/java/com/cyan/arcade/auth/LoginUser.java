package com.cyan.arcade.auth;

import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.user.UserCredentials;

import org.springframework.security.core.userdetails.User;

/**
 * A player as Spring Security sees them while a password is being checked. It exists only for the
 * duration of a login attempt; what is kept in the session afterwards is the much smaller
 * {@code AuthenticatedUser}, with the same role.
 */
final class LoginUser extends User {

	private final Long id;

	private final Role role;

	LoginUser(UserCredentials credentials) {
		super(credentials.username(), credentials.passwordHash(), credentials.role().authorities());
		this.id = credentials.id();
		this.role = credentials.role();
	}

	Long getId() {
		return this.id;
	}

	Role getRole() {
		return this.role;
	}

}
