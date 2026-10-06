package com.cyan.arcade.tcg.card;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.game.Rarity;
import com.cyan.arcade.tcg.set.SetRef;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads cards together with the set, game and rarity each belongs to. */
@Repository
class TcgCardStore {

	private static final String SELECT_CARDS = """
			SELECT c.id, c.external_id, c.card_number, c.name, c.image_url, c.thumbnail_url, c.metadata::text AS metadata,
			       r.code AS rarity_code, r.name AS rarity_name, r.tier AS rarity_tier,
			       s.id AS set_id, s.code AS set_code, s.name AS set_name,
			       g.slug AS game_slug, g.name AS game_name
			FROM tcg_cards c
			JOIN tcg_rarities r ON r.id = c.rarity_id
			JOIN tcg_sets s ON s.id = c.set_id
			JOIN tcg_games g ON g.id = c.game_id
			""";

	private static final TypeReference<Map<String, Object>> METADATA = new TypeReference<>() {
	};

	private final JdbcClient jdbc;

	private final JsonMapper json;

	TcgCardStore(JdbcClient jdbc, JsonMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	/** A set's cards in the order the set lists them. */
	List<CardResponse> findBySet(Long setId) {
		return this.jdbc.sql(SELECT_CARDS + " WHERE c.set_id = :setId ORDER BY c.display_order, c.id")
			.param("setId", setId)
			.query(this::toCard)
			.list();
	}

	List<CardResponse> findByIds(Collection<Long> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		return this.jdbc.sql(SELECT_CARDS + " WHERE c.id IN (:ids)").param("ids", ids).query(this::toCard).list();
	}

	private CardResponse toCard(ResultSet row, int index) throws SQLException {
		return new CardResponse(row.getLong("id"), row.getString("external_id"), row.getString("card_number"),
				row.getString("name"), row.getString("image_url"), row.getString("thumbnail_url"),
				new Rarity(row.getString("rarity_code"), row.getString("rarity_name"), row.getInt("rarity_tier")),
				new SetRef(row.getLong("set_id"), row.getString("set_code"), row.getString("set_name")),
				new GameRef(row.getString("game_slug"), row.getString("game_name")),
				this.json.readValue(row.getString("metadata"), METADATA));
	}

}
