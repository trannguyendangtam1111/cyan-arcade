package com.cyan.arcade.tcg.opening;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Opened packs and the cards they produced. Backed by {@code tcg_pack_openings} and its cards. */
@Repository
class PackOpeningStore {

	private final JdbcClient jdbc;

	PackOpeningStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	record OpeningRow(Long id, Long packId, Instant openedAt) {
	}

	record OpeningCardRow(Long openingId, int position, Long cardId, boolean wasNew) {
	}

	/**
	 * Makes a player's pack openings wait for each other until the current transaction ends, so
	 * "how many packs today" cannot be read by two openings at once and both be let through.
	 * An advisory lock rather than a row lock: there is no row of this module's to lock before the
	 * player's first pack.
	 */
	void lockOpeningsOf(Long userId) {
		this.jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended('tcg-pack-opening:' || :userId, 0))")
			.param("userId", userId.toString())
			.query((row, index) -> 0)
			.list();
	}

	long countSince(Long userId, Instant since) {
		return this.jdbc
			.sql("SELECT count(*) FROM tcg_pack_openings WHERE user_id = :userId AND opened_at >= :since")
			.param("userId", userId)
			.param("since", OffsetDateTime.ofInstant(since, ZoneOffset.UTC))
			.query(Long.class)
			.single();
	}

	Long insert(Long userId, Long packId, Instant openedAt) {
		return this.jdbc.sql("""
				INSERT INTO tcg_pack_openings (user_id, pack_id, opened_at)
				VALUES (:userId, :packId, :openedAt)
				RETURNING id
				""")
			.param("userId", userId)
			.param("packId", packId)
			.param("openedAt", OffsetDateTime.ofInstant(openedAt, ZoneOffset.UTC))
			.query(Long.class)
			.single();
	}

	void insertCard(Long openingId, int position, Long cardId, boolean wasNew) {
		this.jdbc.sql("""
				INSERT INTO tcg_pack_opening_cards (opening_id, position, card_id, was_new)
				VALUES (:openingId, :position, :cardId, :wasNew)
				""")
			.param("openingId", openingId)
			.param("position", position)
			.param("cardId", cardId)
			.param("wasNew", wasNew)
			.update();
	}

	/** One page of a player's openings, newest first. */
	List<OpeningRow> findPage(Long userId, int page, int size) {
		return this.jdbc.sql("""
				SELECT id, pack_id, opened_at
				FROM tcg_pack_openings
				WHERE user_id = :userId
				ORDER BY opened_at DESC, id DESC
				LIMIT :size OFFSET :offset
				""")
			.param("userId", userId)
			.param("size", size)
			.param("offset", (long) page * size)
			.query((row, index) -> new OpeningRow(row.getLong("id"), row.getLong("pack_id"),
					row.getObject("opened_at", OffsetDateTime.class).toInstant()))
			.list();
	}

	long countOf(Long userId) {
		return this.jdbc.sql("SELECT count(*) FROM tcg_pack_openings WHERE user_id = :userId")
			.param("userId", userId)
			.query(Long.class)
			.single();
	}

	/** The cards of several openings, in the order they came out of each pack. */
	List<OpeningCardRow> findCards(Collection<Long> openingIds) {
		if (openingIds.isEmpty()) {
			return List.of();
		}
		return this.jdbc.sql("""
				SELECT opening_id, position, card_id, was_new
				FROM tcg_pack_opening_cards
				WHERE opening_id IN (:openingIds)
				ORDER BY opening_id, position
				""")
			.param("openingIds", openingIds)
			.query((row, index) -> new OpeningCardRow(row.getLong("opening_id"), row.getInt("position"),
					row.getLong("card_id"), row.getBoolean("was_new")))
			.list();
	}

}
