package com.cyan.arcade.tcg.collection;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import com.cyan.arcade.tcg.game.GameRef;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Repository;

/** Who owns how many copies of which card. Backed by {@code tcg_user_cards}. */
@Repository
class CollectionStore {

	private final JdbcClient jdbc;

	CollectionStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	record SetRow(Long id, String code, String name, String imageUrl, String coverImageUrl, GameRef game,
			int totalCards, int ownedCards, long copies) {
	}

	record OwnedRow(Long cardId, int quantity, Instant firstObtainedAt, Instant lastObtainedAt) {
	}

	/**
	 * Adds one copy of a card to a player's collection.
	 *
	 * <p>One statement, so two packs opened at the same moment cannot lose a copy between them: the
	 * database either inserts the first copy or adds one to the count it has.
	 * @return how many copies the player owns afterwards; 1 means the card is new to them
	 */
	int addCopy(Long userId, Long cardId, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO tcg_user_cards (user_id, card_id, quantity, first_obtained_at, last_obtained_at)
				VALUES (:userId, :cardId, 1, :now, :now)
				ON CONFLICT (user_id, card_id) DO UPDATE
				SET quantity = tcg_user_cards.quantity + 1, last_obtained_at = EXCLUDED.last_obtained_at
				RETURNING quantity
				""")
			.param("userId", userId)
			.param("cardId", cardId)
			.param("now", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
			.query(Integer.class)
			.single();
	}

	/**
	 * Every set with how much of it the player owns, including sets they own nothing of.
	 * @param gameSlug only the sets of this game, or {@code null} for all
	 */
	List<SetRow> findProgress(Long userId, String gameSlug) {
		StatementSpec query = this.jdbc.sql("""
				SELECT s.id, s.code, s.name, s.image_url, s.cover_image_url, g.slug AS game_slug, g.name AS game_name,
				       count(c.id) AS total_cards,
				       count(uc.card_id) AS owned_cards,
				       coalesce(sum(uc.quantity), 0) AS copies
				FROM tcg_sets s
				JOIN tcg_games g ON g.id = s.game_id
				JOIN tcg_cards c ON c.set_id = s.id
				LEFT JOIN tcg_user_cards uc ON uc.card_id = c.id AND uc.user_id = :userId
				WHERE g.active %s
				GROUP BY s.id, g.id
				ORDER BY g.display_order, g.name, s.display_order, s.name
				""".formatted((gameSlug != null) ? "AND g.slug = :gameSlug" : "")).param("userId", userId);
		if (gameSlug != null) {
			query = query.param("gameSlug", gameSlug);
		}
		return query
			.query((row, index) -> new SetRow(row.getLong("id"), row.getString("code"), row.getString("name"),
					row.getString("image_url"), row.getString("cover_image_url"),
					new GameRef(row.getString("game_slug"), row.getString("game_name")),
					row.getInt("total_cards"), row.getInt("owned_cards"), row.getLong("copies")))
			.list();
	}

	/** One page of the cards a player owns, ordered by game, set and the set's own order. */
	List<OwnedRow> findOwned(Long userId, String gameSlug, Long setId, int page, int size) {
		return filtered("""
				SELECT uc.card_id, uc.quantity, uc.first_obtained_at, uc.last_obtained_at
				""", """
				ORDER BY g.display_order, g.name, s.display_order, s.name, c.display_order, c.id
				LIMIT :size OFFSET :offset
				""", userId, gameSlug, setId).param("size", size)
			.param("offset", (long) page * size)
			.query((row, index) -> new OwnedRow(row.getLong("card_id"), row.getInt("quantity"),
					row.getObject("first_obtained_at", OffsetDateTime.class).toInstant(),
					row.getObject("last_obtained_at", OffsetDateTime.class).toInstant()))
			.list();
	}

	long countOwned(Long userId, String gameSlug, Long setId) {
		return filtered("SELECT count(*)\n", "", userId, gameSlug, setId).query(Long.class).single();
	}

	/** The owned cards of active games, narrowed to a game and a set when those are given. */
	private StatementSpec filtered(String select, String tail, Long userId, String gameSlug, Long setId) {
		StringBuilder sql = new StringBuilder(select).append("""
				FROM tcg_user_cards uc
				JOIN tcg_cards c ON c.id = uc.card_id
				JOIN tcg_sets s ON s.id = c.set_id
				JOIN tcg_games g ON g.id = c.game_id
				WHERE uc.user_id = :userId AND g.active
				""");
		if (gameSlug != null) {
			sql.append(" AND g.slug = :gameSlug ");
		}
		if (setId != null) {
			sql.append(" AND s.id = :setId ");
		}
		StatementSpec query = this.jdbc.sql(sql.append(tail).toString()).param("userId", userId);
		if (gameSlug != null) {
			query = query.param("gameSlug", gameSlug);
		}
		if (setId != null) {
			query = query.param("setId", setId);
		}
		return query;
	}

}
