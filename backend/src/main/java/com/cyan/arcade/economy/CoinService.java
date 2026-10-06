package com.cyan.arcade.economy;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Coins. The only way a balance changes: every change is one row in the ledger, written together
 * with the new balance in the caller's transaction while the player's wallet is locked.
 *
 * <ul>
 * <li>The amount always comes from the server's own rules; nothing here takes one from a request
 * except {@link #grant}, which only admins can reach and which is recorded with who did it.</li>
 * <li>A change with a {@link CoinReference} happens at most once per player, type and reference,
 * so a repeated or replayed reward pays nothing the second time.</li>
 * <li>A balance never goes below zero: spending more than the balance fails and changes
 * nothing, and the database refuses a negative balance as well.</li>
 * </ul>
 */
@Service
public class CoinService {

	private final CoinStore store;

	private final Clock clock;

	CoinService(CoinStore store, Clock clock) {
		this.store = store;
		this.clock = clock;
	}

	/**
	 * Adds coins the player earned.
	 * @param reference what is rewarded; the same reference is never rewarded twice
	 * @return the transaction, or empty when this reference was already rewarded (or the amount is 0)
	 */
	@Transactional
	public Optional<CoinTransaction> credit(Long userId, CoinTransactionType type, int amount, CoinReference reference,
			String description) {
		if (amount < 0) {
			throw new IllegalArgumentException("A credit cannot be negative");
		}
		if (amount == 0) {
			return Optional.empty();
		}
		return record(userId, type, amount, reference, description, null);
	}

	/**
	 * Takes coins the player spends.
	 * @param reference what is paid for; the same reference is never paid twice
	 * @throws InsufficientCoinsException when the balance is too low, in which case nothing changes
	 */
	@Transactional
	public CoinTransaction debit(Long userId, CoinTransactionType type, int amount, CoinReference reference,
			String description) {
		if (amount <= 0) {
			throw new IllegalArgumentException("A debit must be positive");
		}
		return record(userId, type, -amount, reference, description, null)
			.orElseThrow(() -> new IllegalStateException("Already paid: " + reference));
	}

	/**
	 * Coins given by an admin, recorded as {@link CoinTransactionType#ADMIN_GRANT} with who gave them.
	 * @param reference identifies the grant, so repeating the same request grants once
	 * @return the transaction, or empty when this grant was already made
	 */
	@Transactional
	public Optional<CoinTransaction> grant(Long userId, int amount, CoinReference reference, String description,
			Long adminId) {
		if (amount <= 0) {
			throw new IllegalArgumentException("A grant must be positive");
		}
		return record(userId, CoinTransactionType.ADMIN_GRANT, amount, reference, description, adminId);
	}

	/**
	 * Makes every coin change of this player wait until the current transaction ends, for a caller
	 * that must check something (such as what they own) before deciding to spend.
	 * @return the balance
	 */
	@Transactional
	public long lock(Long userId) {
		return this.store.lockWallet(userId, this.clock.instant());
	}

	@Transactional(readOnly = true)
	public long balanceOf(Long userId) {
		return this.store.balanceOf(userId);
	}

	/** The transaction of this type already recorded for a reference, if any. */
	@Transactional(readOnly = true)
	public Optional<CoinTransaction> find(Long userId, CoinTransactionType type, CoinReference reference) {
		return this.store.find(userId, type, reference);
	}

	/** How many transactions of a type the player has had today (UTC). */
	@Transactional(readOnly = true)
	public long countToday(Long userId, CoinTransactionType type) {
		Instant startOfToday = LocalDate.ofInstant(this.clock.instant(), ZoneOffset.UTC)
			.atStartOfDay(ZoneOffset.UTC)
			.toInstant();
		return this.store.countSince(userId, type, startOfToday);
	}

	/** Everything the player has ever earned, before spending. */
	@Transactional(readOnly = true)
	public long earnedBy(Long userId) {
		return this.store.earnedBy(userId);
	}

	/** All players' balances added up. */
	@Transactional(readOnly = true)
	public long inCirculation() {
		return this.store.inCirculation();
	}

	@Transactional(readOnly = true)
	public TransactionPage transactionsOf(Long userId, int page, int size) {
		long total = this.store.countOf(userId);
		return new TransactionPage(this.store.findPage(userId, page, size), page, size, total,
				(int) Math.ceil((double) total / size));
	}

	/**
	 * One page of a player's transactions, newest first.
	 *
	 * @param page zero-based page number
	 */
	public record TransactionPage(List<CoinTransaction> entries, int page, int size, long totalEntries,
			int totalPages) {
	}

	private Optional<CoinTransaction> record(Long userId, CoinTransactionType type, int amount,
			CoinReference reference, String description, Long createdBy) {
		Instant now = this.clock.instant();
		long balance = this.store.lockWallet(userId, now);
		long after = balance + amount;
		if (after < 0) {
			throw new InsufficientCoinsException(balance, -amount);
		}
		// With the wallet locked, nobody else can record the same reference between this insert and the
		// balance update; the unique index catches it either way.
		Optional<Long> id = this.store.insert(userId, amount, after, type, reference, description, createdBy, now);
		if (id.isEmpty()) {
			return Optional.empty();
		}
		this.store.setBalance(userId, after, now);
		return Optional.of(new CoinTransaction(id.get(), amount, after, type,
				(reference != null) ? reference.type() : null, (reference != null) ? reference.id() : null,
				description, now));
	}

}
