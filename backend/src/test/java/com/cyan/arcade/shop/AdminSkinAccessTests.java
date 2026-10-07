package com.cyan.arcade.shop;

import java.util.List;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admins wear every Brick Breaker skin without buying it; players still buy theirs. Wearing one this
 * way costs nothing, records no purchase and gives no ownership, and opens nothing else: not other
 * games' skins, not profile items, not items that are not on sale.
 */
@IntegrationTest
class AdminSkinAccessTests {

	private static final String BRICK_SKINS = "$.items[?(@.gameSlug == 'brick-breaker')]";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void aPlayerCannotWearASkinTheyDoNotOwn() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		wear(player, "BRICK_PADDLE_DRAGON").andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/shop/items").session(player))
			.andExpect(jsonPath(BRICK_SKINS + ".wearable", everyItem(is(false))))
			.andExpect(jsonPath(BRICK_SKINS + ".equipped", everyItem(is(false))));
		assertThat(rowsOf(player)).isZero();
	}

	@Test
	void aPlayerWearsTheSkinsTheyBought() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, player), 1000);
		buy(player, "BRICK_PADDLE_CANDY").andExpect(status().isCreated());
		buy(player, "BRICK_PADDLE_MOCHI").andExpect(status().isCreated());

		wear(player, "BRICK_PADDLE_MOCHI").andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_PADDLE_MOCHI')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_PADDLE_CANDY')].equipped").value(false));
		this.mockMvc.perform(get("/api/shop/items").session(player))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_PADDLE_MOCHI')].wearable").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_PADDLE_DRAGON')].wearable").value(false))
			.andExpect(jsonPath("$.balance").value(400));
	}

	@Test
	void anAdminWearsEveryBrickBreakerSkinWithoutBuyingIt() throws Exception {
		MockHttpSession admin = newAdmin(250);
		Long adminId = Players.userId(this.mockMvc, admin);
		List<String> skins = this.jdbc.queryForList(
				"SELECT code FROM shop_items WHERE game_slug = 'brick-breaker' AND active ORDER BY sort_order", String.class);
		assertThat(skins).hasSize(18);
		int transactionsBefore = transactionsOf(adminId);

		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath(BRICK_SKINS + ".wearable", everyItem(is(true))))
			.andExpect(jsonPath(BRICK_SKINS + ".owned", everyItem(is(0))));

		// Every one, whatever its price or level (Dragon costs 1,800 at level 6; this admin has 250 coins at level 1).
		for (String code : skins) {
			wear(admin, code).andExpect(status().isOk());
			this.mockMvc.perform(get("/api/shop/items").session(admin))
				.andExpect(jsonPath("$.items[?(@.code == '%s')].equipped".formatted(code)).value(true));
		}

		// One worn per slot, still not owned, and nothing paid or recorded.
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.balance").value(250))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'brick-breaker' && @.equipped == true)]", hasSize(3)))
			.andExpect(jsonPath(BRICK_SKINS + ".owned", everyItem(is(0))));
		this.mockMvc.perform(get("/api/users/me/coins").session(admin)).andExpect(jsonPath("$.balance").value(250));
		this.mockMvc.perform(get("/api/users/me/inventory").session(admin)).andExpect(jsonPath("$.items", empty()));
		assertThat(transactionsOf(adminId)).isEqualTo(transactionsBefore);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM purchases WHERE user_id = ?", Integer.class, adminId))
			.isZero();
		assertThat(rowsOf(admin)).isEqualTo(3);
		assertThat(this.jdbc.queryForObject("SELECT coalesce(sum(quantity), 0) FROM user_inventory WHERE user_id = ?",
				Integer.class, adminId))
			.isZero();
	}

	@Test
	void anAdminSwitchesAndTakesOffSkinsFreely() throws Exception {
		MockHttpSession admin = newAdmin(0);

		wear(admin, "BRICK_BALL_STAR").andExpect(status().isOk());
		wear(admin, "BRICK_BALL_GALAXY").andExpect(status().isOk());
		wear(admin, "BRICK_THEME_SPACE").andExpect(status().isOk());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_BALL_GALAXY')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_BALL_STAR')].equipped").value(false))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_THEME_SPACE')].equipped").value(true));
		assertThat(rowsOf(admin)).isEqualTo(2);

		// Taking one off goes back to the game's own look there, and leaves nothing behind.
		this.mockMvc.perform(delete("/api/users/me/inventory/{id}/equipped", itemId("BRICK_BALL_GALAXY")).session(admin))
			.andExpect(status().isOk());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'brick-breaker' && @.slot == 'ball' && @.equipped == true)]", empty()))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_THEME_SPACE')].equipped").value(true));
		assertThat(rowsOf(admin)).isEqualTo(1);
	}

	@Test
	void anAdminWhoBuysASkinAnywayOwnsIt() throws Exception {
		MockHttpSession admin = newAdmin(500);
		wear(admin, "BRICK_BALL_BUBBLE").andExpect(status().isOk());
		buy(admin, "BRICK_BALL_BUBBLE").andExpect(status().isCreated()).andExpect(jsonPath("$.owned").value(1));

		this.mockMvc.perform(get("/api/users/me/inventory").session(admin))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_BALL_BUBBLE')].quantity").value(1))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_BALL_BUBBLE')].equipped").value(true));
		// Taking off a skin they own keeps it.
		this.mockMvc.perform(delete("/api/users/me/inventory/{id}/equipped", itemId("BRICK_BALL_BUBBLE")).session(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_BALL_BUBBLE')].quantity").value(1));
	}

	@Test
	void theSeededAdminWearsThemToo() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		long balance = balanceOf(admin);
		try {
			wear(admin, "BRICK_PADDLE_GALAXY").andExpect(status().isOk());
			this.mockMvc.perform(get("/api/shop/items").session(admin))
				.andExpect(jsonPath("$.items[?(@.code == 'BRICK_PADDLE_GALAXY')].equipped").value(true));
			assertThat(balanceOf(admin)).isEqualTo(balance);
		}
		finally {
			this.mockMvc.perform(delete("/api/users/me/inventory/{id}/equipped", itemId("BRICK_PADDLE_GALAXY")).session(admin));
		}
	}

	@Test
	void anAdminGetsNothingElseForFree() throws Exception {
		MockHttpSession admin = newAdmin(0);

		// No such item.
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", 987_654_321L).session(admin))
			.andExpect(status().isNotFound());
		// Another game's skins, profile items and packs are owned like anyone else's.
		wear(admin, "FLAPPY_BIRD_PHOENIX").andExpect(status().isNotFound());
		wear(admin, "FRAME_BUBBLEGUM").andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'flappy-bird')].wearable", everyItem(is(false))))
			.andExpect(jsonPath("$.items[?(@.type == 'BADGE')].wearable", everyItem(is(false))))
			.andExpect(jsonPath("$.items[?(@.type == 'PACK')].wearable", everyItem(is(false))));
		// A Brick Breaker skin that is not on sale is not one of them either.
		this.jdbc.update("""
				INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon,
				                        sort_order, game_slug, slot, active)
				VALUES ('BRICK_BALL_RETIRED_TEST', 'Retired Ball', 'No longer sold.', 'GAME_SKIN', 100, 1, 1, 1,
				        'retired', 999, 'brick-breaker', 'ball', FALSE)
				ON CONFLICT (code) DO NOTHING
				""");
		try {
			wear(admin, "BRICK_BALL_RETIRED_TEST").andExpect(status().isNotFound());
		}
		finally {
			// Other tests count Brick Breaker's skins.
			this.jdbc.update("DELETE FROM shop_items WHERE code = 'BRICK_BALL_RETIRED_TEST'");
		}
		assertThat(rowsOf(admin)).isZero();
	}

	@Test
	void guestsAreToldNothingAboutWearing() throws Exception {
		this.mockMvc.perform(get("/api/shop/items"))
			.andExpect(status().isOk())
			.andExpect(jsonPath(BRICK_SKINS + ".wearable", everyItem(nullValue())));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** A new account made an admin, the way the arcade stores roles, with some coins. */
	private MockHttpSession newAdmin(int coins) throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long id = Players.userId(this.mockMvc, session);
		if (coins > 0) {
			Players.grantCoins(this.mockMvc, id, coins);
		}
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", id);
		return session;
	}

	private ResultActions wear(MockHttpSession session, String code) throws Exception {
		return this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId(code)).session(session));
	}

	private ResultActions buy(MockHttpSession session, String code) throws Exception {
		return this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId(code), UUID.randomUUID())));
	}

	private long balanceOf(MockHttpSession session) throws Exception {
		String body = this.mockMvc.perform(get("/api/users/me/coins").session(session))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return Long.parseLong(body.replaceAll("(?s).*\"balance\":(\\d+).*", "$1"));
	}

	private int rowsOf(MockHttpSession session) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM user_inventory WHERE user_id = ?", Integer.class,
				Players.userId(this.mockMvc, session));
	}

	private int transactionsOf(Long userId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ?", Integer.class,
				userId);
	}

	private Long itemId(String code) {
		return this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
	}

}
