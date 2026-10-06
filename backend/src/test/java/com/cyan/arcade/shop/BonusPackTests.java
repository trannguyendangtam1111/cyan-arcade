package com.cyan.arcade.shop;

import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.TinyCardGame;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Coins to shop to card packs: packs bought in the shop are opened once the daily allowance is
 * gone, players keep the allowance, and admins keep their unlimited packs without using any.
 */
@IntegrationTest
class BonusPackTests {

	/** The test context's daily allowance. */
	private static final int DAILY_LIMIT = 5;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	private Long booster;

	@BeforeEach
	void importTinyGame() {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		this.booster = TinyCardGame.packId(this.jdbc, "booster");
	}

	@Test
	void aBoughtPackIsOpenedOnceTodaysAreGone() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, session), 100);
		buy(session, "EXTRA_PACK").andExpect(status().isCreated());

		for (int pack = 0; pack < DAILY_LIMIT; pack++) {
			// Today's own packs come first: the bought one is kept.
			open(session).andExpect(status().isCreated()).andExpect(jsonPath("$.allowance.bonusPacks").value(1));
		}
		open(session).andExpect(status().isCreated())
			.andExpect(jsonPath("$.allowance.leftToday").value(0))
			.andExpect(jsonPath("$.allowance.bonusPacks").value(0));

		open(session).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("DAILY_PACK_LIMIT_REACHED"));
		this.mockMvc.perform(get("/api/tcg/allowance").session(session))
			.andExpect(jsonPath("$.openedToday").value(DAILY_LIMIT + 1))
			.andExpect(jsonPath("$.bonusPacks").value(0));
	}

	@Test
	void withoutABoughtPackThePlayerKeepsTheDailyLimit() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		for (int pack = 0; pack < DAILY_LIMIT; pack++) {
			open(session).andExpect(status().isCreated());
		}

		open(session).andExpect(status().isTooManyRequests());
	}

	@Test
	void aRefusedOpeningKeepsTheBoughtPack() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, session), 100);
		buy(session, "EXTRA_PACK");
		for (int pack = 0; pack < DAILY_LIMIT; pack++) {
			open(session);
		}

		// A pack that does not exist: nothing is opened, so nothing is used up.
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", 999_999).session(session))
			.andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/tcg/allowance").session(session)).andExpect(jsonPath("$.bonusPacks").value(1));
	}

	@Test
	void anAdminOpensWithoutLimitAndWithoutUsingBoughtPacks() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, admin), 100);
		buy(admin, "EXTRA_PACK").andExpect(status().isCreated());
		long bonusBefore = this.jdbc.queryForObject("""
				SELECT coalesce(sum(inv.quantity), 0) FROM user_inventory inv JOIN shop_items i ON i.id = inv.item_id
				JOIN users u ON u.id = inv.user_id WHERE u.username = 'admin' AND i.type = 'PACK'
				""", Long.class);

		for (int pack = 0; pack < DAILY_LIMIT + 3; pack++) {
			open(admin).andExpect(status().isCreated())
				.andExpect(jsonPath("$.allowance.dailyLimit").value(nullValue()));
		}

		long bonusAfter = this.jdbc.queryForObject("""
				SELECT coalesce(sum(inv.quantity), 0) FROM user_inventory inv JOIN shop_items i ON i.id = inv.item_id
				JOIN users u ON u.id = inv.user_id WHERE u.username = 'admin' AND i.type = 'PACK'
				""", Long.class);
		assertThat(bonusAfter).isEqualTo(bonusBefore);
	}

	private ResultActions open(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(post("/api/tcg/packs/{id}/open", this.booster).session(session));
	}

	private ResultActions buy(MockHttpSession session, String code) throws Exception {
		Long itemId = this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
		return this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId, UUID.randomUUID())));
	}

}
