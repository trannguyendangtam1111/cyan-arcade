package com.cyan.arcade.auth;

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
		return new SessionResponse(true, new SessionUser(account.id(), account.username(), account.avatar()));
	}

	public record SessionUser(Long id, String username, Avatar avatar) {
	}

}
