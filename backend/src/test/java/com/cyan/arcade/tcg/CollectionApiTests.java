package com.cyan.arcade.tcg;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A player's collection and how complete it is. {@link TinyCardGame} has seven cards in two sets. */
@IntegrationTest
class CollectionApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@BeforeEach
	void importTinyGame() {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
	}

	@Test
	void aNewPlayerOwnsNothingButSeesEverySetThereIsToCollect() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		tinyCollection(session).andExpect(status().isOk())
			.andExpect(jsonPath("$.summary.uniqueCards").value(0))
			.andExpect(jsonPath("$.summary.totalCards").value(0))
			.andExpect(jsonPath("$.summary.availableCards").value(7))
			.andExpect(jsonPath("$.summary.completionPercent").value(0.0))
			.andExpect(jsonPath("$.sets[*].code", contains("base", "promo")))
			.andExpect(jsonPath("$.sets[0].name").value("Base Set"))
			.andExpect(jsonPath("$.sets[0].imageUrl").value("/tiny/base.svg"))
			.andExpect(jsonPath("$.sets[0].game.slug").value(TinyCardGame.SLUG))
			.andExpect(jsonPath("$.sets[0].ownedCards").value(0))
			.andExpect(jsonPath("$.sets[0].totalCards").value(6))
			.andExpect(jsonPath("$.sets[0].completionPercent").value(0.0))
			.andExpect(jsonPath("$.cards").isEmpty())
			.andExpect(jsonPath("$.totalEntries").value(0))
			.andExpect(jsonPath("$.totalPages").value(0));
	}

	@Test
	void completionCountsDifferentCardsNotCopies() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		open(session, "single");
		open(session, "single");
		open(session, "promo");

		tinyCollection(session)
			// C1 twice and P1 once: two different cards out of seven, three cards in hand.
			.andExpect(jsonPath("$.summary.uniqueCards").value(2))
			.andExpect(jsonPath("$.summary.totalCards").value(3))
			.andExpect(jsonPath("$.summary.completionPercent").value(28.6))
			.andExpect(jsonPath("$.sets[0].ownedCards").value(1))
			.andExpect(jsonPath("$.sets[0].completionPercent").value(16.7))
			// The promo set has a single card, so it is complete.
			.andExpect(jsonPath("$.sets[1].ownedCards").value(1))
			.andExpect(jsonPath("$.sets[1].totalCards").value(1))
			.andExpect(jsonPath("$.sets[1].completionPercent").value(100.0))
			.andExpect(jsonPath("$.cards[*].card.number", contains("C1", "P1")))
			.andExpect(jsonPath("$.cards[*].quantity", contains(2, 1)))
			.andExpect(jsonPath("$.cards[0].card.rarity.code").value("common"))
			.andExpect(jsonPath("$.cards[0].card.set.code").value("base"))
			.andExpect(jsonPath("$.cards[1].card.set.code").value("promo"));
	}

	@Test
	void theListCanBeNarrowedToOneSetWhileTheStatisticsStayWhole() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		open(session, "single");
		open(session, "promo");

		this.mockMvc
			.perform(get("/api/tcg/collection").session(session)
				.param("game", TinyCardGame.SLUG)
				.param("set", TinyCardGame.setId(this.jdbc, "promo").toString()))
			.andExpect(jsonPath("$.cards[*].card.number", contains("P1")))
			.andExpect(jsonPath("$.totalEntries").value(1))
			.andExpect(jsonPath("$.summary.uniqueCards").value(2))
			.andExpect(jsonPath("$.sets", hasSize(2)));
	}

	@Test
	void withoutAFilterTheCollectionSpansEveryCardGame() throws Exception {
		this.importer.importDataset(secondGame(), "test");
		MockHttpSession session = Players.register(this.mockMvc);
		open(session, "single");

		this.mockMvc.perform(get("/api/tcg/collection").session(session))
			// The tiny game's seven cards and the second game's three.
			.andExpect(jsonPath("$.summary.availableCards", greaterThanOrEqualTo(10)))
			.andExpect(jsonPath("$.summary.uniqueCards").value(1))
			.andExpect(jsonPath("$.sets[*].code", hasItem("second-set")))
			.andExpect(jsonPath("$.sets[*].code", hasItem("base")));
		// A game the player has nothing of is still there to be completed.
		this.mockMvc.perform(get("/api/tcg/collection").session(session).param("game", "collection-second-game"))
			.andExpect(jsonPath("$.summary.uniqueCards").value(0))
			.andExpect(jsonPath("$.summary.availableCards").value(3))
			.andExpect(jsonPath("$.cards").isEmpty());
	}

	@Test
	void ownedCardsArePaged() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		open(session, "single");
		open(session, "promo");

		tinyCollection(session, "size", "1").andExpect(jsonPath("$.cards[*].card.number", contains("C1")))
			.andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.totalPages").value(2));
		tinyCollection(session, "size", "1", "page", "1").andExpect(jsonPath("$.cards[*].card.number", contains("P1")));
		tinyCollection(session, "size", "0").andExpect(status().isBadRequest());
		tinyCollection(session, "size", "500").andExpect(status().isOk());
		tinyCollection(session, "size", "501").andExpect(status().isBadRequest());
		tinyCollection(session, "page", "-1").andExpect(status().isBadRequest());
	}

	/** A second card game, of three cards nobody here opens packs of. */
	private static TcgDataset secondGame() {
		List<Card> cards = List.of(new Card("1", "One", "common", "/second/1.png", Map.of()),
				new Card("2", "Two", "common", "/second/2.png", Map.of()),
				new Card("3", "Three", "common", "/second/3.png", Map.of()));
		return new TcgDataset(new Game("collection-second-game", "Second Game", "", null, null),
				List.of(new Rarity("common", "Common", 1)), List.of(new CardSet("second-set", "Second Set", "", null,
						null, cards, List.of(new Pack("pack", "Pack", "", null, List.of(new Slot(1, Map.of("common", 1))), null)))));
	}

	private void open(MockHttpSession session, String packCode) throws Exception {
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", TinyCardGame.packId(this.jdbc, packCode)).session(session))
			.andExpect(status().isCreated());
	}

	private ResultActions tinyCollection(MockHttpSession session, String... params) throws Exception {
		var request = get("/api/tcg/collection").session(session).param("game", TinyCardGame.SLUG);
		for (int index = 0; index < params.length; index += 2) {
			request.param(params[index], params[index + 1]);
		}
		return this.mockMvc.perform(request);
	}

}
