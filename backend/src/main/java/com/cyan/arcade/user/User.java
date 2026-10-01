package com.cyan.arcade.user;

import java.time.Instant;

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

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Avatar avatar;

	// Only ever changed by an atomic "xp = xp + n" update, so two runs finishing at once both count.
	@Column(nullable = false, updatable = false)
	private int xp;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected User() {
	}

	User(String username, String passwordHash, Instant createdAt) {
		this.username = username;
		this.passwordHash = passwordHash;
		this.avatar = Avatar.ROBOT;
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

	void setAvatar(Avatar avatar) {
		this.avatar = avatar;
	}

	int getXp() {
		return this.xp;
	}

	Instant getCreatedAt() {
		return this.createdAt;
	}

}
