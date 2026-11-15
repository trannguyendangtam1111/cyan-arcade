package com.cyan.arcade.tcg.dataimport.yugioh;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.TinyCardGame;
import com.cyan.arcade.tcg.dataimport.ImportReport;
import com.cyan.arcade.tcg.dataimport.InvalidDatasetException;
import com.cyan.arcade.tcg.dataimport.SourceConfig.GameInfo;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoCard;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoPrinting;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The Yu-Gi-Oh! pilot's printings and disabled pack imported from YGOPRODeck's recorded
 * answers for Beyond the Brave. Each test imports into a game of its own, so they do not depend on
 * one another.
 */
@IntegrationTest
class YugiohPilotImportTests {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final YugiohConfig SHIPPED = YugiohConfig.load(new ClassPathResource("tcg/pilots/yugioh.json"),
			JSON);

	private static final List<String> BETB_IDS = List.of("betb:BETB-EN009:secret-rare", "betb:BETB-EN009:starlight-rare",
			"betb:BETB-EN018:ultra-rare", "betb:BETB-EN018:starlight-rare", "betb:BETB-EN024:super-rare",
			"betb:BETB-EN025:common", "betb:BETB-EN045:common", "betb:BETB-EN049:super-rare",
			"betb:BETB-EN063:super-rare");

	@Autowired
	private TcgDatasetImporter importer;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private MockMvc mockMvc;

	@Test
	void aDryRunWritesNothingThenTheImportStoresAHiddenPilotWithoutImages() {
		String slug = "ygo-pilot-first";
		ImportReport dry = this.importer.importDataset(dataset(slug, cards()), "test", true);
		assertThat(dry.newCards()).isEqualTo(9);
		assertThat(count("tcg_games WHERE slug = ?", slug)).isZero();

		ImportReport report = this.importer.importDataset(dataset(slug, cards()), "test");

		assertThat(report.newCards()).isEqualTo(9);
		assertThat(report.packs()).isEqualTo(1);
		assertThat(this.jdbc.queryForObject("SELECT active FROM tcg_games WHERE slug = ?", Boolean.class, slug)).isFalse();
		assertThat(this.jdbc.queryForList("""
				SELECT c.external_id FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = ? ORDER BY c.display_order""", String.class, slug)).isEqualTo(BETB_IDS);
		assertThat(count("""
				tcg_cards c JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = ? AND c.image_url IS NULL AND c.thumbnail_url IS NULL""", slug)).isEqualTo(9);
		// A disabled pack, with one pool and five rarity weights per slot.
		assertThat(count("tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = ?",
				slug)).isEqualTo(1);
		assertThat(count("tcg_pack_slot_odds o JOIN tcg_rarities r ON r.id = o.rarity_id JOIN tcg_games g ON g.id = r.game_id WHERE g.slug = ?",
				slug)).isEqualTo(45);
		assertThat(this.jdbc.queryForObject("""
				SELECT c.card_number || '|' || c.name || '|' || r.code || '|' || (c.metadata->>'passcode') || '|'
				       || (c.metadata->>'attribute') || '|' || (c.metadata->>'level') || '|' || (c.metadata->>'atk') || '|'
				       || (c.metadata->>'def') || '|' || (c.metadata->>'monsterType') || '|' || (c.metadata->>'cardType')
				FROM tcg_cards c JOIN tcg_rarities r ON r.id = c.rarity_id JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = ? AND c.external_id = 'betb:BETB-EN018:starlight-rare'""", String.class, slug))
			.isEqualTo("BETB-EN018|Ars Magna the Finite and the Infinite|starlight-rare|36270527|EARTH|8|1000|2400|Warrior|Effect Monster");
	}

	@Test
	void importingTheSamePrintingsAgainChangesNothing() {
		String slug = "ygo-pilot-again";
		this.importer.importDataset(dataset(slug, cards()), "test");

		ImportReport again = this.importer.importDataset(dataset(slug, cards()), "test");

		assertThat(List.of(again.newCards(), again.updatedCards(), again.newSets(), again.updatedSets(), again.newPacks(),
				again.updatedPacks(), again.movedCards())).containsOnly(0);
		assertThat(again.unchangedCards()).isEqualTo(9);
	}

	@Test
	void theHiddenGameIsListedNowhereAndServesItsTextCardsOnlyOnceActivated() throws Exception {
		String slug = "ygo-pilot-api";
		this.importer.importDataset(dataset(slug, cards()), "test");
		Long setId = this.jdbc.queryForObject(
				"SELECT s.id FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = ? AND s.code = 'betb'",
				Long.class, slug);

		this.mockMvc.perform(get("/api/tcg/games")).andExpect(jsonPath("$[*].slug", not(hasItem(slug))));
		this.mockMvc.perform(get("/api/tcg/cards").param("set", setId.toString())).andExpect(status().isNotFound());

		this.jdbc.update("UPDATE tcg_games SET active = TRUE WHERE slug = ?", slug);
		try {
			// An import only decides how a new game starts: one activated on purpose stays shown.
			this.importer.importDataset(dataset(slug, cards()), "test");
			assertThat(this.jdbc.queryForObject("SELECT active FROM tcg_games WHERE slug = ?", Boolean.class, slug))
				.isTrue();
			this.mockMvc.perform(get("/api/tcg/cards").param("set", setId.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(9))
				.andExpect(jsonPath("$[2].externalId").value("betb:BETB-EN018:ultra-rare"))
				.andExpect(jsonPath("$[2].number").value("BETB-EN018"))
				.andExpect(jsonPath("$[2]", hasKey("imageUrl")))
				.andExpect(jsonPath("$[2].imageUrl").value(nullValue()))
				.andExpect(jsonPath("$[2].thumbnailUrl").value(nullValue()))
				.andExpect(jsonPath("$[2].rarity.name").value("Ultra Rare"))
				.andExpect(jsonPath("$[2].metadata.level").value(8))
				.andExpect(jsonPath("$[2].metadata.atk").value(1000))
				.andExpect(jsonPath("$[2].metadata.effect").isString())
				.andExpect(jsonPath("$[6].metadata.rank").value(3))
				.andExpect(jsonPath("$[7].metadata.linkRating").value(2))
				.andExpect(jsonPath("$[8].metadata.property").value("Normal"));
			this.mockMvc.perform(get("/api/tcg/packs").param("set", setId.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$").isEmpty());
		}
		finally {
			this.jdbc.update("UPDATE tcg_games SET active = FALSE WHERE slug = ?", slug);
		}
	}

	@Test
	void whatTheProviderDropsStaysWhatItCorrectsIsUpdatedAndANewRarityIsANewCard() {
		String slug = "ygo-pilot-changes";
		this.importer.importDataset(dataset(slug, cards()), "test");

		// A printing the provider no longer lists is kept: collections may point at it.
		List<YgoCard> withoutMates = cards().stream().filter((card) -> card.id() != 30068809L).toList();
		ImportReport dropped = this.importer.importDataset(dataset(slug, withoutMates), "test");
		assertThat(dropped.cards()).isEqualTo(8);
		assertThat(List.of(dropped.newCards(), dropped.updatedCards())).containsOnly(0);
		assertThat(externalIds(slug)).contains("betb:BETB-EN063:super-rare").hasSize(9);

		// Corrected card text updates the printing in place, under the same id.
		List<YgoCard> corrected = cards().stream()
			.map((card) -> (card.id() == 51420096L) ? withDesc(card, "Corrected text.") : card)
			.toList();
		ImportReport updated = this.importer.importDataset(dataset(slug, corrected), "test");
		assertThat(updated.updatedCards()).isEqualTo(1);
		assertThat(this.jdbc.queryForObject("""
				SELECT c.metadata->>'effect' FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = ? AND c.external_id = 'betb:BETB-EN025:common'""", String.class, slug))
			.isEqualTo("Corrected text.");

		// A printing listed in another rarity is another printing: a new card, the old one kept.
		List<YgoCard> reRarity = corrected.stream()
			.map((card) -> (card.id() == 51420096L) ? withRarity(card, "Super Rare") : card)
			.toList();
		ImportReport moved = this.importer.importDataset(dataset(slug, reRarity), "test");
		assertThat(moved.newCards()).isEqualTo(1);
		assertThat(externalIds(slug)).contains("betb:BETB-EN025:common", "betb:BETB-EN025:super-rare").hasSize(10);
	}

	@Test
	void aBrokenDatasetIsRefusedWholeAndLeavesTheCatalogAsItWas() {
		String slug = "ygo-pilot-broken";
		this.importer.importDataset(dataset(slug, cards()), "test");
		List<String> before = cardRows(slug);

		TcgDataset good = dataset(slug, cards());
		TcgDataset.CardSet set = good.sets().get(0);
		List<TcgDataset.Card> twice = new ArrayList<>(set.cards());
		twice.add(set.cards().get(0));
		TcgDataset broken = new TcgDataset(good.game(), good.rarities(),
				List.of(new TcgDataset.CardSet(set.code(), null, set.name(), "", null, null, null, set.releasedOn(), twice,
						List.of())));

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> this.importer.importDataset(broken, "test"))
			.satisfies((ex) -> assertThat(ex.getProblems())
				.anyMatch((problem) -> problem.contains("betb:BETB-EN009:secret-rare")));
		assertThat(cardRows(slug)).isEqualTo(before);
	}

	@Test
	void importingThePilotLeavesOtherGamesCollectionsAndOpeningsAlone() throws Exception {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		MockHttpSession session = Players.register(this.mockMvc);
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", TinyCardGame.packId(this.jdbc, "booster")).session(session))
			.andExpect(status().isCreated());
		String slug = "ygo-pilot-neighbours";
		List<String> others = otherRows(slug);

		this.importer.importDataset(dataset(slug, cards()), "test");

		assertThat(otherRows(slug)).isEqualTo(others);
	}

	private static List<YgoCard> cards() {
		return YugiohPrintingMapperTests.cards("cardinfo-beyond-the-brave.json");
	}

	private static TcgDataset dataset(String slug, List<YgoCard> cards) {
		GameInfo game = SHIPPED.game();
		YugiohConfig config = new YugiohConfig(new GameInfo(slug, game.name(), game.description(), game.accentColor(),
				game.attribution(), game.coverCard()), SHIPPED.region(), SHIPPED.rarities(), SHIPPED.excludedRarities(),
				SHIPPED.sets());
		return YugiohSource.datasetOf(config,
				YugiohPrintingMapper.map(config, YugiohPrintingMapperTests.sets(), Map.of("Beyond the Brave", cards)));
	}

	private static YgoCard withDesc(YgoCard card, String desc) {
		return new YgoCard(card.id(), card.name(), card.type(), card.frameType(), desc, card.race(), card.atk(),
				card.def(), card.level(), card.attribute(), card.linkval(), card.scale(), card.archetype(),
				card.printings());
	}

	private static YgoCard withRarity(YgoCard card, String rarity) {
		return new YgoCard(card.id(), card.name(), card.type(), card.frameType(), card.desc(), card.race(), card.atk(),
				card.def(), card.level(), card.attribute(), card.linkval(), card.scale(), card.archetype(),
				card.printings().stream().map((p) -> new YgoPrinting(p.setName(), p.code(), rarity, null)).toList());
	}

	private int count(String from, Object... args) {
		return this.jdbc.queryForObject("SELECT count(*) FROM " + from, Integer.class, args);
	}

	private List<String> externalIds(String slug) {
		return this.jdbc.queryForList(
				"SELECT c.external_id FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = ? ORDER BY 1",
				String.class, slug);
	}

	private List<String> cardRows(String slug) {
		return this.jdbc.queryForList("""
				SELECT c.id || '|' || c.external_id || '|' || c.card_number || '|' || c.metadata::text || '|' || c.display_order
				FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = ? ORDER BY c.id""", String.class, slug);
	}

	/** Every card of every other game, every collection and every opening. */
	private List<String> otherRows(String slug) {
		List<String> rows = new ArrayList<>(this.jdbc.queryForList("""
				SELECT c.id || '|' || c.external_id || '|' || coalesce(c.image_url, '') || '|' || c.metadata::text
				FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug <> ? ORDER BY c.id""", String.class,
				slug));
		rows.addAll(this.jdbc.queryForList(
				"SELECT user_id || '|' || card_id || '|' || quantity || '|' || last_obtained_at FROM tcg_user_cards ORDER BY 1",
				String.class));
		rows.addAll(this.jdbc.queryForList(
				"SELECT o.id || '|' || oc.position || '|' || oc.card_id FROM tcg_pack_openings o JOIN tcg_pack_opening_cards oc ON oc.opening_id = o.id ORDER BY 1",
				String.class));
		return rows;
	}

}
