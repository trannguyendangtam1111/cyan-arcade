package com.cyan.arcade.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank String username, @NotBlank String password) {

	@Override
	public String toString() {
		// Never let a password reach a log line.
		return "LoginRequest[username=%s]".formatted(this.username);
	}

}
