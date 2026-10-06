package com.cyan.arcade.user;

import com.cyan.arcade.common.security.Role;

/**
 * What is needed to check a login attempt. Used by authentication only.
 *
 * @param passwordHash the stored hash, to be compared by a password encoder
 * @param role what the account may do; becomes the session's authority
 */
public record UserCredentials(Long id, String username, String passwordHash, Role role) {

	@Override
	public String toString() {
		// Keep the hash out of logs and error messages.
		return "UserCredentials[id=%d, username=%s, role=%s]".formatted(this.id, this.username, this.role);
	}

}
