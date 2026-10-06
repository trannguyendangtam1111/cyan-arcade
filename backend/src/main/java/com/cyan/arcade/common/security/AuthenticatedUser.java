package com.cyan.arcade.common.security;

import java.io.Serializable;

import org.springframework.security.core.AuthenticatedPrincipal;

/**
 * The signed-in player, as kept in the session. Deliberately tiny: an id, a name and the role
 * they signed in with, never the password hash or anything else that could go stale. The session's
 * authorities ({@code ROLE_USER} or {@code ROLE_ADMIN}) are made from the same role, at sign-in.
 *
 * <p>Controllers receive it with {@code @AuthenticationPrincipal AuthenticatedUser user}. It is
 * {@code null} for guests on endpoints that allow them.
 */
public record AuthenticatedUser(Long id, String username, Role role) implements AuthenticatedPrincipal, Serializable {

	@Override
	public String getName() {
		return this.username;
	}

	public boolean hasRole(Role wanted) {
		return this.role == wanted;
	}

}
