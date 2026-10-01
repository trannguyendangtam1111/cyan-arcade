package com.cyan.arcade.tcg.pack;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.game.Rarity;
import com.cyan.arcade.tcg.set.SetRef;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads packs, their rarity rules and their card pools. */
@Repository
class TcgPackStore {

	private static final String SELECT_PACKS = """
			SELECT p.id, p.code, p.name, p.description, p.image_url, p.active,
			       s.id AS set_id, s.code AS set_code, s.name AS set_name,
			       g.slug AS game_slug, g.name AS game_name, g.active AS game_active,
			       (SELECT count(*) FROM tcg_pack_cards pc WHERE pc.pack_id = p.id) AS pool_size
			FROM tcg_packs p
			JOIN tcg_sets s ON s.id = p.set_id
			JOIN tcg_games g ON g.id = s.game_id
			""";

	private final JdbcClient jdbc;

	TcgPackStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** @param available whether the pack and its game are both active */
	record PackRow(Long id, String code, String name, String description, String imageUrl, boolean available,
			SetRef set, GameRef game, int poolSize) {

		PackRef toRef() {
			return new PackRef(this.id, this.code, this.name, this.imageUrl, this.set, this.game);
		}

	}

	/** One rarity a slot of a pack can turn out to be. */
	record OddsRow(Long packId, int slot, Long rarityId, Rarity rarity, int weight) {
	}

	/** The packs of a set that can be opened. */
	List<PackRow> findAvailableBySet(Long setId) {
		return this.jdbc
			.sql(SELECT_PACKS + " WHERE p.set_id = :setId AND p.active AND g.active ORDER BY p.display_order, p.name")
			.param("setId", setId)
			.query(TcgPackStore::toPack)
			.list();
	}

	/** A pack whether or not it can still be opened: old openings keep pointing at it. */
	Optional<PackRow> findById(Long id) {
		return this.jdbc.sql(SELECT_PACKS + " WHERE p.id = :id").param("id", id).query(TcgPackStore::toPack).optional();
	}

	List<PackRow> findByIds(Collection<Long> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		return this.jdbc.sql(SELECT_PACKS + " WHERE p.id IN (:ids)").param("ids", ids).query(TcgPackStore::toPack).list();
	}

	/** The rarity rules of several packs, in slot order and, within a slot, most common rarity first. */
	List<OddsRow> findOdds(Collection<Long> packIds) {
		if (packIds.isEmpty()) {
			return List.of();
		}
		return this.jdbc.sql("""
				SELECT o.pack_id, o.slot, o.weight, r.id AS rarity_id, r.code, r.name, r.tier
				FROM tcg_pack_slot_odds o
				JOIN tcg_rarities r ON r.id = o.rarity_id
				WHERE o.pack_id IN (:packIds)
				ORDER BY o.pack_id, o.slot, r.tier, r.id
				""")
			.param("packIds", packIds)
			.query((row, index) -> new OddsRow(row.getLong("pack_id"), row.getInt("slot"), row.getLong("rarity_id"),
					new Rarity(row.getString("code"), row.getString("name"), row.getInt("tier")),
					row.getInt("weight")))
			.list();
	}

	/** A pack's card pool: card ids grouped by rarity id. */
	Map<Long, List<Long>> findPool(Long packId) {
		return this.jdbc.sql("""
				SELECT c.rarity_id, c.id AS card_id
				FROM tcg_pack_cards pc
				JOIN tcg_cards c ON c.id = pc.card_id
				WHERE pc.pack_id = :packId
				ORDER BY c.id
				""")
			.param("packId", packId)
			.query((row, index) -> Map.entry(row.getLong("rarity_id"), row.getLong("card_id")))
			.list()
			.stream()
			.collect(Collectors.groupingBy(Map.Entry::getKey,
					Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
	}

	private static PackRow toPack(ResultSet row, int index) throws SQLException {
		return new PackRow(row.getLong("id"), row.getString("code"), row.getString("name"),
				row.getString("description"), row.getString("image_url"),
				row.getBoolean("active") && row.getBoolean("game_active"),
				new SetRef(row.getLong("set_id"), row.getString("set_code"), row.getString("set_name")),
				new GameRef(row.getString("game_slug"), row.getString("game_name")), row.getInt("pool_size"));
	}

}
