package com.cyan.arcade.common.security;

import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * What an account may do. Every account has exactly one role, stored with it; Spring Security sees
 * it as the authority {@code ROLE_<name>}, so {@code hasRole("ADMIN")} and
 * {@code @PreAuthorize("hasRole('ADMIN')")} work as usual.
 *
 * <p>Authorization always goes by the role, never by a username.
 */
public enum Role {

	/** A player: plays the games, collects cards, opens packs within the daily allowance. */
	USER,

	/** Everything a player can do, plus AI mode in the games and packs without a daily allowance. */
	ADMIN;

	/** {@code ROLE_ADMIN} for {@code ADMIN}: what {@code hasRole("ADMIN")} looks for. */
	public String authority() {
		return "ROLE_" + name();
	}

	public List<GrantedAuthority> authorities() {
		return List.of(new SimpleGrantedAuthority(authority()));
	}

}
