package com.cyan.arcade.shop;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.economy.InsufficientCoinsException;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The shop end to end: what is for sale, buying it with coins, what can stop a purchase, and what
 * a player owns afterwards. The request names the item; everything else is the server's.
 */
@IntegrationTest
class ShopApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private ShopService shop;

	// --- The catalog ---------------------------------------------------------------------------------

	@Test
	void anyoneCanSeeWhatIsForSale() throws Exception {
		this.mockMvc.perform(get("/api/shop/items"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.balance").value(nullValue()))
			.andExpect(jsonPath("$.items[*].code", hasItems("EXTRA_PACK", "PACK_TRIO", "BADGE_GOLD_COIN",
					"TITLE_HIGH_ROLLER")))
			.andExpect(jsonPath("$.items[*].type", hasItems("PACK", "BADGE", "TITLE")))
			.andExpect(jsonPath("$.items[0].code").value("EXTRA_PACK"))
			.andExpect(jsonPath("$.items[0].price").value(100))
			.andExpect(jsonPath("$.items[0].quantity").value(1))
			.andExpect(jsonPath("$.items[0].owned").value(nullValue()));
	}

	@Test
	void aPlayerSeesTheirBalanceAndWhatTheyMayBuy() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.balance").value(0))
			.andExpect(jsonPath("$.level").value(1))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].owned").value(0))
			.andExpect(jsonPath("$.items[?(@.code == 'EXTRA_PACK')].unlocked").value(true))
			// The Pack Box needs level 3.
			.andExpect(jsonPath("$.items[?(@.code == 'PACK_BOX')].unlocked").value(false));
	}

	// --- Buying --------------------------------------------------------------------------------------

	@Test
	void buyingTakesThePriceAndPutsTheItemInTheInventory() throws Exception {
		MockHttpSession session = playerWith(500);

		buy(session, itemId("PACK_TRIO"), UUID.randomUUID()).andExpect(status().isCreated())
			.andExpect(jsonPath("$.purchaseId").isNumber())
			.andExpect(jsonPath("$.item.code").value("PACK_TRIO"))
			.andExpect(jsonPath("$.price").value(270))
			.andExpect(jsonPath("$.quantity").value(3))
			.andExpect(jsonPath("$.balance").value(230))
			.andExpect(jsonPath("$.owned").value(3))
			.andExpect(jsonPath("$.repeated").value(false));

		this.mockMvc.perform(get("/api/users/me/inventory").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.bonusPacks").value(3))
			.andExpect(jsonPath("$.items[0].code").value("PACK_TRIO"))
			.andExpect(jsonPath("$.items[0].quantity").value(3))
			.andExpect(jsonPath("$.items[0].equippable").value(false));
		this.mockMvc.perform(get("/api/users/me/transactions").session(session))
			.andExpect(jsonPath("$.entries[0].type").value("SHOP_PURCHASE"))
			.andExpect(jsonPath("$.entries[0].amount").value(-270))
			.andExpect(jsonPath("$.entries[0].description").value("Bought Pack Trio"));
	}

	@Test
	void withoutEnoughCoinsNothingIsBoughtOrCharged() throws Exception {
		MockHttpSession session = playerWith(99);
		Long userId = Players.userId(this.mockMvc, session);

		buy(session, itemId("EXTRA_PACK"), UUID.randomUUID()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("INSUFFICIENT_COINS"));

		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(99));
		assertThat(count("purchases", userId)).isZero();
		assertThat(count("user_inventory", userId)).isZero();
	}

	@Test
	void repeatingAPurchaseRequestBuysOnce() throws Exception {
		MockHttpSession session = playerWith(500);
		UUID requestId = UUID.randomUUID();
		String first = buy(session, itemId("EXTRA_PACK"), requestId).andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();

		buy(session, itemId("EXTRA_PACK"), requestId).andExpect(status().isCreated())
			.andExpect(jsonPath("$.repeated").value(true))
			.andExpect(jsonPath("$.purchaseId").value(JsonPath.<Integer>read(first, "$.purchaseId")))
			.andExpect(jsonPath("$.balance").value(400))
			.andExpect(jsonPath("$.owned").value(1));

		Long userId = Players.userId(this.mockMvc, session);
		assertThat(count("purchases", userId)).isEqualTo(1);
	}

	@Test
	void simultaneousPurchasesCannotSpendMoreThanTheBalance() throws Exception {
		MockHttpSession session = playerWith(300);
		Long userId = Players.userId(this.mockMvc, session);
		Long item = itemId("EXTRA_PACK");

		// Eight purchases of a 100-coin item at the same moment, with coins for three.
		List<Callable<Boolean>> attempts = new ArrayList<>();
		for (int attempt = 0; attempt < 8; attempt++) {
			attempts.add(() -> {
				try {
					this.shop.purchase(userId, item, UUID.randomUUID());
					return true;
				}
				catch (InsufficientCoinsException ex) {
					return false;
				}
			});
		}
		List<Boolean> results = runAtOnce(attempts);

		assertThat(results).filteredOn((bought) -> bought).hasSize(3);
		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(0));
		this.mockMvc.perform(get("/api/users/me/inventory").session(session))
			.andExpect(jsonPath("$.bonusPacks").value(3));
	}

	@Test
	void anItemAboveThePlayersLevelCannotBeBought() throws Exception {
		MockHttpSession session = playerWith(5000);

		buy(session, itemId("PACK_BOX"), UUID.randomUUID()).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("LEVEL_TOO_LOW"));
		this.mockMvc.perform(get("/api/users/me/coins").session(session))
			.andExpect(jsonPath("$.balance").value(5000));
	}

	@Test
	void aBadgeCanBeOwnedOnceAndIsWornStraightAway() throws Exception {
		MockHttpSession session = playerWith(1500);
		Long badge = itemId("BADGE_GOLD_COIN");

		buy(session, badge, UUID.randomUUID()).andExpect(status().isCreated());
		buy(session, badge, UUID.randomUUID()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ITEM_LIMIT_REACHED"));

		this.mockMvc.perform(get("/api/users/me/coins").session(session))
			.andExpect(jsonPath("$.balance").value(1000));
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.badge.code").value("BADGE_GOLD_COIN"))
			.andExpect(jsonPath("$.badge.name").value("Gold Coin"))
			.andExpect(jsonPath("$.title").value(nullValue()));
		this.mockMvc.perform(get("/api/shop/items").session(session))
			.andExpect(jsonPath("$.items[?(@.code == 'BADGE_GOLD_COIN')].soldOut").value(true));
	}

	@Test
	void aPlayerChoosesWhichTitleToWear() throws Exception {
		MockHttpSession session = playerWith(2000);
		Long highRoller = itemId("TITLE_HIGH_ROLLER");
		buy(session, highRoller, UUID.randomUUID()).andExpect(status().isCreated());
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.title.name").value("High Roller"));

		this.mockMvc.perform(delete("/api/users/me/inventory/{id}/equipped", highRoller).session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].equipped").value(false));
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(jsonPath("$.title").value(nullValue()));

		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", highRoller).session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].equipped").value(true));
	}

	@Test
	void onlyOwnedWearableItemsCanBeWorn() throws Exception {
		MockHttpSession session = playerWith(500);
		buy(session, itemId("EXTRA_PACK"), UUID.randomUUID());

		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("TITLE_LEGEND")).session(session))
			.andExpect(status().isNotFound());
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("EXTRA_PACK")).session(session))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("ITEM_NOT_EQUIPPABLE"));
	}

	@Test
	void aPurchaseNeedsAValidRequest() throws Exception {
		MockHttpSession session = playerWith(500);

		this.mockMvc
			.perform(post("/api/shop/purchases").session(session)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"itemId\":%d}".formatted(itemId("EXTRA_PACK"))))
			.andExpect(status().isBadRequest());
		buy(session, 999_999L, UUID.randomUUID()).andExpect(status().isNotFound());
		// A price in the request is ignored: the shop's price is charged.
		this.mockMvc
			.perform(post("/api/shop/purchases").session(session)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"itemId\":%d,\"requestId\":\"%s\",\"price\":1}".formatted(itemId("EXTRA_PACK"),
						UUID.randomUUID())))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.price").value(100))
			.andExpect(jsonPath("$.balance").value(400));
	}

	@Test
	void buyingAndOwningNeedASignedInPlayer() throws Exception {
		buyAsGuest().andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/users/me/inventory")).andExpect(status().isUnauthorized());
	}

	private ResultActions buyAsGuest() throws Exception {
		return this.mockMvc.perform(post("/api/shop/purchases").contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":1,\"requestId\":\"%s\"}".formatted(UUID.randomUUID())));
	}

	private MockHttpSession playerWith(int coins) throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, session), coins);
		return session;
	}

	private ResultActions buy(MockHttpSession session, Long itemId, UUID requestId) throws Exception {
		return this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId, requestId)));
	}

	private Long itemId(String code) {
		return this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
	}

	private int count(String table, Long userId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId);
	}

	private static <T> List<T> runAtOnce(List<Callable<T>> tasks) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
		try {
			List<T> results = new ArrayList<>();
			for (Future<T> future : pool.invokeAll(tasks)) {
				results.add(future.get());
			}
			return results;
		}
		finally {
			pool.shutdown();
		}
	}

}
