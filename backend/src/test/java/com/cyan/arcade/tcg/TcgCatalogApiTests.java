package com.cyan.arcade.tcg;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Browsing card games, sets, cards and packs. Everything here is public and read from the
 * database: the card game that ships with the application was imported into it at startup.
 */
@IntegrationTest
class TcgCatalogApiTests {

	private static final String CRITTERS = "cyan-critters";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@BeforeEach
	void importTinyGame() {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		this.jdbc.update("UPDATE tcg_packs SET active = TRUE WHERE id = ?", TinyCardGame.packId(this.jdbc, "retired"));
	}

	@Test
	void listsTheCardGamesWithTheirRaritiesWithoutAuthentication() throws Exception {
		this.mockMvc.perform(get("/api/tcg/games"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].slug", hasItem(CRITTERS)))
			.andExpect(jsonPath("$[*].slug", hasItem(TinyCardGame.SLUG)));

		this.mockMvc.perform(get("/api/tcg/games/" + CRITTERS))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Cyan Critters"))
			.andExpect(jsonPath("$.description").isNotEmpty())
			.andExpect(jsonPath("$.imageUrl").value("/tcg-assets/cyan-critters/game.svg"))
			.andExpect(jsonPath("$.setCount").value(2))
			.andExpect(jsonPath("$.cardCount").value(36))
			// Each game brings its own rarities; the tier is what the platform understands of them.
			.andExpect(jsonPath("$.rarities[*].code", contains("common", "uncommon", "rare", "epic", "legendary")))
			.andExpect(jsonPath("$.rarities[*].tier", contains(1, 2, 3, 4, 5)));
	}

	@Test
	void gamesHaveNothingToDoWithTheGenericGameCatalog() throws Exception {
		this.mockMvc.perform(get("/api/games")).andExpect(jsonPath("$[*].slug", not(hasItem(CRITTERS))));
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
	void listsTheSetsOfAGame() throws Exception {
		this.mockMvc.perform(get("/api/tcg/sets").param("game", CRITTERS))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].code", contains("pixel-meadow", "neon-depths")))
			.andExpect(jsonPath("$[0].id").isNumber())
			.andExpect(jsonPath("$[0].name").value("Pixel Meadow"))
			.andExpect(jsonPath("$[0].imageUrl").value("/tcg-assets/cyan-critters/pixel-meadow/set.svg"))
			.andExpect(jsonPath("$[0].releasedOn").value("2026-09-01"))
			.andExpect(jsonPath("$[0].game.slug").value(CRITTERS))
			.andExpect(jsonPath("$[0].game.name").value("Cyan Critters"))
			.andExpect(jsonPath("$[0].cardCount").value(18))
			.andExpect(jsonPath("$[0].packCount").value(2));

		// Without a game, every set of every game.
		this.mockMvc.perform(get("/api/tcg/sets"))
			.andExpect(jsonPath("$[*].code", hasItem("pixel-meadow")))
			.andExpect(jsonPath("$[*].code", hasItem("promo")));
		this.mockMvc.perform(get("/api/tcg/sets/" + TinyCardGame.setId(this.jdbc, "promo")))
			.andExpect(jsonPath("$.name").value("Promo"))
			.andExpect(jsonPath("$.cardCount").value(1));
		this.mockMvc.perform(get("/api/tcg/sets/999999")).andExpect(status().isNotFound());
	}

	@Test
	void listsTheCardsOfASetInNumberOrderWithRarityAndMetadata() throws Exception {
		this.mockMvc.perform(get("/api/tcg/cards").param("set", crittersSetId("pixel-meadow").toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(18)))
			.andExpect(jsonPath("$[0].id").isNumber())
			.andExpect(jsonPath("$[0].number").value("001"))
			.andExpect(jsonPath("$[0].name").value("Sproutle"))
			.andExpect(jsonPath("$[0].imageUrl").value("/tcg-assets/cyan-critters/pixel-meadow/cards/001.svg"))
			.andExpect(jsonPath("$[0].rarity.code").value("common"))
			.andExpect(jsonPath("$[0].rarity.name").value("Common"))
			.andExpect(jsonPath("$[0].rarity.tier").value(1))
			.andExpect(jsonPath("$[0].set.code").value("pixel-meadow"))
			.andExpect(jsonPath("$[0].game.slug").value(CRITTERS))
			// Metadata is the game's own business; it comes back as it was imported.
			.andExpect(jsonPath("$[0].metadata.type").value("Leaf"))
			.andExpect(jsonPath("$[0].metadata.hp").value(40))
			.andExpect(jsonPath("$[0].metadata.flavor").isNotEmpty())
			.andExpect(jsonPath("$[17].number").value("018"))
			.andExpect(jsonPath("$[17].rarity.code").value("legendary"))
			.andExpect(jsonPath("$[17].rarity.tier").value(5));
	}

	@Test
	void cardsAreAlwaysAskedForBySet() throws Exception {
		this.mockMvc.perform(get("/api/tcg/cards")).andExpect(status().isBadRequest());
		this.mockMvc.perform(get("/api/tcg/cards").param("set", "999999")).andExpect(status().isNotFound());
	}

	@Test
	void listsThePacksOfASetWithTheirOddsInTheOpen() throws Exception {
		this.mockMvc.perform(get("/api/tcg/packs").param("set", crittersSetId("pixel-meadow").toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].code", contains("sunrise", "twilight")))
			.andExpect(jsonPath("$[0].name").value("Sunrise Pack"))
			.andExpect(jsonPath("$[0].imageUrl").value("/tcg-assets/cyan-critters/pixel-meadow/packs/sunrise.svg"))
			.andExpect(jsonPath("$[0].set.code").value("pixel-meadow"))
			.andExpect(jsonPath("$[0].game.slug").value(CRITTERS))
			.andExpect(jsonPath("$[0].cardsPerPack").value(5))
			// Seven commons, five uncommons, and this pack's two rares, one epic and the legendary.
			.andExpect(jsonPath("$[0].poolSize").value(16))
			.andExpect(jsonPath("$[0].slots[*].slot", contains(1, 2, 3, 4, 5)))
			.andExpect(jsonPath("$[0].slots[0].odds[*].rarity.code", contains("common")))
			.andExpect(jsonPath("$[0].slots[0].odds[0].percent").value(100.0))
			.andExpect(jsonPath("$[0].slots[3].odds[*].rarity.code", contains("uncommon", "rare")))
			.andExpect(jsonPath("$[0].slots[3].odds[*].percent", contains(90.0, 10.0)))
			.andExpect(jsonPath("$[0].slots[4].odds[*].rarity.code", contains("rare", "epic", "legendary")))
			.andExpect(jsonPath("$[0].slots[4].odds[*].percent", contains(75.0, 20.0, 5.0)));

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

	private Long crittersSetId(String code) throws Exception {
		String body = this.mockMvc.perform(get("/api/tcg/sets").param("game", CRITTERS))
			.andReturn()
			.getResponse()
			.getContentAsString();
		Number id = JsonPath.<java.util.List<Number>>read(body, "$[?(@.code == '%s')].id".formatted(code)).get(0);
		return id.longValue();
	}

}
