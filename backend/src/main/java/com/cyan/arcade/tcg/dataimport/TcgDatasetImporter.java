package com.cyan.arcade.tcg.dataimport;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

/**
 * Writes a {@link TcgDataset} into the database. The only writer of the TCG catalog tables.
 *
 * <p>Importing is an upsert on stable keys: a game by its slug, a set by its code, a card by its
 * external id (the source's own id), a pack by its code. Running the same import twice changes
 * nothing and creates no duplicates; running a newer dataset adds the new cards and updates names,
 * images, rarities and odds in place. Nothing is ever deleted, because
 * players' collections and opening histories point at cards and packs: a card that disappears from
 * a dataset stays in the catalog, and only leaves the pools of the packs that no longer list it. A
 * set the dataset does not have (one its source held back) is not touched at all, and no pack is
 * ever switched on or off here: whether a pack can be opened is the catalog's own decision.
 *
 * <p>Rows already exactly as the dataset says are left alone, so the report tells what really
 * changed. The whole dataset is imported in one transaction, after being validated as a whole, so
 * a broken dataset leaves the catalog exactly as it was; a dry run rolls that transaction back.
 */
@Service
public class TcgDatasetImporter {

	private static final Logger log = LoggerFactory.getLogger(TcgDatasetImporter.class);

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
		return importDataset(dataset, source, false);
	}

	/**
	 * @param source where the dataset came from, for error messages
	 * @param dryRun whether to roll everything back once the report is made: the report says what the
	 * import would do, and the catalog stays as it was (database sequences aside, which never roll back)
	 * @throws InvalidDatasetException when the dataset is incomplete or inconsistent
	 */
	@Transactional
	public ImportReport importDataset(TcgDataset dataset, String source, boolean dryRun) {
		List<String> problems = this.validator.problemsOf(dataset);
		if (!problems.isEmpty()) {
			throw new InvalidDatasetException(source, problems);
		}
		Map<String, String> setOfCard = setsOfCards(dataset.game().slug());
		List<String> setsBefore = setCodes(dataset.game().slug());

		Long gameId = upsertGame(dataset.game());
		Map<String, Long> rarityIds = new HashMap<>();
		for (int order = 0; order < dataset.rarities().size(); order++) {
			TcgDataset.Rarity rarity = dataset.rarities().get(order);
			rarityIds.put(rarity.code(), upsertRarity(gameId, rarity, order));
		}

		int cards = 0;
		int newCards = 0;
		int updatedCards = 0;
		int unchangedCards = 0;
		int packs = 0;
		int newSets = 0;
		int updatedSets = 0;
		int newPacks = 0;
		int updatedPacks = 0;
		int movedCards = 0;
		List<String> movedExamples = new ArrayList<>();
		Map<String, Integer> newCardsBySet = new HashMap<>();
		for (int order = 0; order < dataset.sets().size(); order++) {
			CardSet set = dataset.sets().get(order);
			Upserted upsertedSet = upsertSet(gameId, set, order);
			Long setId = upsertedSet.id();
			switch (upsertedSet.change()) {
				case INSERTED -> newSets++;
				case UPDATED -> updatedSets++;
				case UNCHANGED -> {
				}
			}

			Map<String, Long> cardIds = new HashMap<>();
			for (int cardOrder = 0; cardOrder < set.cards().size(); cardOrder++) {
				Card card = set.cards().get(cardOrder);
				String externalId = set.externalIdOf(card);
				Upserted upserted = upsertCard(gameId, setId, rarityIds.get(card.rarity()), externalId, card, cardOrder);
				cardIds.put(card.key(), upserted.id());
				switch (upserted.change()) {
					case INSERTED -> {
						newCards++;
						newCardsBySet.merge(set.code(), 1, Integer::sum);
					}
					case UPDATED -> updatedCards++;
					case UNCHANGED -> unchangedCards++;
				}
				String before = setOfCard.get(externalId);
				if (before != null && !before.equals(set.code())) {
					movedCards++;
					if (movedExamples.size() < ImportReport.MOVED_EXAMPLES) {
						movedExamples.add("%s: %s -> %s".formatted(externalId, before, set.code()));
					}
				}
			}
			cards += set.cards().size();

			for (int packOrder = 0; packOrder < set.packs().size(); packOrder++) {
				Pack pack = set.packs().get(packOrder);
				Upserted upsertedPack = upsertPack(setId, pack, packOrder);
				boolean poolChanged = replacePool(upsertedPack.id(),
						TcgDatasetValidator.poolOf(set, pack).stream().map(cardIds::get).toList());
				boolean oddsChanged = replaceOdds(upsertedPack.id(), pack.slots(), rarityIds);
				if (upsertedPack.change() == Change.INSERTED) {
					newPacks++;
				}
				else if (upsertedPack.change() == Change.UPDATED || poolChanged || oddsChanged) {
					updatedPacks++;
				}
			}
			packs += set.packs().size();
		}
		if (movedCards > 0) {
			log.warn("Card game '{}': {} cards already in the catalog move to another set, e.g. {}",
					dataset.game().slug(), movedCards, movedExamples);
		}
		List<String> imported = dataset.sets().stream().map(CardSet::code).toList();
		List<String> notInDataset = setsBefore.stream().filter((code) -> !imported.contains(code)).toList();
		if (dryRun) {
			TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
		}
		return new ImportReport(dataset.game().slug(), dryRun, dataset.rarities().size(), dataset.sets().size(), cards,
				packs, newCards, updatedCards, unchangedCards, newSets, updatedSets, newPacks, updatedPacks, movedCards,
				movedExamples, newCardsBySet, notInDataset);
	}

	/** Where each card of the game is now, by external id: to tell when a dataset moves one. */
	private Map<String, String> setsOfCards(String gameSlug) {
		Map<String, String> sets = new HashMap<>();
		this.jdbc.sql("""
				SELECT c.external_id, s.code FROM tcg_cards c
				JOIN tcg_sets s ON s.id = c.set_id JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = :slug
				""")
			.param("slug", gameSlug)
			.query((row, index) -> Map.entry(row.getString("external_id"), row.getString("code")))
			.list()
			.forEach((entry) -> sets.put(entry.getKey(), entry.getValue()));
		return sets;
	}

	private List<String> setCodes(String gameSlug) {
		return this.jdbc.sql("""
				SELECT s.code FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = :slug ORDER BY s.display_order, s.code
				""")
			.param("slug", gameSlug)
			.query(String.class)
			.list();
	}

	/**
	 * A game's picture comes from a card of one of its sets; when that set is held back, the dataset
	 * has none, and the picture the catalog has is kept. Whether the game is shown is only decided
	 * when it is created (a hidden one starts inactive), never changed by a later import.
	 */
	private Long upsertGame(TcgDataset.Game game) {
		return this.jdbc.sql("""
				INSERT INTO tcg_games (slug, name, description, image_url, card_back_url, accent_color, attribution, active)
				VALUES (:slug, :name, :description, :imageUrl, :cardBackUrl, :accentColor, :attribution, NOT :hidden)
				ON CONFLICT (slug) DO UPDATE
				SET name = EXCLUDED.name, description = EXCLUDED.description,
				    image_url = COALESCE(EXCLUDED.image_url, tcg_games.image_url),
				    card_back_url = EXCLUDED.card_back_url, accent_color = EXCLUDED.accent_color,
				    attribution = EXCLUDED.attribution
				RETURNING id
				""")
			.param("slug", game.slug())
			.param("name", game.name())
			.param("description", orEmpty(game.description()))
			.param("imageUrl", game.imageUrl(), Types.VARCHAR)
			.param("cardBackUrl", game.cardBackUrl(), Types.VARCHAR)
			.param("accentColor", game.accentColor(), Types.VARCHAR)
			.param("attribution", orEmpty(game.attribution()))
			.param("hidden", game.hidden())
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

	private Upserted upsertSet(Long gameId, CardSet set, int order) {
		return this.jdbc.sql("""
				INSERT INTO tcg_sets (game_id, code, external_id, name, description, series, image_url, cover_image_url,
				                      released_on, display_order)
				VALUES (:gameId, :code, :externalId, :name, :description, :series, :imageUrl, :coverImageUrl,
				        :releasedOn, :order)
				ON CONFLICT (game_id, code) DO UPDATE
				SET external_id = EXCLUDED.external_id, name = EXCLUDED.name, description = EXCLUDED.description,
				    series = EXCLUDED.series, image_url = EXCLUDED.image_url, cover_image_url = EXCLUDED.cover_image_url,
				    released_on = EXCLUDED.released_on, display_order = EXCLUDED.display_order
				WHERE (tcg_sets.external_id, tcg_sets.name, tcg_sets.description, tcg_sets.series, tcg_sets.image_url,
				       tcg_sets.cover_image_url, tcg_sets.released_on, tcg_sets.display_order)
				      IS DISTINCT FROM (EXCLUDED.external_id, EXCLUDED.name, EXCLUDED.description, EXCLUDED.series,
				       EXCLUDED.image_url, EXCLUDED.cover_image_url, EXCLUDED.released_on, EXCLUDED.display_order)
				RETURNING id, (xmax = 0) AS inserted
				""")
			.param("gameId", gameId)
			.param("code", set.code())
			.param("externalId", set.externalId(), Types.VARCHAR)
			.param("name", set.name())
			.param("description", orEmpty(set.description()))
			.param("series", set.series(), Types.VARCHAR)
			.param("imageUrl", set.imageUrl(), Types.VARCHAR)
			.param("coverImageUrl", set.coverImageUrl(), Types.VARCHAR)
			.param("releasedOn", set.releasedOn(), Types.DATE)
			.param("order", order)
			.query(Upserted::of)
			.optional()
			.orElseGet(() -> new Upserted(this.jdbc.sql("SELECT id FROM tcg_sets WHERE game_id = :gameId AND code = :code")
				.param("gameId", gameId)
				.param("code", set.code())
				.query(Long.class)
				.single(), Change.UNCHANGED));
	}

	/** What an import did to a row. */
	private enum Change {

		INSERTED, UPDATED, UNCHANGED

	}

	private record Upserted(Long id, Change change) {

		/** A row an upsert returned: inserted (xmax is 0) or updated; one it left alone returns none. */
		static Upserted of(ResultSet row, int index) throws SQLException {
			return new Upserted(row.getLong("id"), row.getBoolean("inserted") ? Change.INSERTED : Change.UPDATED);
		}

	}

	/**
	 * A card is found by its external id anywhere in its game, so a card a source moves to another
	 * set, or renumbers, is updated rather than duplicated.
	 */
	private Upserted upsertCard(Long gameId, Long setId, Long rarityId, String externalId, Card card, int order) {
		return this.jdbc.sql("""
				INSERT INTO tcg_cards (game_id, set_id, rarity_id, external_id, card_number, name, image_url,
				                       thumbnail_url, metadata, display_order)
				VALUES (:gameId, :setId, :rarityId, :externalId, :number, :name, :imageUrl, :thumbnailUrl,
				        CAST(:metadata AS jsonb), :order)
				ON CONFLICT (game_id, external_id) DO UPDATE
				SET set_id = EXCLUDED.set_id, rarity_id = EXCLUDED.rarity_id, card_number = EXCLUDED.card_number,
				    name = EXCLUDED.name, image_url = EXCLUDED.image_url, thumbnail_url = EXCLUDED.thumbnail_url,
				    metadata = EXCLUDED.metadata, display_order = EXCLUDED.display_order
				WHERE (tcg_cards.set_id, tcg_cards.rarity_id, tcg_cards.card_number, tcg_cards.name, tcg_cards.image_url,
				       tcg_cards.thumbnail_url, tcg_cards.metadata, tcg_cards.display_order)
				      IS DISTINCT FROM (EXCLUDED.set_id, EXCLUDED.rarity_id, EXCLUDED.card_number, EXCLUDED.name,
				       EXCLUDED.image_url, EXCLUDED.thumbnail_url, EXCLUDED.metadata, EXCLUDED.display_order)
				RETURNING id, (xmax = 0) AS inserted
				""")
			.param("gameId", gameId)
			.param("setId", setId)
			.param("rarityId", rarityId)
			.param("externalId", externalId)
			.param("number", card.number())
			.param("name", card.name())
			.param("imageUrl", card.imageUrl(), Types.VARCHAR)
			.param("thumbnailUrl", card.thumbnailUrl(), Types.VARCHAR)
			.param("metadata", this.json.writeValueAsString(card.metadata()))
			.param("order", order)
			// xmax is 0 on a row this statement inserted, and set on one it updated. A card that is already
			// exactly as the dataset says is left alone and returns no row.
			.query(Upserted::of)
			.optional()
			.orElseGet(() -> new Upserted(this.jdbc
				.sql("SELECT id FROM tcg_cards WHERE game_id = :gameId AND external_id = :externalId")
				.param("gameId", gameId)
				.param("externalId", externalId)
				.query(Long.class)
				.single(), Change.UNCHANGED));
	}

	private Upserted upsertPack(Long setId, Pack pack, int order) {
		return this.jdbc.sql("""
				INSERT INTO tcg_packs (set_id, code, name, description, image_url, odds_note, display_order)
				VALUES (:setId, :code, :name, :description, :imageUrl, :oddsNote, :order)
				ON CONFLICT (set_id, code) DO UPDATE
				SET name = EXCLUDED.name, description = EXCLUDED.description, image_url = EXCLUDED.image_url,
				    odds_note = EXCLUDED.odds_note, display_order = EXCLUDED.display_order
				WHERE (tcg_packs.name, tcg_packs.description, tcg_packs.image_url, tcg_packs.odds_note,
				       tcg_packs.display_order)
				      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.image_url, EXCLUDED.odds_note,
				       EXCLUDED.display_order)
				RETURNING id, (xmax = 0) AS inserted
				""")
			.param("setId", setId)
			.param("code", pack.code())
			.param("name", pack.name())
			.param("description", orEmpty(pack.description()))
			.param("imageUrl", pack.imageUrl(), Types.VARCHAR)
			.param("oddsNote", pack.oddsNote(), Types.VARCHAR)
			.param("order", order)
			.query(Upserted::of)
			.optional()
			.orElseGet(() -> new Upserted(this.jdbc.sql("SELECT id FROM tcg_packs WHERE set_id = :setId AND code = :code")
				.param("setId", setId)
				.param("code", pack.code())
				.query(Long.class)
				.single(), Change.UNCHANGED));
	}

	/**
	 * A pack's pool is exactly what the dataset says, so it is rewritten rather than merged, when it
	 * differs. In one statement: a real booster's pool is a few hundred cards.
	 * @return whether the pool changed
	 */
	private boolean replacePool(Long packId, List<Long> cardIds) {
		Set<Long> current = new HashSet<>(this.jdbc.sql("SELECT card_id FROM tcg_pack_cards WHERE pack_id = :packId")
			.param("packId", packId)
			.query(Long.class)
			.list());
		if (current.equals(new HashSet<>(cardIds))) {
			return false;
		}
		this.jdbc.sql("DELETE FROM tcg_pack_cards WHERE pack_id = :packId").param("packId", packId).update();
		this.jdbc.sql("""
				INSERT INTO tcg_pack_cards (pack_id, card_id)
				SELECT :packId, card_id FROM unnest(CAST(:cardIds AS bigint[])) AS card_id
				""")
			.param("packId", packId)
			.param("cardIds", cardIds.stream().map(String::valueOf).collect(Collectors.joining(",", "{", "}")))
			.update();
		return true;
	}

	/**
	 * Turns "three cards with these odds" into three numbered slots, one card each. Rewritten when
	 * it differs from what the pack has.
	 * @return whether the odds changed
	 */
	private boolean replaceOdds(Long packId, List<Slot> slots, Map<String, Long> rarityIds) {
		Set<List<Long>> wanted = new HashSet<>();
		int slotNumber = 0;
		for (Slot slot : slots) {
			for (int repeat = 0; repeat < slot.count(); repeat++) {
				slotNumber++;
				for (Map.Entry<String, Integer> odds : slot.odds().entrySet()) {
					wanted.add(List.of((long) slotNumber, rarityIds.get(odds.getKey()), (long) odds.getValue()));
				}
			}
		}
		Set<List<Long>> current = new HashSet<>(this.jdbc
			.sql("SELECT slot, rarity_id, weight FROM tcg_pack_slot_odds WHERE pack_id = :packId")
			.param("packId", packId)
			.query((row, index) -> List.of(row.getLong("slot"), row.getLong("rarity_id"), row.getLong("weight")))
			.list());
		if (current.equals(wanted)) {
			return false;
		}
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
		return true;
	}

	private static String orEmpty(String text) {
		return (text != null) ? text : "";
	}

}
