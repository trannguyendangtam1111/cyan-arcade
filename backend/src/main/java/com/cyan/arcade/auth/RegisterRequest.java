package com.cyan.arcade.auth;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * @param username 3 to 20 letters, digits or underscores; shown to other players
 * @param password 8 to 72 characters (72 is the most bcrypt takes into account)
 */
public record RegisterRequest(
		@NotNull @Pattern(regexp = "^[A-Za-z0-9_]{3,20}$",
				message = "must be 3 to 20 letters, digits or underscores") String username,
		@NotNull @Size(min = 8, max = 72, message = "must be 8 to 72 characters long") String password) {

	@Override
	public String toString() {
		// Never let a password reach a log line.
		return "RegisterRequest[username=%s]".formatted(this.username);
	}

}
