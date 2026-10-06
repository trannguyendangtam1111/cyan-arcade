package com.cyan.arcade.user;

import java.time.Instant;

import com.cyan.arcade.common.security.Role;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A player account. */
@Entity
@Table(name = "users")
class User {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, updatable = false)
	private String username;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	// What other players see. Changeable; the username is the identity and is not.
	@Column(name = "display_name", nullable = false)
	private String displayName;

	@Column(name = "bio")
	private String bio;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Avatar avatar;

	// Fixed at creation: there is no way to promote or demote an account through the application.
	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false)
	private Role role;

	// Only ever changed by an atomic "xp = xp + n" update, so two runs finishing at once both count.
	@Column(nullable = false, updatable = false)
	private int xp;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected User() {
	}

	User(String username, String passwordHash, Role role, Instant createdAt) {
		this.username = username;
		this.passwordHash = passwordHash;
		this.displayName = username;
		this.avatar = Avatar.ROBOT;
		this.role = role;
		this.createdAt = createdAt;
	}

	Long getId() {
		return this.id;
	}

	String getUsername() {
		return this.username;
	}

	String getPasswordHash() {
		return this.passwordHash;
	}

	Avatar getAvatar() {
		return this.avatar;
	}

	Role getRole() {
		return this.role;
	}

	void setAvatar(Avatar avatar) {
		this.avatar = avatar;
	}

	String getDisplayName() {
		return this.displayName;
	}

	void setDisplayName(String displayName) {
		this.displayName = displayName;
	}

	String getBio() {
		return this.bio;
	}

	void setBio(String bio) {
		this.bio = bio;
	}

	int getXp() {
		return this.xp;
	}

	Instant getCreatedAt() {
		return this.createdAt;
	}

}
