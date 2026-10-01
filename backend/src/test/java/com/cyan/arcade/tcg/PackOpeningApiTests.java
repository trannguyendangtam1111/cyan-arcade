package com.cyan.arcade.tcg;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.in;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.oneOf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Opening packs end to end, against {@link TinyCardGame}: what comes out, that it is recorded and
 * collected in one transaction, and that nobody but the server has a say in it.
 *
 * <p>The test context allows five packs a day, so the limit is within reach of a test.
 */
@IntegrationTest
class PackOpeningApiTests {

	private static final int DAILY_LIMIT = 5;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	private Long booster;

	private Long single;

	@BeforeEach
	void importTinyGame() {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		this.booster = TinyCardGame.packId(this.jdbc, "booster");
		this.single = TinyCardGame.packId(this.jdbc, "single");
	}

	// --- What comes out --------------------------------------------------------------------------

	@Test
	void aPackGivesOneCardPerSlotFromItsPoolWithTheSlotsRarity() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		open(session, this.booster).andExpect(status().isCreated())
			.andExpect(jsonPath("$.opening.id").isNumber())
			.andExpect(jsonPath("$.opening.openedAt").isNotEmpty())
			.andExpect(jsonPath("$.opening.pack.id").value(this.booster))
			.andExpect(jsonPath("$.opening.pack.name").value("Booster"))
			.andExpect(jsonPath("$.opening.pack.set.code").value("base"))
			.andExpect(jsonPath("$.opening.pack.game.slug").value(TinyCardGame.SLUG))
			.andExpect(jsonPath("$.opening.cards", hasSize(3)))
			.andExpect(jsonPath("$.opening.cards[*].position", contains(1, 2, 3)))
			// Two commons, then the rare slot.
			.andExpect(jsonPath("$.opening.cards[0].card.rarity.code").value("common"))
			.andExpect(jsonPath("$.opening.cards[1].card.rarity.code").value("common"))
			.andExpect(jsonPath("$.opening.cards[2].card.rarity.code", is(oneOf("rare", "legendary"))))
			.andExpect(jsonPath("$.opening.cards[0].card.number", is(in(List.of("C1", "C2", "C3")))))
			.andExpect(jsonPath("$.opening.cards[2].card.number", is(in(List.of("R1", "R2", "L1")))))
			// A full card comes back, ready to be shown.
			.andExpect(jsonPath("$.opening.cards[0].card.id").isNumber())
			.andExpect(jsonPath("$.opening.cards[0].card.name").isNotEmpty())
			.andExpect(jsonPath("$.opening.cards[0].card.imageUrl").isNotEmpty())
			.andExpect(jsonPath("$.opening.cards[0].card.set.code").value("base"))
			.andExpect(jsonPath("$.opening.cards[0].card.metadata.power").value(2))
			.andExpect(jsonPath("$.opening.cards[0].isNew").value(true))
			.andExpect(jsonPath("$.opening.cards[0].new").doesNotExist())
			.andExpect(jsonPath("$.allowance.dailyLimit").value(DAILY_LIMIT))
			.andExpect(jsonPath("$.allowance.openedToday").value(1))
			.andExpect(jsonPath("$.allowance.leftToday").value(DAILY_LIMIT - 1))
			.andExpect(jsonPath("$.allowance.resetsAt").isNotEmpty());
	}

	@Test
	void theTwoCommonsOfABoosterAreNeverTheSameCard() throws Exception {
		for (int player = 0; player < 4; player++) {
			MockHttpSession session = Players.register(this.mockMvc);
			for (int pack = 0; pack < DAILY_LIMIT; pack++) {
				String body = open(session, this.booster).andReturn().getResponse().getContentAsString();
				List<String> numbers = JsonPath.read(body, "$.opening.cards[*].card.number");
				assertThat(numbers.get(0)).isNotEqualTo(numbers.get(1));
			}
		}
	}

	// --- Collection and duplicates ---------------------------------------------------------------

	@Test
	void pulledCardsGoIntoTheCollection() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		String body = open(session, this.booster).andReturn().getResponse().getContentAsString();
		List<String> pulled = JsonPath.read(body, "$.opening.cards[*].card.number");

		collection(session).andExpect(jsonPath("$.summary.uniqueCards").value(3))
			.andExpect(jsonPath("$.summary.totalCards").value(3))
			.andExpect(jsonPath("$.cards[*].quantity", contains(1, 1, 1)))
			.andExpect(jsonPath("$.cards[*].card.number", org.hamcrest.Matchers.containsInAnyOrder(pulled.toArray())));
	}

	@Test
	void aCardPulledAgainIsADuplicateAndRaisesTheQuantity() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		open(session, this.single).andExpect(jsonPath("$.opening.cards[0].card.number").value("C1"))
			.andExpect(jsonPath("$.opening.cards[0].isNew").value(true));
		open(session, this.single).andExpect(jsonPath("$.opening.cards[0].card.number").value("C1"))
			.andExpect(jsonPath("$.opening.cards[0].isNew").value(false));
		open(session, this.single).andExpect(jsonPath("$.opening.cards[0].isNew").value(false));

		collection(session).andExpect(jsonPath("$.summary.uniqueCards").value(1))
			.andExpect(jsonPath("$.summary.totalCards").value(3))
			.andExpect(jsonPath("$.cards", hasSize(1)))
			.andExpect(jsonPath("$.cards[0].card.number").value("C1"))
			.andExpect(jsonPath("$.cards[0].quantity").value(3))
			.andExpect(jsonPath("$.cards[0].firstObtainedAt").isNotEmpty())
			.andExpect(jsonPath("$.cards[0].lastObtainedAt").isNotEmpty());
	}

	// --- Who decides -----------------------------------------------------------------------------

	@Test
	void theServerDecidesTheCardsWhateverTheClientSends() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long legendary = TinyCardGame.cardId(this.jdbc, "L1");

		// A client that asks for the legendary by every name it can think of still gets what the pack holds.
		this.mockMvc
			.perform(post("/api/tcg/packs/{id}/open", this.single).session(session)
				.param("cardId", legendary.toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"cardId\":%d,\"cardIds\":[%d],\"cards\":[{\"id\":%d}],\"rarity\":\"legendary\"}"
					.formatted(legendary, legendary, legendary)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.opening.cards", hasSize(1)))
			.andExpect(jsonPath("$.opening.cards[0].card.number").value("C1"));

		collection(session).andExpect(jsonPath("$.cards[*].card.number", contains("C1")));
	}

	@Test
	void thereIsNoWayToPutACardIntoACollectionDirectly() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		String claim = "{\"cardId\":%d,\"quantity\":99}".formatted(TinyCardGame.cardId(this.jdbc, "L1"));

		this.mockMvc
			.perform(post("/api/tcg/collection").session(session).contentType(MediaType.APPLICATION_JSON).content(claim))
			.andExpect(status().isMethodNotAllowed());
		this.mockMvc
			.perform(put("/api/tcg/collection").session(session).contentType(MediaType.APPLICATION_JSON).content(claim))
			.andExpect(status().isMethodNotAllowed());
		this.mockMvc
			.perform(post("/api/tcg/openings").session(session).contentType(MediaType.APPLICATION_JSON).content(claim))
			.andExpect(status().isMethodNotAllowed());

		collection(session).andExpect(jsonPath("$.summary.totalCards").value(0));
	}

	@Test
	void openingAPackNeedsASignedInPlayer() throws Exception {
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", this.single))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
		for (String path : List.of("/api/tcg/collection", "/api/tcg/openings", "/api/tcg/allowance")) {
			this.mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void openingAPackNeedsTheCsrfToken() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", this.single).session(session).with(csrf().useInvalidToken()))
			.andExpect(status().isForbidden());

		history(session).andExpect(jsonPath("$.totalEntries").value(0));
	}

	@Test
	void aPackThatDoesNotExistOrWasWithdrawnCannotBeOpened() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long retired = TinyCardGame.packId(this.jdbc, "retired");
		this.jdbc.update("UPDATE tcg_packs SET active = FALSE WHERE id = ?", retired);

		open(session, 999_999L).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
		open(session, retired).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PACK_NOT_AVAILABLE"));

		history(session).andExpect(jsonPath("$.totalEntries").value(0));
		allowance(session).andExpect(jsonPath("$.openedToday").value(0));
	}

	@Test
	void aPackWithAnEmptyPoolCannotBeOpenedAndCostsNothing() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long broken = TinyCardGame.packId(this.jdbc, "broken");
		this.jdbc.update("DELETE FROM tcg_pack_cards WHERE pack_id = ?", broken);

		open(session, broken).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PACK_NOT_AVAILABLE"));

		allowance(session).andExpect(jsonPath("$.openedToday").value(0));
	}

	// --- History ---------------------------------------------------------------------------------

	@Test
	void openedPacksAreListedNewestFirstWithWhatTheyGave() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		open(session, this.single);
		open(session, this.single);
		open(session, this.booster);

		history(session).andExpect(status().isOk())
			.andExpect(jsonPath("$.totalEntries").value(3))
			.andExpect(jsonPath("$.totalPages").value(1))
			.andExpect(jsonPath("$.entries[*].pack.code", contains("booster", "single", "single")))
			.andExpect(jsonPath("$.entries[0].id").isNumber())
			.andExpect(jsonPath("$.entries[0].openedAt").isNotEmpty())
			.andExpect(jsonPath("$.entries[0].pack.name").value("Booster"))
			.andExpect(jsonPath("$.entries[0].pack.imageUrl").value("/tiny/booster.svg"))
			.andExpect(jsonPath("$.entries[0].cards[*].position", contains(1, 2, 3)))
			.andExpect(jsonPath("$.entries[0].cards[2].card.rarity.code", is(oneOf("rare", "legendary"))))
			// The second "single" pack gave a card the player already had; the first gave a new one.
			.andExpect(jsonPath("$.entries[1].cards[0].card.number").value("C1"))
			.andExpect(jsonPath("$.entries[1].cards[0].isNew").value(false))
			.andExpect(jsonPath("$.entries[2].cards[0].isNew").value(true));

		this.mockMvc.perform(get("/api/tcg/openings").session(session).param("size", "2").param("page", "1"))
			.andExpect(jsonPath("$.totalPages").value(2))
			.andExpect(jsonPath("$.entries", hasSize(1)))
			.andExpect(jsonPath("$.entries[0].cards[0].isNew").value(true));
		this.mockMvc.perform(get("/api/tcg/openings").session(session).param("size", "0"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void theHistoryMatchesWhatTheOpeningReturned() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		String opened = open(session, this.booster).andReturn().getResponse().getContentAsString();
		List<Integer> cardIds = JsonPath.read(opened, "$.opening.cards[*].card.id");

		history(session).andExpect(jsonPath("$.entries[0].id").value(JsonPath.<Integer>read(opened, "$.opening.id")))
			.andExpect(jsonPath("$.entries[0].cards[*].card.id", contains(cardIds.toArray())));
	}

	@Test
	void everyPlayerHasTheirOwnHistoryAndCollection() throws Exception {
		MockHttpSession first = Players.register(this.mockMvc);
		MockHttpSession second = Players.register(this.mockMvc);
		open(first, this.single);

		history(second).andExpect(jsonPath("$.totalEntries").value(0)).andExpect(jsonPath("$.entries").isEmpty());
		collection(second).andExpect(jsonPath("$.summary.totalCards").value(0));
		allowance(second).andExpect(jsonPath("$.openedToday").value(0));
		history(first).andExpect(jsonPath("$.totalEntries").value(1));
	}

	// --- The daily limit -------------------------------------------------------------------------

	@Test
	void theDailyLimitStopsFurtherPacksUntilTomorrow() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		allowance(session).andExpect(jsonPath("$.dailyLimit").value(DAILY_LIMIT))
			.andExpect(jsonPath("$.leftToday").value(DAILY_LIMIT));
		for (int pack = 0; pack < DAILY_LIMIT; pack++) {
			open(session, this.single).andExpect(status().isCreated());
		}

		open(session, this.single).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("DAILY_PACK_LIMIT_REACHED"));

		allowance(session).andExpect(jsonPath("$.openedToday").value(DAILY_LIMIT))
			.andExpect(jsonPath("$.leftToday").value(0));
		// The refused pack gave nothing.
		collection(session).andExpect(jsonPath("$.cards[0].quantity").value(DAILY_LIMIT));

		// A new day: the same openings, moved to yesterday, no longer count.
		this.jdbc.update("UPDATE tcg_pack_openings SET opened_at = ? WHERE user_id = ?",
				OffsetDateTime.now().minusDays(1), userId(session));
		allowance(session).andExpect(jsonPath("$.leftToday").value(DAILY_LIMIT));
		open(session, this.single).andExpect(status().isCreated());
	}

	// --- Transactions ----------------------------------------------------------------------------

	@Test
	void whenSavingFailsHalfwayNothingOfTheOpeningIsKept() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long userId = userId(session);
		// Let the first card of a pack reach the collection and make the second one fail.
		this.jdbc.execute("""
				CREATE FUNCTION tcg_test_fail_second_card() RETURNS trigger AS $$
				BEGIN
				    IF NEW.user_id = %d AND EXISTS (SELECT 1 FROM tcg_user_cards WHERE user_id = NEW.user_id) THEN
				        RAISE EXCEPTION 'the collection is on fire';
				    END IF;
				    RETURN NEW;
				END $$ LANGUAGE plpgsql
				""".formatted(userId));
		this.jdbc.execute("""
				CREATE TRIGGER tcg_test_fail_second_card BEFORE INSERT ON tcg_user_cards
				FOR EACH ROW EXECUTE FUNCTION tcg_test_fail_second_card()
				""");
		try {
			open(session, this.booster).andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
		}
		finally {
			this.jdbc.execute("DROP TRIGGER tcg_test_fail_second_card ON tcg_user_cards");
			this.jdbc.execute("DROP FUNCTION tcg_test_fail_second_card()");
		}

		// No opening, no cards of an opening, and not even the first card in the collection.
		assertThat(count("tcg_pack_openings WHERE user_id = ?", userId)).isZero();
		assertThat(count("tcg_user_cards WHERE user_id = ?", userId)).isZero();
		history(session).andExpect(jsonPath("$.totalEntries").value(0));
		allowance(session).andExpect(jsonPath("$.openedToday").value(0));

		// And the player can simply try again.
		open(session, this.booster).andExpect(status().isCreated());
		assertThat(count("tcg_user_cards WHERE user_id = ?", userId)).isEqualTo(3);
	}

	@Test
	void packsOpenedAtTheSameMomentNeitherLoseCardsNorPassTheLimit() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long userId = userId(session);
		int attempts = DAILY_LIMIT * 3;

		List<Integer> statuses = new ArrayList<>();
		try (ExecutorService pool = Executors.newFixedThreadPool(attempts)) {
			List<Callable<Integer>> openings = new ArrayList<>();
			for (int attempt = 0; attempt < attempts; attempt++) {
				openings.add(() -> open(session, this.single).andReturn().getResponse().getStatus());
			}
			for (Future<Integer> result : pool.invokeAll(openings)) {
				statuses.add(result.get());
			}
		}

		assertThat(statuses).filteredOn((status) -> status == 201).hasSize(DAILY_LIMIT);
		assertThat(statuses).filteredOn((status) -> status == 429).hasSize(attempts - DAILY_LIMIT);
		// Exactly one copy per successful pack: none lost to a race, none given for a refused pack.
		assertThat(count("tcg_pack_openings WHERE user_id = ?", userId)).isEqualTo(DAILY_LIMIT);
		assertThat(this.jdbc.queryForObject("SELECT quantity FROM tcg_user_cards WHERE user_id = ?", Integer.class,
				userId))
			.isEqualTo(DAILY_LIMIT);
	}

	private ResultActions open(MockHttpSession session, Long packId) throws Exception {
		return this.mockMvc.perform(post("/api/tcg/packs/{id}/open", packId).session(session));
	}

	private ResultActions collection(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/tcg/collection").session(session).param("game", TinyCardGame.SLUG));
	}

	private ResultActions history(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/tcg/openings").session(session));
	}

	private ResultActions allowance(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/tcg/allowance").session(session));
	}

	private Long userId(MockHttpSession session) throws Exception {
		String body = this.mockMvc.perform(get("/api/auth/session").session(session))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.<Number>read(body, "$.user.id").longValue();
	}

	private int count(String tableAndCondition, Object... arguments) {
		return this.jdbc.queryForObject("SELECT count(*) FROM " + tableAndCondition, Integer.class, arguments);
	}

}
