package com.cyan.arcade.economy;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Balances and the ledger. Backed by {@code user_wallets} and {@code coin_transactions}. */
@Repository
class CoinStore {

	private final JdbcClient jdbc;

	CoinStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Locks the player's wallet until the current transaction ends, creating it (empty) first if
	 * needed, so every change to one balance happens one at a time.
	 * @return the balance
	 */
	long lockWallet(Long userId, Instant now) {
		this.jdbc.sql("""
				INSERT INTO user_wallets (user_id, balance, updated_at) VALUES (:userId, 0, :now)
				ON CONFLICT (user_id) DO NOTHING
				""").param("userId", userId).param("now", at(now)).update();
		return this.jdbc.sql("SELECT balance FROM user_wallets WHERE user_id = :userId FOR UPDATE")
			.param("userId", userId)
			.query(Long.class)
			.single();
	}

	long balanceOf(Long userId) {
		return this.jdbc.sql("SELECT balance FROM user_wallets WHERE user_id = :userId")
			.param("userId", userId)
			.query(Long.class)
			.optional()
			.orElse(0L);
	}

	/**
	 * Records a transaction.
	 * @return its id, or empty when the player already has one of this type for this reference
	 */
	Optional<Long> insert(Long userId, int amount, long balanceAfter, CoinTransactionType type,
			CoinReference reference, String description, Long createdBy, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO coin_transactions
				    (user_id, amount, balance_after, type, reference_type, reference_id, description, created_by,
				     created_at)
				VALUES (:userId, :amount, :balanceAfter, :type, :referenceType, :referenceId, :description,
				        :createdBy, :now)
				ON CONFLICT (user_id, type, reference_id) WHERE reference_id IS NOT NULL DO NOTHING
				RETURNING id
				""")
			.param("userId", userId)
			.param("amount", amount)
			.param("balanceAfter", balanceAfter)
			.param("type", type.name())
			.param("referenceType", (reference != null) ? reference.type() : null, Types.VARCHAR)
			.param("referenceId", (reference != null) ? reference.id() : null, Types.VARCHAR)
			.param("description", description)
			.param("createdBy", createdBy, Types.BIGINT)
			.param("now", at(now))
			.query(Long.class)
			.optional();
	}

	void setBalance(Long userId, long balance, Instant now) {
		this.jdbc.sql("UPDATE user_wallets SET balance = :balance, updated_at = :now WHERE user_id = :userId")
			.param("userId", userId)
			.param("balance", balance)
			.param("now", at(now))
			.update();
	}

	Optional<CoinTransaction> find(Long userId, CoinTransactionType type, CoinReference reference) {
		return this.jdbc.sql("""
				SELECT id, amount, balance_after, type, reference_type, reference_id, description, created_at
				FROM coin_transactions
				WHERE user_id = :userId AND type = :type AND reference_id = :referenceId
				""")
			.param("userId", userId)
			.param("type", type.name())
			.param("referenceId", reference.id())
			.query(CoinStore::toTransaction)
			.optional();
	}

	/** How many transactions of a type a player has had since a moment. */
	long countSince(Long userId, CoinTransactionType type, Instant since) {
		return this.jdbc.sql("""
				SELECT count(*) FROM coin_transactions
				WHERE user_id = :userId AND type = :type AND created_at >= :since
				""")
			.param("userId", userId)
			.param("type", type.name())
			.param("since", at(since))
			.query(Long.class)
			.single();
	}

	/** One page of a player's transactions, newest first. */
	List<CoinTransaction> findPage(Long userId, int page, int size) {
		return this.jdbc.sql("""
				SELECT id, amount, balance_after, type, reference_type, reference_id, description, created_at
				FROM coin_transactions
				WHERE user_id = :userId
				ORDER BY created_at DESC, id DESC
				LIMIT :size OFFSET :offset
				""")
			.param("userId", userId)
			.param("size", size)
			.param("offset", (long) page * size)
			.query(CoinStore::toTransaction)
			.list();
	}

	long countOf(Long userId) {
		return this.jdbc.sql("SELECT count(*) FROM coin_transactions WHERE user_id = :userId")
			.param("userId", userId)
			.query(Long.class)
			.single();
	}

	/** Everything a player has ever earned, spending left out. */
	long earnedBy(Long userId) {
		return this.jdbc.sql("SELECT coalesce(sum(amount), 0) FROM coin_transactions WHERE user_id = :userId AND amount > 0")
			.param("userId", userId)
			.query(Long.class)
			.single();
	}

	/** Every player's balance added up. */
	long inCirculation() {
		return this.jdbc.sql("SELECT coalesce(sum(balance), 0) FROM user_wallets").query(Long.class).single();
	}

	private static CoinTransaction toTransaction(ResultSet row, int index) throws SQLException {
		return new CoinTransaction(row.getLong("id"), row.getInt("amount"), row.getLong("balance_after"),
				CoinTransactionType.valueOf(row.getString("type")), row.getString("reference_type"),
				row.getString("reference_id"), row.getString("description"),
				row.getObject("created_at", OffsetDateTime.class).toInstant());
	}

	private static OffsetDateTime at(Instant instant) {
		return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
	}

}
