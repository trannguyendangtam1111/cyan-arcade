package com.cyan.arcade.user;

/**
 * What is needed to check a login attempt. Used by authentication only.
 *
 * @param passwordHash the stored hash, to be compared by a password encoder
 */
public record UserCredentials(Long id, String username, String passwordHash) {

	@Override
	public String toString() {
		// Keep the hash out of logs and error messages.
		return "UserCredentials[id=%d, username=%s]".formatted(this.id, this.username);
	}

}
