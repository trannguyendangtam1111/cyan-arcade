package com.cyan.arcade.tcg;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.dataimport.ImportReport;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Game;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Rarity;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A new expansion arriving in a later import, the way EB-05 joins the One Piece catalog: the
 * cards, packs, collections and opening histories that were there stay exactly as they were.
 */
@IntegrationTest
class ExpansionImportTests {

	private static final String SLUG = "expansion-test-game";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@Test
	void anAddedSetLeavesExistingCardsCollectionsAndOpeningsAsTheyWere() throws Exception {
		this.importer.importDataset(dataset(false), "test");
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		open(player, "first");
		open(player, "first");
		List<Map<String, Object>> cardsBefore = cards();
		List<Map<String, Object>> collectionBefore = collectionOf(playerId);
		List<Map<String, Object>> openingsBefore = openingsOf(playerId);
		List<Map<String, Object>> packsBefore = packs();

		ImportReport added = this.importer.importDataset(dataset(true), "test");

		assertThat(added.sets()).isEqualTo(2);
		assertThat(added.newCards()).isEqualTo(2);
		assertThat(added.updatedCards()).isZero();
		assertThat(added.unchangedCards()).isEqualTo(3);
		assertThat(cards()).hasSize(5).containsAll(cardsBefore);
		assertThat(packs()).containsAll(packsBefore).hasSize(2);
		assertThat(collectionOf(playerId)).isEqualTo(collectionBefore);
		assertThat(openingsOf(playerId)).isEqualTo(openingsBefore);

		// The new set's pack opens and adds both of its cards to the same collection.
		open(player, "second");
		assertThat(collectionOf(playerId)).hasSize(collectionBefore.size() + 2).containsAll(collectionBefore);

		// Importing the same catalog again changes nothing.
		ImportReport again = this.importer.importDataset(dataset(true), "test");
		assertThat(again.newCards()).isZero();
		assertThat(again.updatedCards()).isZero();
		assertThat(again.unchangedCards()).isEqualTo(5);
	}

	private void open(MockHttpSession session, String setCode) throws Exception {
		Long packId = this.jdbc.queryForObject("""
				SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = ? AND s.code = ?
				""", Long.class, SLUG, setCode);
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", packId).session(session)).andExpect(status().isCreated());
	}

	private List<Map<String, Object>> cards() {
		return this.jdbc.queryForList("""
				SELECT c.id, c.external_id, c.set_id, c.rarity_id, c.card_number, c.name, c.image_url, c.display_order
				FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = ? ORDER BY c.id
				""", SLUG);
	}

	private List<Map<String, Object>> packs() {
		return this.jdbc.queryForList("""
				SELECT p.id, p.set_id, p.code, p.active,
				       (SELECT string_agg(pc.card_id::text, ',' ORDER BY pc.card_id) FROM tcg_pack_cards pc
				        WHERE pc.pack_id = p.id) AS pool,
				       (SELECT string_agg(o.slot || ':' || o.rarity_id || ':' || o.weight, ',' ORDER BY o.slot, o.rarity_id)
				        FROM tcg_pack_slot_odds o WHERE o.pack_id = p.id) AS odds
				FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id
				WHERE g.slug = ? ORDER BY p.id
				""", SLUG);
	}

	private List<Map<String, Object>> collectionOf(Long userId) {
		return this.jdbc.queryForList("""
				SELECT card_id, quantity, first_obtained_at, last_obtained_at FROM tcg_user_cards
				WHERE user_id = ? ORDER BY card_id
				""", userId);
	}

	private List<Map<String, Object>> openingsOf(Long userId) {
		return this.jdbc.queryForList("""
				SELECT o.id, o.pack_id, o.opened_at, oc.position, oc.card_id, oc.was_new
				FROM tcg_pack_openings o JOIN tcg_pack_opening_cards oc ON oc.opening_id = o.id
				WHERE o.user_id = ? ORDER BY o.id, oc.position
				""", userId);
	}

	/** A first set of three cards, and with {@code withExpansion} a second set of two. */
	private static TcgDataset dataset(boolean withExpansion) {
		List<Slot> twoCards = List.of(new Slot(1, Map.of("common", 1)), new Slot(1, Map.of("rare", 1)));
		CardSet first = new CardSet("first", "First", "", null, null,
				List.of(card("F-1", "common"), card("F-2", "common"), card("F-3", "rare")),
				List.of(new Pack("booster", "First Booster", "", null, twoCards, null)));
		CardSet second = new CardSet("second", "Second", "", null, null,
				List.of(card("S-1", "common"), card("S-2", "rare")),
				List.of(new Pack("booster", "Second Booster", "", null, twoCards, null)));
		return new TcgDataset(new Game(SLUG, "Expansion Test Game", "", null, null),
				List.of(new Rarity("common", "Common", 1), new Rarity("rare", "Rare", 3)),
				withExpansion ? List.of(first, second) : List.of(first));
	}

	private static Card card(String number, String rarity) {
		return new Card(number, "Card " + number, rarity, "/expansion/" + number + ".png", Map.of());
	}

}
