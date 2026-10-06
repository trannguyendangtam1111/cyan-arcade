package com.cyan.arcade.tcg.game;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads trading card games and their rarities. Rows are written by dataset imports only. */
@Repository
class TcgGameStore {

	private final JdbcClient jdbc;

	TcgGameStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** A game without its rarities, which are read separately for all games at once. */
	record GameRow(Long id, String slug, String name, String description, String imageUrl, String cardBackUrl,
			String accentColor, String attribution, int setCount, int cardCount) {
	}

	List<GameRow> findActive() {
		return this.jdbc.sql("""
				SELECT g.id, g.slug, g.name, g.description, g.image_url, g.card_back_url, g.accent_color, g.attribution,
				       (SELECT count(*) FROM tcg_sets s WHERE s.game_id = g.id) AS set_count,
				       (SELECT count(*) FROM tcg_cards c WHERE c.game_id = g.id) AS card_count
				FROM tcg_games g
				WHERE g.active
				ORDER BY g.display_order, g.name
				""")
			.query((row, index) -> new GameRow(row.getLong("id"), row.getString("slug"), row.getString("name"),
					row.getString("description"), row.getString("image_url"), row.getString("card_back_url"),
					row.getString("accent_color"), row.getString("attribution"), row.getInt("set_count"),
					row.getInt("card_count")))
			.list();
	}

	/** Each game's rarities, most common first. */
	Map<Long, List<Rarity>> raritiesOf(Collection<Long> gameIds) {
		if (gameIds.isEmpty()) {
			return Map.of();
		}
		return this.jdbc.sql("""
				SELECT game_id, code, name, tier
				FROM tcg_rarities
				WHERE game_id IN (:gameIds)
				ORDER BY display_order, tier, id
				""")
			.param("gameIds", gameIds)
			.query((row, index) -> Map.entry(row.getLong("game_id"),
					new Rarity(row.getString("code"), row.getString("name"), row.getInt("tier"))))
			.list()
			.stream()
			.collect(Collectors.groupingBy(Map.Entry::getKey,
					Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
	}

}
