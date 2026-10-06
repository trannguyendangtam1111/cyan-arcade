package com.cyan.arcade.auth;

import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.user.Avatar;
import com.cyan.arcade.user.UserAccount;

/**
 * Who is signed in, if anyone.
 *
 * @param user the signed-in player, or {@code null} for a guest
 */
public record SessionResponse(boolean authenticated, SessionUser user) {

	static final SessionResponse GUEST = new SessionResponse(false, null);

	static SessionResponse of(UserAccount account) {
		return new SessionResponse(true,
				new SessionUser(account.id(), account.username(), account.displayName(), account.avatar(), account.role()));
	}

	/**
	 * @param displayName what the player is called on screen; {@code username} is who they are
	 * @param role what the player may do; the app shows AI mode and admin pages for {@code ADMIN}
	 */
	public record SessionUser(Long id, String username, String displayName, Avatar avatar, Role role) {
	}

}
