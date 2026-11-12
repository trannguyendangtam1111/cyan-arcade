package com.cyan.arcade.tcg;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.dataimport.ImportReport;
import com.cyan.arcade.tcg.dataimport.InvalidDatasetException;
import com.cyan.arcade.tcg.dataimport.SourceConfig;
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
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cards without a picture, shown as text: only a game that says its cards may come without one can
 * have them, and they are stored and served with no image at all, never a blank one.
 */
@IntegrationTest
class TextCardsTests {

	private static final String SLUG = "text-cards-game";

	private static final List<Rarity> RARITIES = List.of(new Rarity("common", "Common", 1));

	private static final Map<String, Object> MONSTER = Map.of("cardType", "Effect Monster", "attribute", "EARTH",
			"level", 8, "atk", 1000, "def", 2400, "effect", "Text only.");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@BeforeEach
	void importTheTextGame() {
		this.importer.importDataset(textGame(true), "test");
	}

	@Test
	void aCardWithoutAnImageIsStoredWithNoneAndOneWithAnImageKeepsIt() {
		assertThat(this.jdbc.queryForList("""
				SELECT c.external_id || '|' || coalesce(c.image_url, 'NULL') || '|' || coalesce(c.thumbnail_url, 'NULL')
				FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = ? ORDER BY c.external_id
				""", String.class, SLUG))
			.containsExactly("text-1|NULL|NULL", "text-2|NULL|NULL",
					"text-3|https://cards.example/t3.png|https://cards.example/t3-small.png");
	}

	@Test
	void importingTheSameTextCardsAgainChangesNothing() {
		ImportReport again = this.importer.importDataset(textGame(true), "test");

		assertThat(again.newCards()).isZero();
		assertThat(again.updatedCards()).isZero();
		assertThat(again.unchangedCards()).isEqualTo(3);
	}

	@Test
	void theApiServesATextCardWithANullImage() throws Exception {
		Long setId = this.jdbc.queryForObject(
				"SELECT s.id FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = ? AND s.code = 'words'",
				Long.class, SLUG);

		this.mockMvc.perform(get("/api/tcg/cards").param("set", setId.toString()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].externalId").value("text-1"))
			.andExpect(jsonPath("$[0]", hasKey("imageUrl")))
			.andExpect(jsonPath("$[0].imageUrl").value(nullValue()))
			.andExpect(jsonPath("$[0].thumbnailUrl").value(nullValue()))
			.andExpect(jsonPath("$[0].metadata.attribute").value("EARTH"))
			.andExpect(jsonPath("$[2].imageUrl").value("https://cards.example/t3.png"));
	}

	@Test
	void aTextCardCanBeOpenedAndCollectedLikeAnyOther() throws Exception {
		Long packId = this.jdbc.queryForObject(
				"SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id "
						+ "WHERE g.slug = ? AND p.code = 'text-only'",
				Long.class, SLUG);
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", packId).session(session))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.opening.cards[0].card.externalId").value("text-1"))
			.andExpect(jsonPath("$.opening.cards[0].card.imageUrl").value(nullValue()));
		this.mockMvc.perform(get("/api/tcg/collection").session(session).param("game", SLUG))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.cards[0].card.externalId").value("text-1"))
			.andExpect(jsonPath("$.cards[0].card.imageUrl").value(nullValue()))
			.andExpect(jsonPath("$.cards[0].quantity").value(1));
	}

	@Test
	void aGameThatDoesNotSaySoCannotHaveCardsWithoutImages() {
		String slug = "text-cards-refused";
		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> this.importer.importDataset(dataset(slug, false), "test"))
			.satisfies((ex) -> assertThat(ex.getProblems()).containsExactlyInAnyOrder(
					"set 'words' card 'text-1' has no image", "set 'words' card 'text-2' has no image"));

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_games WHERE slug = ?", Integer.class, slug))
			.isZero();
	}

	@Test
	void aThumbnailWithoutAnImageIsRefused() {
		TcgDataset thumbnailOnly = new TcgDataset(new Game("text-cards-thumb", "Thumb", "", null, null, null, null, true),
				RARITIES, List.of(new CardSet("words", "Words", "", null, null,
						List.of(new Card("thumb-1", "1", "Thumb", "common", null, "https://cards.example/small.png",
								Map.of())),
						List.of())));

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> this.importer.importDataset(thumbnailOnly, "test"))
			.satisfies((ex) -> assertThat(ex.getProblems())
				.containsExactly("set 'words' card 'thumb-1' has a thumbnail but no image"));
	}

	@Test
	void theRealSourcesStillNeedAnImageForEveryCard() {
		JsonMapper json = JsonMapper.builder().build();
		for (String file : List.of("tcg/sources/pokemon.json", "tcg/sources/one-piece.json")) {
			SourceConfig config = SourceConfig.load(new ClassPathResource(file), json);
			assertThat(config.datasetGame("https://cards.example/cover.png").cardImagesOptional()).as(file).isFalse();
		}
		// A dataset file that does not mention it needs images too.
		assertThat(new Game("x", "X", "", null, null).cardImagesOptional()).isFalse();
		assertThat(new Game("x", "X", "", null, null, null, null, null).cardImagesOptional()).isFalse();
	}

	private static TcgDataset textGame(boolean imagesOptional) {
		return dataset(SLUG, imagesOptional);
	}

	private static TcgDataset dataset(String slug, boolean imagesOptional) {
		List<Card> cards = List.of(new Card("text-1", "1", "Ars Magna the Finite and the Infinite", "common", null, null, MONSTER),
				// A blank image is no image.
				new Card("text-2", "2", "Two", "common", "  ", " ", Map.of()),
				new Card("text-3", "3", "Three", "common", "https://cards.example/t3.png",
						"https://cards.example/t3-small.png", Map.of()));
		Pack textOnly = new Pack("text-only", "Text Only", "", null, List.of(new Slot(1, Map.of("common", 1))),
				List.of("text-1"));
		return new TcgDataset(new Game(slug, "Text Cards", "", null, null, null, null, imagesOptional), RARITIES,
				List.of(new CardSet("words", "Words", "", null, null, cards, List.of(textOnly))));
	}

}
