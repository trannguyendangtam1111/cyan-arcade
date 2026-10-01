package com.cyan.arcade.tcg.dataimport;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes a {@link TcgDataset} into the database. The only writer of the TCG catalog tables.
 *
 * <p>Importing is an upsert on natural keys: a game by its slug, a set by its code, a card by its
 * number, a pack by its code. Running the same import twice changes nothing; running a corrected
 * dataset updates names, images, rarities and odds in place. Nothing is ever deleted, because
 * players' collections and opening histories point at cards and packs: a card that disappears from
 * a dataset stays in the catalog, and only leaves the pools of the packs that no longer list it.
 *
 * <p>The whole dataset is imported in one transaction, after being validated as a whole, so a
 * broken dataset leaves the catalog exactly as it was.
 */
@Service
public class TcgDatasetImporter {

	private final JdbcClient jdbc;

	private final TcgDatasetValidator validator;

	private final JsonMapper json;

	TcgDatasetImporter(JdbcClient jdbc, TcgDatasetValidator validator, JsonMapper json) {
		this.jdbc = jdbc;
		this.validator = validator;
		this.json = json;
	}

	/**
	 * @param source where the dataset came from, for error messages
	 * @throws InvalidDatasetException when the dataset is incomplete or inconsistent
	 */
	@Transactional
	public ImportReport importDataset(TcgDataset dataset, String source) {
		List<String> problems = this.validator.problemsOf(dataset);
		if (!problems.isEmpty()) {
			throw new InvalidDatasetException(source, problems);
		}

		Long gameId = upsertGame(dataset.game());
		Map<String, Long> rarityIds = new HashMap<>();
		for (int order = 0; order < dataset.rarities().size(); order++) {
			TcgDataset.Rarity rarity = dataset.rarities().get(order);
			rarityIds.put(rarity.code(), upsertRarity(gameId, rarity, order));
		}

		int cards = 0;
		int packs = 0;
		for (int order = 0; order < dataset.sets().size(); order++) {
			CardSet set = dataset.sets().get(order);
			Long setId = upsertSet(gameId, set, order);

			Map<String, Long> cardIds = new HashMap<>();
			for (Card card : set.cards()) {
				cardIds.put(card.number(), upsertCard(gameId, setId, rarityIds.get(card.rarity()), card));
			}
			cards += set.cards().size();

			for (int packOrder = 0; packOrder < set.packs().size(); packOrder++) {
				Pack pack = set.packs().get(packOrder);
				Long packId = upsertPack(setId, pack, packOrder);
				replacePool(packId, TcgDatasetValidator.poolOf(set, pack).stream().map(cardIds::get).toList());
				replaceOdds(packId, pack.slots(), rarityIds);
			}
			packs += set.packs().size();
		}
		return new ImportReport(dataset.game().slug(), dataset.rarities().size(), dataset.sets().size(), cards, packs);
	}

	private Long upsertGame(TcgDataset.Game game) {
		return this.jdbc.sql("""
				INSERT INTO tcg_games (slug, name, description, image_url, card_back_url)
				VALUES (:slug, :name, :description, :imageUrl, :cardBackUrl)
				ON CONFLICT (slug) DO UPDATE
				SET name = EXCLUDED.name, description = EXCLUDED.description, image_url = EXCLUDED.image_url,
				    card_back_url = EXCLUDED.card_back_url
				RETURNING id
				""")
			.param("slug", game.slug())
			.param("name", game.name())
			.param("description", orEmpty(game.description()))
			.param("imageUrl", game.imageUrl())
			.param("cardBackUrl", game.cardBackUrl(), java.sql.Types.VARCHAR)
			.query(Long.class)
			.single();
	}

	private Long upsertRarity(Long gameId, TcgDataset.Rarity rarity, int order) {
		return this.jdbc.sql("""
				INSERT INTO tcg_rarities (game_id, code, name, tier, display_order)
				VALUES (:gameId, :code, :name, :tier, :order)
				ON CONFLICT (game_id, code) DO UPDATE
				SET name = EXCLUDED.name, tier = EXCLUDED.tier, display_order = EXCLUDED.display_order
				RETURNING id
				""")
			.param("gameId", gameId)
			.param("code", rarity.code())
			.param("name", rarity.name())
			.param("tier", rarity.tier())
			.param("order", order)
			.query(Long.class)
			.single();
	}

	private Long upsertSet(Long gameId, CardSet set, int order) {
		return this.jdbc.sql("""
				INSERT INTO tcg_sets (game_id, code, name, description, image_url, released_on, display_order)
				VALUES (:gameId, :code, :name, :description, :imageUrl, :releasedOn, :order)
				ON CONFLICT (game_id, code) DO UPDATE
				SET name = EXCLUDED.name, description = EXCLUDED.description, image_url = EXCLUDED.image_url,
				    released_on = EXCLUDED.released_on, display_order = EXCLUDED.display_order
				RETURNING id
				""")
			.param("gameId", gameId)
			.param("code", set.code())
			.param("name", set.name())
			.param("description", orEmpty(set.description()))
			.param("imageUrl", set.imageUrl())
			.param("releasedOn", set.releasedOn(), java.sql.Types.DATE)
			.param("order", order)
			.query(Long.class)
			.single();
	}

	private Long upsertCard(Long gameId, Long setId, Long rarityId, Card card) {
		return this.jdbc.sql("""
				INSERT INTO tcg_cards (game_id, set_id, rarity_id, card_number, name, image_url, metadata)
				VALUES (:gameId, :setId, :rarityId, :number, :name, :imageUrl, CAST(:metadata AS jsonb))
				ON CONFLICT (set_id, card_number) DO UPDATE
				SET rarity_id = EXCLUDED.rarity_id, name = EXCLUDED.name, image_url = EXCLUDED.image_url,
				    metadata = EXCLUDED.metadata
				RETURNING id
				""")
			.param("gameId", gameId)
			.param("setId", setId)
			.param("rarityId", rarityId)
			.param("number", card.number())
			.param("name", card.name())
			.param("imageUrl", card.imageUrl())
			.param("metadata", this.json.writeValueAsString(card.metadata()))
			.query(Long.class)
			.single();
	}

	private Long upsertPack(Long setId, Pack pack, int order) {
		return this.jdbc.sql("""
				INSERT INTO tcg_packs (set_id, code, name, description, image_url, display_order)
				VALUES (:setId, :code, :name, :description, :imageUrl, :order)
				ON CONFLICT (set_id, code) DO UPDATE
				SET name = EXCLUDED.name, description = EXCLUDED.description, image_url = EXCLUDED.image_url,
				    display_order = EXCLUDED.display_order
				RETURNING id
				""")
			.param("setId", setId)
			.param("code", pack.code())
			.param("name", pack.name())
			.param("description", orEmpty(pack.description()))
			.param("imageUrl", pack.imageUrl())
			.param("order", order)
			.query(Long.class)
			.single();
	}

	/** A pack's pool is exactly what the dataset says, so it is rewritten rather than merged. */
	private void replacePool(Long packId, List<Long> cardIds) {
		this.jdbc.sql("DELETE FROM tcg_pack_cards WHERE pack_id = :packId").param("packId", packId).update();
		for (Long cardId : cardIds) {
			this.jdbc.sql("INSERT INTO tcg_pack_cards (pack_id, card_id) VALUES (:packId, :cardId)")
				.param("packId", packId)
				.param("cardId", cardId)
				.update();
		}
	}

	/** Turns "three cards with these odds" into three numbered slots, one card each. */
	private void replaceOdds(Long packId, List<Slot> slots, Map<String, Long> rarityIds) {
		this.jdbc.sql("DELETE FROM tcg_pack_slot_odds WHERE pack_id = :packId").param("packId", packId).update();
		int number = 0;
		for (Slot slot : slots) {
			for (int repeat = 0; repeat < slot.count(); repeat++) {
				number++;
				for (Map.Entry<String, Integer> odds : slot.odds().entrySet()) {
					this.jdbc.sql("""
							INSERT INTO tcg_pack_slot_odds (pack_id, slot, rarity_id, weight)
							VALUES (:packId, :slot, :rarityId, :weight)
							""")
						.param("packId", packId)
						.param("slot", number)
						.param("rarityId", rarityIds.get(odds.getKey()))
						.param("weight", odds.getValue())
						.update();
				}
			}
		}
	}

	private static String orEmpty(String text) {
		return (text != null) ? text : "";
	}

}
