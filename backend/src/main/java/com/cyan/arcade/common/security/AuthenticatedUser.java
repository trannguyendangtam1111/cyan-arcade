package com.cyan.arcade.common.security;

import java.io.Serializable;

import org.springframework.security.core.AuthenticatedPrincipal;

/**
 * The signed-in player, as kept in the session. Deliberately tiny: an id and a name, never the
 * password hash or anything else that could go stale.
 *
 * <p>Controllers receive it with {@code @AuthenticationPrincipal AuthenticatedUser user}. It is
 * {@code null} for guests on endpoints that allow them.
 */
public record AuthenticatedUser(Long id, String username) implements AuthenticatedPrincipal, Serializable {

	@Override
	public String getName() {
		return this.username;
	}

}
