package com.cyan.arcade.economy;

import java.time.Instant;

/**
 * One recorded change to a player's balance.
 *
 * @param amount positive when coins were earned, negative when spent
 * @param balanceAfter the balance right after this change
 * @param referenceType what the change is about, or {@code null}
 * @param referenceId which one, or {@code null}
 */
public record CoinTransaction(Long id, int amount, long balanceAfter, CoinTransactionType type,
		String referenceType, String referenceId, String description, Instant createdAt) {
}
