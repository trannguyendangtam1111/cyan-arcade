package com.cyan.arcade.tcg;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Game;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Rarity;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Browsing card games, sets, cards and packs. Everything here is public and read from the
 * database; nothing reaches the sources the games were imported from.
 *
 * <p>Besides the tiny test game, these tests import a game shaped like the real ones: an accent
 * color and an attribution, sets in a series with a logo or only a cover card, cards listed in the
 * source's order with thumbnails, alternate arts that share a printed number, and simulator odds.
 */
@IntegrationTest
class TcgCatalogApiTests {

	private static final String REAL = "catalog-real-shaped";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@BeforeEach
	void importGames() {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		this.importer.importDataset(realShapedGame(), "test");
		this.jdbc.update("UPDATE tcg_packs SET active = TRUE WHERE id = ?", TinyCardGame.packId(this.jdbc, "retired"));
	}

	@Test
	void listsTheCardGamesWithTheirRaritiesColorAndAttributionWithoutAuthentication() throws Exception {
		this.mockMvc.perform(get("/api/tcg/games"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].slug", hasItem(REAL)))
			.andExpect(jsonPath("$[*].slug", hasItem(TinyCardGame.SLUG)));

		this.mockMvc.perform(get("/api/tcg/games/" + REAL))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Real Shaped TCG"))
			.andExpect(jsonPath("$.description").isNotEmpty())
			.andExpect(jsonPath("$.imageUrl").value("https://cards.example/alpha-1/large.png"))
			.andExpect(jsonPath("$.accentColor").value("#c8102e"))
			.andExpect(jsonPath("$.attribution").value("Card data: Example source. Not affiliated."))
			.andExpect(jsonPath("$.setCount").value(2))
			.andExpect(jsonPath("$.cardCount").value(5))
			// Each game brings its own rarities; the tier is what the platform understands of them.
			.andExpect(jsonPath("$.rarities[*].code", contains("common", "rare", "parallel")))
			.andExpect(jsonPath("$.rarities[*].tier", contains(1, 3, 4)));
	}

	@Test
	void gamesHaveNothingToDoWithTheGenericGameCatalog() throws Exception {
		this.mockMvc.perform(get("/api/games")).andExpect(jsonPath("$[*].slug", not(hasItem(REAL))));
		this.mockMvc.perform(get("/api/tcg/games")).andExpect(jsonPath("$[*].slug", not(hasItem("snake"))));
	}

	@Test
	void anUnknownOrInactiveCardGameIsNotFound() throws Exception {
		this.mockMvc.perform(get("/api/tcg/games/pocket-dragons"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));

		this.jdbc.update("UPDATE tcg_games SET active = FALSE WHERE slug = ?", TinyCardGame.SLUG);
		try {
			this.mockMvc.perform(get("/api/tcg/games")).andExpect(jsonPath("$[*].slug", not(hasItem(TinyCardGame.SLUG))));
			this.mockMvc.perform(get("/api/tcg/games/" + TinyCardGame.SLUG)).andExpect(status().isNotFound());
			this.mockMvc.perform(get("/api/tcg/sets").param("game", TinyCardGame.SLUG))
				.andExpect(jsonPath("$").isEmpty());
		}
		finally {
			this.jdbc.update("UPDATE tcg_games SET active = TRUE WHERE slug = ?", TinyCardGame.SLUG);
		}
	}

	@Test
	void listsTheSetsOfAGameWithSeriesLogoAndCover() throws Exception {
		this.mockMvc.perform(get("/api/tcg/sets").param("game", REAL))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].code", contains("alpha", "beta")))
			.andExpect(jsonPath("$[0].id").isNumber())
			.andExpect(jsonPath("$[0].name").value("Alpha"))
			.andExpect(jsonPath("$[0].series").value("First Series"))
			.andExpect(jsonPath("$[0].imageUrl").value("https://cards.example/alpha/logo.png"))
			.andExpect(jsonPath("$[0].coverImageUrl").value("https://cards.example/alpha-2-p1/large.png"))
			.andExpect(jsonPath("$[0].releasedOn").value("2026-01-30"))
			.andExpect(jsonPath("$[0].game.slug").value(REAL))
			.andExpect(jsonPath("$[0].game.name").value("Real Shaped TCG"))
			.andExpect(jsonPath("$[0].cardCount").value(4))
			.andExpect(jsonPath("$[0].packCount").value(1))
			// A set without a logo is shown by its cover card.
			.andExpect(jsonPath("$[1].imageUrl").value(nullValue()))
			.andExpect(jsonPath("$[1].coverImageUrl").value("https://cards.example/beta-1/large.png"));

		// Without a game, every set of every game.
		this.mockMvc.perform(get("/api/tcg/sets"))
			.andExpect(jsonPath("$[*].code", hasItem("alpha")))
			.andExpect(jsonPath("$[*].code", hasItem("promo")));
		this.mockMvc.perform(get("/api/tcg/sets/" + TinyCardGame.setId(this.jdbc, "promo")))
			.andExpect(jsonPath("$.name").value("Promo"))
			.andExpect(jsonPath("$.cardCount").value(1));
		this.mockMvc.perform(get("/api/tcg/sets/999999")).andExpect(status().isNotFound());
	}

	@Test
	void listsTheCardsOfASetInTheSetsOwnOrderWithVariantsThumbnailsAndMetadata() throws Exception {
		this.mockMvc.perform(get("/api/tcg/cards").param("set", setId("alpha").toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(4)))
			// The set's own order, not text order of the numbers ("10" would sort before "2").
			.andExpect(jsonPath("$[*].number", contains("1", "2", "2", "10")))
			.andExpect(jsonPath("$[*].externalId", contains("alpha-1", "alpha-2", "alpha-2-p1", "alpha-10")))
			.andExpect(jsonPath("$[0].id").isNumber())
			.andExpect(jsonPath("$[0].name").value("First Card"))
			.andExpect(jsonPath("$[0].imageUrl").value("https://cards.example/alpha-1/large.png"))
			.andExpect(jsonPath("$[0].thumbnailUrl").value("https://cards.example/alpha-1/small.png"))
			.andExpect(jsonPath("$[0].rarity.code").value("common"))
			.andExpect(jsonPath("$[0].rarity.name").value("Common"))
			.andExpect(jsonPath("$[0].rarity.tier").value(1))
			.andExpect(jsonPath("$[0].set.code").value("alpha"))
			.andExpect(jsonPath("$[0].game.slug").value(REAL))
			// Metadata is the game's own business; it comes back as it was imported.
			.andExpect(jsonPath("$[0].metadata.hp").value(60))
			.andExpect(jsonPath("$[0].metadata.types").value("Grass"))
			// An alternate art shares the number of the card it is a version of.
			.andExpect(jsonPath("$[2].name").value("Second Card"))
			.andExpect(jsonPath("$[2].rarity.code").value("parallel"))
			.andExpect(jsonPath("$[2].metadata.variant").value("Alternate art (parallel)"))
			.andExpect(jsonPath("$[3].thumbnailUrl").value(nullValue()));
	}

	@Test
	void cardsAreAlwaysAskedForBySet() throws Exception {
		this.mockMvc.perform(get("/api/tcg/cards")).andExpect(status().isBadRequest());
		this.mockMvc.perform(get("/api/tcg/cards").param("set", "999999")).andExpect(status().isNotFound());
	}

	@Test
	void listsThePacksOfASetWithTheirOddsAndWhereTheOddsComeFrom() throws Exception {
		this.mockMvc.perform(get("/api/tcg/packs").param("set", setId("alpha").toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].code", contains("booster")))
			.andExpect(jsonPath("$[0].name").value("Alpha Booster Pack"))
			// No artwork of its own: the arcade draws it from the set's logo and cover in the game's color.
			.andExpect(jsonPath("$[0].imageUrl").value(nullValue()))
			.andExpect(jsonPath("$[0].setLogoUrl").value("https://cards.example/alpha/logo.png"))
			.andExpect(jsonPath("$[0].coverImageUrl").value("https://cards.example/alpha-2-p1/large.png"))
			.andExpect(jsonPath("$[0].accentColor").value("#c8102e"))
			.andExpect(jsonPath("$[0].oddsNote").value("Simulator probabilities, not official pull rates."))
			.andExpect(jsonPath("$[0].set.code").value("alpha"))
			.andExpect(jsonPath("$[0].game.slug").value(REAL))
			.andExpect(jsonPath("$[0].cardsPerPack").value(3))
			.andExpect(jsonPath("$[0].poolSize").value(4))
			.andExpect(jsonPath("$[0].slots[*].slot", contains(1, 2, 3)))
			.andExpect(jsonPath("$[0].slots[0].odds[*].rarity.code", contains("common")))
			.andExpect(jsonPath("$[0].slots[0].odds[0].percent").value(100.0))
			.andExpect(jsonPath("$[0].slots[2].odds[*].rarity.code", contains("common", "rare", "parallel")))
			.andExpect(jsonPath("$[0].slots[2].odds[*].percent", contains(50.0, 40.0, 10.0)));

		this.mockMvc.perform(get("/api/tcg/packs")).andExpect(status().isBadRequest());
		this.mockMvc.perform(get("/api/tcg/packs").param("set", "999999")).andExpect(status().isNotFound());
	}

	@Test
	void showsOnePack() throws Exception {
		Long boosterId = TinyCardGame.packId(this.jdbc, "booster");

		this.mockMvc.perform(get("/api/tcg/packs/" + boosterId))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(boosterId))
			.andExpect(jsonPath("$.name").value("Booster"))
			.andExpect(jsonPath("$.description").value("Three cards."))
			.andExpect(jsonPath("$.imageUrl").value("/tiny/booster.svg"))
			.andExpect(jsonPath("$.oddsNote").value(nullValue()))
			.andExpect(jsonPath("$.cardsPerPack").value(3))
			.andExpect(jsonPath("$.poolSize").value(6))
			.andExpect(jsonPath("$.slots[2].odds[*].rarity.code", contains("rare", "legendary")))
			.andExpect(jsonPath("$.slots[2].odds[*].percent", contains(90.0, 10.0)));

		this.mockMvc.perform(get("/api/tcg/packs/999999")).andExpect(status().isNotFound());
	}

	@Test
	void aWithdrawnPackIsNoLongerOffered() throws Exception {
		Long retired = TinyCardGame.packId(this.jdbc, "retired");
		this.jdbc.update("UPDATE tcg_packs SET active = FALSE WHERE id = ?", retired);

		this.mockMvc.perform(get("/api/tcg/packs/" + retired)).andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/tcg/packs").param("set", TinyCardGame.setId(this.jdbc, "base").toString()))
			.andExpect(jsonPath("$[*].code", not(hasItem("retired"))))
			.andExpect(jsonPath("$[*].code", hasItem("booster")));
	}

	private Long setId(String code) {
		return this.jdbc.queryForObject(
				"SELECT s.id FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = ? AND s.code = ?",
				Long.class, REAL, code);
	}

	/** What an import from a real source looks like, in miniature. */
	private static TcgDataset realShapedGame() {
		List<Slot> slots = List.of(new Slot(2, Map.of("common", 1)),
				new Slot(1, orderedOdds("common", 50, "rare", 40, "parallel", 10)));
		return new TcgDataset(
				new Game(REAL, "Real Shaped TCG", "Imported, in miniature.", "https://cards.example/alpha-1/large.png",
						null, "#c8102e", "Card data: Example source. Not affiliated."),
				List.of(new Rarity("common", "Common", 1), new Rarity("rare", "Rare", 3),
						new Rarity("parallel", "Parallel", 4)),
				List.of(new CardSet("alpha", "ALPHA-SET", "Alpha", "The first set.", "First Series",
						"https://cards.example/alpha/logo.png", "https://cards.example/alpha-2-p1/large.png",
						LocalDate.of(2026, 1, 30),
						List.of(card("alpha-1", "1", "First Card", "common", true, Map.of("hp", 60, "types", "Grass")),
								card("alpha-2", "2", "Second Card", "rare", true, Map.of()),
								card("alpha-2-p1", "2", "Second Card", "parallel", true,
										Map.of("variant", "Alternate art (parallel)")),
								card("alpha-10", "10", "Tenth Card", "common", false, Map.of())),
						List.of(new Pack("booster", "Alpha Booster Pack", "Three cards.", null,
								"Simulator probabilities, not official pull rates.", slots, null))),
						new CardSet("beta", "BETA-SET", "Beta", "", "First Series", null,
								"https://cards.example/beta-1/large.png", null,
								List.of(card("beta-1", "1", "Beta Card", "common", false, Map.of())), List.of())));
	}

	private static Card card(String id, String number, String name, String rarity, boolean thumbnail,
			Map<String, Object> metadata) {
		return new Card(id, number, name, rarity, "https://cards.example/" + id + "/large.png",
				thumbnail ? "https://cards.example/" + id + "/small.png" : null, metadata);
	}

	private static Map<String, Integer> orderedOdds(String first, int firstWeight, String second, int secondWeight,
			String third, int thirdWeight) {
		Map<String, Integer> odds = new java.util.LinkedHashMap<>();
		odds.put(first, firstWeight);
		odds.put(second, secondWeight);
		odds.put(third, thirdWeight);
		return odds;
	}

}
