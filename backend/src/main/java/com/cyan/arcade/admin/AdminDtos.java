package com.cyan.arcade.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.common.security.Role;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** What the admin endpoints take and return. */
final class AdminDtos {

	/** The most coins one grant may give. */
	static final int MAX_GRANT = 100_000;

	private AdminDtos() {
	}

	/**
	 * The arcade at a glance.
	 *
	 * @param activeUsers accounts that finished a game or had coins change in the last 7 days
	 * @param coinsInCirculation every player's balance added up
	 * @param activities numbers other modules keep (e.g. packs opened), all time and today
	 */
	record StatsResponse(long totalUsers, long activeUsers, long newUsersToday, long gamesPlayed, long gamesToday,
			long coinsInCirculation, List<Activity> activities, Instant generatedAt) {

		/** @param today the part of {@code value} since the start of today (UTC) */
		record Activity(String key, String label, long value, Long today) {
		}

	}

	/** An account, as an admin looking someone up sees it. */
	record UserSummary(Long id, String username, Role role, int level, long coins, Instant memberSince) {
	}

	/**
	 * Coins to give a player.
	 *
	 * @param reason why, recorded with the grant
	 * @param requestId a random id the client makes for each grant it means to make; repeating a
	 * request with the same one grants once
	 */
	record GrantRequest(@NotNull @Min(1) @Max(MAX_GRANT) Integer amount, @NotBlank @Size(max = 150) String reason,
			@NotNull UUID requestId) {
	}

	/**
	 * @param balance the player's coins afterwards
	 * @param repeated {@code true} when this request had already been made: nothing was granted
	 * this time
	 */
	record GrantResponse(Long transactionId, Long userId, String username, int amount, long balance,
			boolean repeated) {
	}

}
