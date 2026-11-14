package com.cyan.arcade.tcg.dataimport.yugioh;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.shop.ShopService;
import com.cyan.arcade.tcg.dataimport.InvalidDatasetException;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Full pilot through the shared opening architecture. Only Testcontainers PostgreSQL, migrated through V38. */
@IntegrationTest
class YugiohPackOpeningTests {

	@Autowired private TcgDatasetImporter importer;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private MockMvc mvc;
	@Autowired private ShopService shop;

	private final String slug = "ygo8-" + UUID.randomUUID().toString().substring(0, 8);
	private final TcgDataset dataset = YugiohPackFixture.dataset(this.slug);
	private Long packId;

	@AfterEach
	void hidePilot() {
		this.jdbc.update("UPDATE tcg_games SET active = FALSE WHERE slug = ?", this.slug);
		if (this.packId != null) this.jdbc.update("UPDATE tcg_packs SET active = FALSE WHERE id = ?", this.packId);
	}

	@Test
	void dryRunImportReimportAndMissingPoolValidationPreserveCatalogAndCollections() {
		List<String> before = snapshot();
		List<String> otherGames = neighbours();
		var dry = this.importer.importDataset(this.dataset, "full pilot fixture", true);
		assertThat(dry.cards()).isEqualTo(127);
		assertThat(dry.packs()).isEqualTo(1);
		assertThat(snapshot()).isEqualTo(before);
		importPilot();
		assertThat(neighbours()).isEqualTo(otherGames);
		assertThat(this.jdbc.queryForObject("SELECT max(version::int) FROM flyway_schema_history WHERE success", Integer.class))
			.isEqualTo(38);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_pack_cards WHERE pack_id = ?", Integer.class, this.packId))
			.isEqualTo(127);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_pack_slot_odds WHERE pack_id = ?", Integer.class, this.packId))
			.isEqualTo(45);
		List<String> imported = snapshot();
		var again = this.importer.importDataset(this.dataset, "again");
		assertThat(again.unchangedCards()).isEqualTo(127);
		assertThat(List.of(again.newCards(), again.updatedCards(), again.newPacks(), again.updatedPacks())).containsOnly(0);
		assertThat(snapshot()).isEqualTo(imported);

		var set = this.dataset.sets().getFirst();
		var missing = new TcgDataset(this.dataset.game(), this.dataset.rarities(), List.of(new TcgDataset.CardSet(
				set.code(), null, set.name(), "", null, null, null, set.releasedOn(),
				set.cards().stream().filter((card) -> !card.rarity().equals("starlight-rare")).toList(), set.packs())));
		assertThatExceptionOfType(InvalidDatasetException.class).isThrownBy(() -> this.importer.importDataset(missing, "missing pool"))
			.withMessageContaining("starlight-rare");
		assertThat(snapshot()).isEqualTo(imported);
	}

	@Test
	void bothGameAndPackNeedExplicitActivationAndImportsPreserveThatDecision() throws Exception {
		importPilot();
		MockHttpSession player = Players.register(this.mvc);
		this.mvc.perform(get("/api/tcg/games")).andExpect(jsonPath("$[*].slug", not(hasItem(this.slug))));
		this.mvc.perform(get("/api/tcg/packs/{id}", this.packId)).andExpect(status().isNotFound());
		open(player, UUID.randomUUID()).andExpect(status().isConflict());
		this.jdbc.update("UPDATE tcg_games SET active = TRUE WHERE slug = ?", this.slug);
		this.mvc.perform(get("/api/tcg/packs/{id}", this.packId)).andExpect(status().isNotFound());
		open(player, UUID.randomUUID()).andExpect(status().isConflict());
		this.jdbc.update("UPDATE tcg_packs SET active = TRUE WHERE id = ?", this.packId);
		this.importer.importDataset(this.dataset, "preserve explicit activation");
		this.mvc.perform(get("/api/tcg/packs/{id}", this.packId)).andExpect(status().isOk())
			.andExpect(jsonPath("$.cardsPerPack").value(9)).andExpect(jsonPath("$.poolSize").value(127))
			.andExpect(jsonPath("$.slots.length()").value(9)).andExpect(jsonPath("$.imageUrl").value(nullValue()))
			.andExpect(jsonPath("$.slots[0].odds[?(@.rarity.code == 'starlight-rare')].percent", hasItem(0.01)))
			.andExpect(jsonPath("$.slots[0].odds[?(@.rarity.code == 'secret-rare')].percent", hasItem(0.99)))
			.andExpect(jsonPath("$.oddsNote").value(this.dataset.sets().getFirst().packs().getFirst().oddsNote()));
		this.jdbc.update("UPDATE tcg_games SET active = FALSE WHERE slug = ?", this.slug);
		open(player, UUID.randomUUID()).andExpect(status().isConflict());
	}

	@Test
	void nineCardsAreCollectedAndRecordedOnceAndPurchasedExtrasFollowTheSharedAllowance() throws Exception {
		activate();
		MockHttpSession player = Players.register(this.mvc);
		Long userId = Players.userId(this.mvc, player);
		List<String> otherGames = neighbours();
		for (int index = 0; index < 5; index++) {
			UUID key = UUID.randomUUID();
			String first = open(player, key).andExpect(status().isCreated()).andExpect(jsonPath("$.opening.cards.length()").value(9))
				.andReturn().getResponse().getContentAsString();
			String replay = open(player, key).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
			assertThat(JsonPath.<Object>read(replay, "$" )).isEqualTo(JsonPath.<Object>read(first, "$"));
			List<Number> ids = JsonPath.read(first, "$.opening.cards[*].card.id");
			assertThat(ids).hasSize(9).doesNotHaveDuplicates();
			List<Long> pool = this.jdbc.queryForList("SELECT card_id FROM tcg_pack_cards WHERE pack_id = ?", Long.class, this.packId);
			assertThat(ids.stream().map(Number::longValue)).allMatch(pool::contains);
		}
		open(player, UUID.randomUUID()).andExpect(status().isTooManyRequests());
		this.mvc.perform(get("/api/tcg/collection").session(player)).andExpect(jsonPath("$.summary.totalCards").value(45));
		this.mvc.perform(get("/api/tcg/openings").session(player)).andExpect(jsonPath("$.totalEntries").value(5))
			.andExpect(jsonPath("$.entries[0].cards.length()").value(9));

		Long itemId = this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = 'EXTRA_PACK'", Long.class);
		int price = this.jdbc.queryForObject("SELECT price FROM shop_items WHERE id = ?", Integer.class, itemId);
		Players.grantCoins(this.mvc, userId, price);
		this.mvc.perform(post("/api/shop/purchases").session(player).contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId, UUID.randomUUID())))
			.andExpect(status().isCreated());
		UUID bonusKey = UUID.randomUUID();
		open(player, bonusKey).andExpect(status().isCreated()).andExpect(jsonPath("$.allowance.bonusPacks").value(0));
		open(player, bonusKey).andExpect(status().isCreated());
		open(player, UUID.randomUUID()).andExpect(status().isTooManyRequests());
		this.mvc.perform(get("/api/tcg/collection").session(player)).andExpect(jsonPath("$.summary.totalCards").value(54));
		this.mvc.perform(get("/api/tcg/openings").session(player)).andExpect(jsonPath("$.totalEntries").value(6));
		assertThat(this.jdbc.queryForObject("""
			SELECT count(*) FROM tcg_pack_opening_cards oc JOIN tcg_pack_openings o ON o.id = oc.opening_id
			JOIN tcg_cards c ON c.id = oc.card_id
			LEFT JOIN tcg_pack_cards pc ON pc.pack_id = o.pack_id AND pc.card_id = c.id
			LEFT JOIN tcg_pack_slot_odds odds ON odds.pack_id = o.pack_id AND odds.slot = oc.position AND odds.rarity_id = c.rarity_id
			WHERE o.user_id = ? AND (pc.card_id IS NULL OR odds.rarity_id IS NULL)
			""", Integer.class, userId)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT sum(quantity) FROM tcg_user_cards WHERE user_id = ?", Long.class, userId)).isEqualTo(54L);
		assertThat(this.jdbc.queryForObject("""
			SELECT count(*) FROM (SELECT uc.card_id, uc.quantity, count(oc.*) AS pulled FROM tcg_user_cards uc
			JOIN tcg_pack_openings o ON o.user_id = uc.user_id JOIN tcg_pack_opening_cards oc ON oc.opening_id = o.id AND oc.card_id = uc.card_id
			WHERE uc.user_id = ? GROUP BY uc.card_id, uc.quantity HAVING uc.quantity <> count(oc.*)) mismatches
			""", Integer.class, userId)).isZero();
		this.importer.importDataset(this.dataset, "after collecting");
		this.mvc.perform(get("/api/tcg/collection").session(player)).andExpect(jsonPath("$.summary.totalCards").value(54));
		assertThat(neighbours()).isEqualTo(otherGames);
	}

	@Test
	void adminOpensBeyondTheLimitWithoutConsumingInventory() throws Exception {
		activate();
		MockHttpSession admin = Players.signInAsAdmin(this.mvc);
		Long userId = Players.userId(this.mvc, admin);
		this.shop.give(userId, "EXTRA_PACK", 1);
		int inventory = this.shop.inventoryOf(userId).bonusPacks();
		for (int index = 0; index < 7; index++) {
			open(admin, UUID.randomUUID()).andExpect(status().isCreated())
				.andExpect(jsonPath("$.opening.cards.length()").value(9))
				.andExpect(jsonPath("$.allowance.dailyLimit").value(nullValue()))
				.andExpect(jsonPath("$.allowance.leftToday").value(nullValue()));
		}
		assertThat(this.shop.inventoryOf(userId).bonusPacks()).isEqualTo(inventory);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_pack_openings WHERE user_id = ? AND pack_id = ?", Integer.class, userId, this.packId))
			.isEqualTo(7);
	}

	@Test
	void failureAfterCollectingRollsBackOpeningInventoryCollectionAndReplayThenRetrySucceeds() throws Exception {
		activate();
		MockHttpSession player = Players.register(this.mvc);
		Long userId = Players.userId(this.mvc, player);
		for (int i = 0; i < 5; i++) open(player, UUID.randomUUID()).andExpect(status().isCreated());
		this.shop.give(userId, "EXTRA_PACK", 1);
		List<String> before = snapshot();
		UUID key = UUID.randomUUID();
		this.jdbc.execute("""
			CREATE FUNCTION ygo8_fail_replay() RETURNS trigger AS $$ BEGIN
			IF NEW.user_id = %d THEN RAISE EXCEPTION 'pilot replay failure'; END IF;
			RETURN NEW; END $$ LANGUAGE plpgsql
			""".formatted(userId));
		this.jdbc.execute("CREATE TRIGGER ygo8_fail_replay BEFORE INSERT ON tcg_pack_opening_requests FOR EACH ROW EXECUTE FUNCTION ygo8_fail_replay()");
		try {
			open(player, key).andExpect(status().isInternalServerError());
		}
		finally {
			this.jdbc.execute("DROP TRIGGER ygo8_fail_replay ON tcg_pack_opening_requests");
			this.jdbc.execute("DROP FUNCTION ygo8_fail_replay()");
		}
		assertThat(snapshot()).isEqualTo(before);
		open(player, key).andExpect(status().isCreated());
		open(player, key).andExpect(status().isCreated());
		this.mvc.perform(get("/api/tcg/collection").session(player)).andExpect(jsonPath("$.summary.totalCards").value(54));
		this.mvc.perform(get("/api/tcg/allowance").session(player)).andExpect(jsonPath("$.openedToday").value(6))
			.andExpect(jsonPath("$.bonusPacks").value(0));
	}

	private void importPilot() {
		this.importer.importDataset(this.dataset, "full pilot fixture");
		this.packId = this.jdbc.queryForObject("SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = ?", Long.class, this.slug);
	}

	private void activate() {
		importPilot();
		this.jdbc.update("UPDATE tcg_games SET active = TRUE WHERE slug = ?", this.slug);
		this.jdbc.update("UPDATE tcg_packs SET active = TRUE WHERE id = ?", this.packId);
	}

	private ResultActions open(MockHttpSession session, UUID key) throws Exception {
		return this.mvc.perform(post("/api/tcg/packs/{id}/open", this.packId).session(session).header("Idempotency-Key", key.toString()));
	}

	private List<String> snapshot() {
		List<String> rows = new ArrayList<>();
		for (String table : List.of("tcg_games", "tcg_rarities", "tcg_sets", "tcg_cards", "tcg_packs", "tcg_pack_cards", "tcg_pack_slot_odds",
				"tcg_user_cards", "tcg_pack_openings", "tcg_pack_opening_cards", "tcg_pack_opening_requests", "shop_items", "user_inventory", "purchases", "coin_transactions", "user_wallets")) {
			rows.addAll(this.jdbc.queryForList("SELECT '" + table + "|' || to_jsonb(t)::text FROM " + table + " t ORDER BY to_jsonb(t)::text", String.class));
		}
		return rows;
	}

	private List<String> neighbours() {
		return this.jdbc.queryForList("""
			SELECT to_jsonb(g)::text || to_jsonb(s)::text || to_jsonb(c)::text || coalesce(to_jsonb(p)::text, '') ||
			coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM tcg_rarities r WHERE r.game_id = g.id), '') ||
			coalesce((SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.card_id)::text FROM tcg_pack_cards pc WHERE pc.pack_id = p.id), '') ||
			coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.slot, o.rarity_id)::text FROM tcg_pack_slot_odds o WHERE o.pack_id = p.id), '')
			FROM tcg_games g JOIN tcg_sets s ON s.game_id = g.id JOIN tcg_cards c ON c.set_id = s.id
			LEFT JOIN tcg_packs p ON p.set_id = s.id WHERE g.slug <> ? ORDER BY g.id, s.id, c.id, p.id
			""", String.class, this.slug);
	}
}
