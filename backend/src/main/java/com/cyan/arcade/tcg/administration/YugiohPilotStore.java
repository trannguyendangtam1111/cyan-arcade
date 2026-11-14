package com.cyan.arcade.tcg.administration;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Only the pilot's visibility is writable here; imports still own catalog content. */
@Repository
class YugiohPilotStore {

	private final JdbcClient jdbc;

	YugiohPilotStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	record Game(long id, boolean active, String image, String back, String attribution) { }
	record CardSet(long id, String code, String image, String cover) { }
	record Pack(long id, long setId, String code, boolean active, String image, String note) { }
	record Rarity(long id, String code, int tier) { }
	record Card(long id, long setId, String externalId, String number, String name, long rarityId,
			String image, String thumbnail, String passcode, String type, String effect) { }
	record Odds(int slot, long rarityId, int weight) { }

	Optional<Game> game() {
		return this.jdbc.sql("SELECT id, active, image_url, card_back_url, attribution FROM tcg_games WHERE slug='yugioh'")
			.query((r, i) -> new Game(r.getLong("id"), r.getBoolean("active"), r.getString("image_url"),
					r.getString("card_back_url"), r.getString("attribution"))).optional();
	}

	List<CardSet> sets(long gameId) {
		return this.jdbc.sql("SELECT id, code, image_url, cover_image_url FROM tcg_sets WHERE game_id=:id")
			.param("id", gameId).query((r, i) -> new CardSet(r.getLong("id"), r.getString("code"),
					r.getString("image_url"), r.getString("cover_image_url"))).list();
	}

	List<Pack> packs(long gameId) {
		return this.jdbc.sql("""
			SELECT p.id, p.set_id, p.code, p.active, p.image_url, p.odds_note FROM tcg_packs p
			JOIN tcg_sets s ON s.id=p.set_id WHERE s.game_id=:id
			""").param("id", gameId).query((r, i) -> new Pack(r.getLong("id"), r.getLong("set_id"),
					r.getString("code"), r.getBoolean("active"), r.getString("image_url"), r.getString("odds_note"))).list();
	}

	List<Rarity> rarities(long gameId) {
		return this.jdbc.sql("SELECT id, code, tier FROM tcg_rarities WHERE game_id=:id").param("id", gameId)
			.query((r, i) -> new Rarity(r.getLong("id"), r.getString("code"), r.getInt("tier"))).list();
	}

	List<Card> cards(long gameId) {
		return this.jdbc.sql("""
			SELECT id, set_id, external_id, card_number, name, rarity_id, image_url, thumbnail_url,
			metadata->>'passcode' AS passcode, metadata->>'cardType' AS type, metadata->>'effect' AS effect
			FROM tcg_cards WHERE game_id=:id
			""").param("id", gameId).query((r, i) -> new Card(r.getLong("id"), r.getLong("set_id"),
					r.getString("external_id"), r.getString("card_number"), r.getString("name"), r.getLong("rarity_id"),
					r.getString("image_url"), r.getString("thumbnail_url"), r.getString("passcode"),
					r.getString("type"), r.getString("effect"))).list();
	}

	List<Long> pool(long packId) {
		return this.jdbc.sql("SELECT card_id FROM tcg_pack_cards WHERE pack_id=:id").param("id", packId)
			.query(Long.class).list();
	}

	List<Odds> odds(long packId) {
		return this.jdbc.sql("SELECT slot, rarity_id, weight FROM tcg_pack_slot_odds WHERE pack_id=:id")
			.param("id", packId).query((r, i) -> new Odds(r.getInt("slot"), r.getLong("rarity_id"), r.getInt("weight"))).list();
	}

	void setVisible(long gameId, boolean active) {
		this.jdbc.sql("UPDATE tcg_packs SET active=:active WHERE set_id IN (SELECT id FROM tcg_sets WHERE game_id=:id)")
			.param("id", gameId).param("active", active).update();
		this.jdbc.sql("UPDATE tcg_games SET active=:active WHERE id=:id").param("id", gameId).param("active", active).update();
	}
}
