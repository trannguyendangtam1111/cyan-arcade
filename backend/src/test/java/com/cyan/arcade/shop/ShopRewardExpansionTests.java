package com.cyan.arcade.shop;

import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.progression.Levels;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The shop as a progression loop: categories, what a player can afford, owns and wears, profile
 * frames shown on the public profile, consumable packs, inactive items, a purchase that fails half
 * way, and the coin history that explains every reward and purchase.
 */
@IntegrationTest
class ShopRewardExpansionTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	// --- Categories ----------------------------------------------------------------------------------

	@Test
	void theCatalogCanBeNarrowedToOneCategory() throws Exception {
		this.mockMvc.perform(get("/api/shop/items").param("type", "COSMETIC"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].type", everyItem(org.hamcrest.Matchers.is("COSMETIC"))))
			.andExpect(jsonPath("$.items[*].code",
					hasItems("FRAME_BUBBLEGUM", "FRAME_OCEAN", "FRAME_RAINBOW", "FRAME_GOLD")));
		this.mockMvc.perform(get("/api/shop/items").param("type", "BADGE"))
			.andExpect(jsonPath("$.items[*].type", everyItem(org.hamcrest.Matchers.is("BADGE"))))
			.andExpect(jsonPath("$.items[*].code", hasItems("BADGE_GOLD_COIN", "BADGE_CROWN")));
		this.mockMvc.perform(get("/api/shop/items").param("type", "DRAGON")).andExpect(status().isBadRequest());
	}

	@Test
	void aGuestSeesWhatEachItemIsButNothingPersonal() throws Exception {
		this.mockMvc.perform(get("/api/shop/items"))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].consumable").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].equippable").value(false))
			.andExpect(jsonPath("$.items[?(@.code == 'FRAME_OCEAN')].equippable").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'FRAME_OCEAN')].consumable").value(false))
			.andExpect(jsonPath("$.items[0].equipped").value(nullValue()))
			.andExpect(jsonPath("$.items[0].affordable").value(nullValue()));
	}

	// --- What a player can afford, owns and wears -----------------------------------------------------

	@Test
	void aPlayerSeesWhatTheyCanAffordOwnAndWear() throws Exception {
		MockHttpSession session = playerWith(700);
		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].affordable").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'TITLE_HIGH_ROLLER')].affordable").value(false))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].equipped").value(false));

		// The first badge is worn straight away, and the purchase says so.
		buy(session, "BADGE_GOLD_COIN").andExpect(status().isCreated())
			.andExpect(jsonPath("$.item.owned").value(1))
			.andExpect(jsonPath("$.item.equipped").value(true))
			.andExpect(jsonPath("$.item.soldOut").value(true))
			.andExpect(jsonPath("$.balance").value(200));

		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.balance").value(200))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].soldOut").value(true))
			// 200 coins left: an Extra Pack (100) still, the Bubblegum Frame (300) no longer.
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].affordable").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'FRAME_BUBBLEGUM')].affordable").value(false));
	}

	@Test
	void aFrameIsWornAroundTheAvatarAndShownOnThePublicProfile() throws Exception {
		MockHttpSession session = playerWith(1000);
		String username = username(session);
		raiseToLevel(session, 2);

		buy(session, "FRAME_BUBBLEGUM").andExpect(status().isCreated());
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.cosmetic.code").value("FRAME_BUBBLEGUM"))
			.andExpect(jsonPath("$.cosmetic.icon").value("frame-bubblegum"));

		// A second frame does not replace the one worn until the player chooses it.
		buy(session, "FRAME_OCEAN").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(false));
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("FRAME_OCEAN")).session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.code == 'FRAME_OCEAN')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'FRAME_BUBBLEGUM')].equipped").value(false));

		// Anyone sees what is worn, and nothing else the player owns.
		this.mockMvc.perform(get("/api/users/{username}/profile", username))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.cosmetic.code").value("FRAME_OCEAN"))
			.andExpect(jsonPath("$.cosmetic.name").value("Ocean Frame"))
			.andExpect(content().string(not(org.hamcrest.Matchers.containsString("FRAME_BUBBLEGUM"))))
			.andExpect(content().string(not(org.hamcrest.Matchers.containsString("inventory"))));

		this.mockMvc.perform(delete("/api/users/me/inventory/{id}/equipped", itemId("FRAME_OCEAN")).session(session))
			.andExpect(status().isOk());
		this.mockMvc.perform(get("/api/users/{username}/profile", username))
			.andExpect(jsonPath("$.cosmetic").value(nullValue()));
	}

	@Test
	void aFrameTheyDoNotOwnCannotBeWorn() throws Exception {
		MockHttpSession session = playerWith(0);
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("FRAME_GOLD")).session(session))
			.andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(jsonPath("$.cosmetic").value(nullValue()));
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("FRAME_GOLD")))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void aFrameIsOwnedOnceAndAReplayedRequestChargesOnce() throws Exception {
		MockHttpSession session = playerWith(1000);
		Long userId = Players.userId(this.mockMvc, session);
		UUID requestId = UUID.randomUUID();

		buy(session, itemId("FRAME_BUBBLEGUM"), requestId).andExpect(status().isCreated())
			.andExpect(jsonPath("$.repeated").value(false));
		// The same request again (a retry, a double click) is the same purchase, not "already owned".
		buy(session, itemId("FRAME_BUBBLEGUM"), requestId).andExpect(status().isCreated())
			.andExpect(jsonPath("$.repeated").value(true))
			.andExpect(jsonPath("$.balance").value(700));
		// A new request for it is refused: one is all anyone may own.
		buy(session, "FRAME_BUBBLEGUM").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ITEM_LIMIT_REACHED"));

		assertThat(count("purchases", userId)).isEqualTo(1);
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = 'SHOP_PURCHASE'", Integer.class,
				userId))
			.isEqualTo(1);
		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(700));
	}

	@Test
	void packsAreUsedUpSoOwningSomeDoesNotStopBuyingMore() throws Exception {
		MockHttpSession session = playerWith(1000);

		buy(session, "EXTRA_PACK").andExpect(status().isCreated());
		buy(session, "EXTRA_PACK").andExpect(status().isCreated()).andExpect(jsonPath("$.owned").value(2))
			.andExpect(jsonPath("$.item.soldOut").value(false));
		buy(session, "BADGE_GOLD_COIN").andExpect(status().isCreated());

		// The count owned, not the units one purchase gives (1 for an Extra Pack).
		this.mockMvc.perform(get("/api/users/me/inventory").session(session))
			.andExpect(jsonPath("$.bonusPacks").value(2))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].quantity").value(2))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].consumable").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].equippable").value(false))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].consumable").value(false))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].equipped").value(true));
		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].owned").value(2))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].soldOut").value(false));
	}

	@Test
	void theLevelLockIsTheServersNotTheClients() throws Exception {
		MockHttpSession session = playerWith(5000);
		buy(session, "FRAME_GOLD").andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("LEVEL_TOO_LOW"));

		raiseToLevel(session, 6);
		buy(session, "FRAME_GOLD").andExpect(status().isCreated()).andExpect(jsonPath("$.balance").value(2500));
	}

	// --- Items that are not for sale, and purchases that fail half way ---------------------------------

	@Test
	void anInactiveItemIsNeitherListedNorSold() throws Exception {
		Long retired = insertItem("TEST_RETIRED_" + suffix(), false);
		MockHttpSession session = playerWith(500);
		Long userId = Players.userId(this.mockMvc, session);

		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.items[?(@.id == %d)]".formatted(retired)).isEmpty());
		buy(session, retired, UUID.randomUUID()).andExpect(status().isNotFound());

		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(500));
		assertThat(count("purchases", userId)).isZero();
	}

	@Test
	void whenHandingOverTheItemFailsNothingIsChargedOrRecorded() throws Exception {
		String code = "TEST_BROKEN_" + suffix();
		Long broken = insertItem(code, true);
		// Make handing this item over fail, after the coins were taken in the same transaction.
		this.jdbc.execute("""
				CREATE OR REPLACE FUNCTION test_refuse_item() RETURNS trigger AS $$
				BEGIN
				    IF NEW.item_id = %d THEN RAISE EXCEPTION 'refused for a test'; END IF;
				    RETURN NEW;
				END $$ LANGUAGE plpgsql""".formatted(broken));
		this.jdbc.execute("""
				CREATE TRIGGER test_refuse_item BEFORE INSERT ON user_inventory
				FOR EACH ROW EXECUTE FUNCTION test_refuse_item()""");
		try {
			MockHttpSession session = playerWith(500);
			Long userId = Players.userId(this.mockMvc, session);

			buy(session, broken, UUID.randomUUID()).andExpect(status().isInternalServerError());

			this.mockMvc.perform(get("/api/users/me/coins").session(session))
				.andExpect(jsonPath("$.balance").value(500));
			assertThat(count("purchases", userId)).isZero();
			assertThat(count("user_inventory", userId)).isZero();
			assertThat(this.jdbc.queryForObject(
					"SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = 'SHOP_PURCHASE'",
					Integer.class, userId))
				.isZero();
		}
		finally {
			this.jdbc.execute("DROP TRIGGER test_refuse_item ON user_inventory");
			this.jdbc.execute("DROP FUNCTION test_refuse_item()");
			this.jdbc.update("DELETE FROM shop_items WHERE id = ?", broken);
		}
	}

	@Test
	void theWalletNeverGoesBelowZero() throws Exception {
		MockHttpSession session = playerWith(350);
		buy(session, "FRAME_BUBBLEGUM").andExpect(status().isCreated()).andExpect(jsonPath("$.balance").value(50));
		buy(session, "EXTRA_PACK").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INSUFFICIENT_COINS"));
		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(50));
		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].affordable").value(false));
	}

	// --- Admins ---------------------------------------------------------------------------------------

	@Test
	void anAdminPaysForWhatTheyBuyLikeAnyPlayer() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);
		Players.grantCoins(this.mockMvc, adminId, 100);
		long before = balanceOf(admin);

		buy(admin, "EXTRA_PACK").andExpect(status().isCreated()).andExpect(jsonPath("$.balance").value(before - 100));
		// Admins open packs without a daily limit, so the card game never needs their bought ones.
		this.mockMvc.perform(get("/api/tcg/allowance").session(admin))
			.andExpect(jsonPath("$.dailyLimit").value(nullValue()))
			.andExpect(jsonPath("$.bonusPacks").value(0));
	}

	// --- The coin history -----------------------------------------------------------------------------

	@Test
	void theCoinHistoryExplainsEveryRewardAndPurchase() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long userId = Players.userId(this.mockMvc, session);

		// A first game: coins for playing, for a new best, and for the "First Coin" achievement.
		Players.play(this.mockMvc, session, "snake", 12).andExpect(status().isOk());
		this.mockMvc.perform(post("/api/daily-login/claim").session(session)).andExpect(status().isOk());
		Players.grantCoins(this.mockMvc, userId, 100);
		buy(session, "EXTRA_PACK").andExpect(status().isCreated());

		String body = this.mockMvc.perform(get("/api/users/me/transactions").session(session).param("size", "20"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[0].type").value("SHOP_PURCHASE"))
			.andExpect(jsonPath("$.entries[0].amount").value(-100))
			.andExpect(jsonPath("$.entries[0].description").value("Bought Extra Pack"))
			.andExpect(jsonPath("$.entries[1].type").value("ADMIN_GRANT"))
			.andExpect(jsonPath("$.entries[2].type").value("DAILY_LOGIN"))
			.andExpect(jsonPath("$.entries[2].amount").value(50))
			.andExpect(jsonPath("$.entries[*].type", hasItems("GAME_COMPLETION", "HIGH_SCORE", "ACHIEVEMENT")))
			.andExpect(jsonPath("$.entries[?(@.type == 'ACHIEVEMENT')].description").value("Achievement: First Coin"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		// Who granted coins, or whose account it is, is not part of a player's history.
		assertThat(body).doesNotContain("createdBy").doesNotContain("userId");

		// Every entry's balance is the one after it: the newest is the balance now.
		this.mockMvc.perform(get("/api/users/me/transactions").session(session))
			.andExpect(jsonPath("$.entries[0].balanceAfter").value(balanceOf(session)));
	}

	@Test
	void theCoinHistoryIsOnlyEverThePlayersOwn() throws Exception {
		MockHttpSession someone = playerWith(300);
		MockHttpSession other = Players.register(this.mockMvc);

		this.mockMvc.perform(get("/api/users/me/transactions").session(other))
			.andExpect(jsonPath("$.totalEntries").value(0));
		this.mockMvc.perform(get("/api/users/me/transactions")).andExpect(status().isUnauthorized());
		// Nothing takes a player id: asking for "theirs" by id is not a route.
		this.mockMvc
			.perform(get("/api/users/{id}/transactions", Players.userId(this.mockMvc, someone)).session(other))
			.andExpect(status().isNotFound());
	}

	// --- Helpers --------------------------------------------------------------------------------------

	private MockHttpSession playerWith(int coins) throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		if (coins > 0) {
			Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, session), coins);
		}
		return session;
	}

	private void raiseToLevel(MockHttpSession session, int level) throws Exception {
		this.jdbc.update("UPDATE users SET xp = ? WHERE id = ?", Levels.xpToReach(level),
				Players.userId(this.mockMvc, session));
	}

	private String username(MockHttpSession session) throws Exception {
		String body = this.mockMvc.perform(get("/api/users/me").session(session))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return com.jayway.jsonpath.JsonPath.read(body, "$.username");
	}

	private long balanceOf(MockHttpSession session) throws Exception {
		String body = this.mockMvc.perform(get("/api/users/me/coins").session(session))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return com.jayway.jsonpath.JsonPath.<Number>read(body, "$.balance").longValue();
	}

	private ResultActions buy(MockHttpSession session, String code) throws Exception {
		return buy(session, itemId(code), UUID.randomUUID());
	}

	private ResultActions buy(MockHttpSession session, Long itemId, UUID requestId) throws Exception {
		return this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId, requestId)));
	}

	private Long itemId(String code) {
		return this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
	}

	/** An item only this test knows, last in the shop's order so the catalog's first items stay put. */
	private Long insertItem(String code, boolean active) {
		return this.jdbc.queryForObject("""
				INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon,
				                        active, sort_order)
				VALUES (?, 'Test item', 'Only for a test.', 'BADGE', 100, 1, 1, 1, 'star', ?, 9999)
				RETURNING id""", Long.class, code, active);
	}

	private int count(String table, Long userId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId);
	}

	private static String suffix() {
		return UUID.randomUUID().toString().substring(0, 8).toUpperCase();
	}

}
