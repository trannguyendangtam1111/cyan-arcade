package com.cyan.arcade.tcg;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admins open packs without the daily allowance, through the same opening as everyone else; players
 * keep theirs. The test context allows five packs a day.
 */
@IntegrationTest
class AdminPackOpeningTests {

	private static final int DAILY_LIMIT = 5;

	/** The cards a player's openings gave, one row per card per opening. */
	private static final String PULLED_BY = "tcg_pack_opening_cards oc JOIN tcg_pack_openings o ON o.id = oc.opening_id WHERE o.user_id = ?";

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
	void anAdminOpensPacksWellBeyondThePlayersDailyLimit() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		Long adminId = userId("admin");
		long openedBefore = count("tcg_pack_openings WHERE user_id = ?", adminId);
		long copiesBefore = sum("SELECT coalesce(sum(quantity), 0) FROM tcg_user_cards WHERE user_id = ?", adminId);
		long pulledBefore = count(PULLED_BY, adminId);
		int packs = DAILY_LIMIT * 3;

		for (int pack = 0; pack < packs; pack++) {
			open(admin, "booster").andExpect(status().isCreated())
				.andExpect(jsonPath("$.allowance.dailyLimit").value(nullValue()))
				.andExpect(jsonPath("$.allowance.leftToday").value(nullValue()));
		}

		// Every opening was recorded, and every card landed in the collection exactly once.
		assertThat(count("tcg_pack_openings WHERE user_id = ?", adminId)).isEqualTo(openedBefore + packs);
		assertThat(sum("SELECT coalesce(sum(quantity), 0) FROM tcg_user_cards WHERE user_id = ?", adminId))
			.isEqualTo(copiesBefore + packs * 3L);
		assertThat(count(PULLED_BY, adminId)).isEqualTo(pulledBefore + packs * 3L);
		// One row per card owned, however often it was pulled.
		assertThat(this.jdbc.queryForObject("""
				SELECT count(*) - count(DISTINCT card_id) FROM tcg_user_cards WHERE user_id = ?
				""", Long.class, adminId)).isZero();

		this.mockMvc.perform(get("/api/tcg/allowance").session(admin))
			.andExpect(jsonPath("$.dailyLimit").value(nullValue()))
			.andExpect(jsonPath("$.leftToday").value(nullValue()))
			.andExpect(jsonPath("$.openedToday", greaterThanOrEqualTo(packs)));
	}

	@Test
	void aPlayerKeepsTheDailyLimitAsBefore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		for (int pack = 0; pack < DAILY_LIMIT; pack++) {
			open(player, "single").andExpect(status().isCreated());
		}
		open(player, "single").andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("DAILY_PACK_LIMIT_REACHED"));

		this.mockMvc.perform(get("/api/tcg/allowance").session(player))
			.andExpect(jsonPath("$.dailyLimit").value(DAILY_LIMIT))
			.andExpect(jsonPath("$.leftToday").value(0));
	}

	@Test
	void anAdminsOpeningsLookLikeAnyoneElsesInTheHistory() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		String body = open(admin, "single").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		Integer openingId = JsonPath.read(body, "$.opening.id");

		String history = this.mockMvc.perform(get("/api/tcg/openings").session(admin).param("size", "1"))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JsonPath.<List<Map<String, Object>>>read(history, "$.entries")).singleElement()
			.satisfies((entry) -> assertThat(entry).containsEntry("id", openingId));
	}

	private ResultActions open(MockHttpSession session, String packCode) throws Exception {
		return this.mockMvc
			.perform(post("/api/tcg/packs/{id}/open", TinyCardGame.packId(this.jdbc, packCode)).session(session));
	}

	private Long userId(String username) {
		return this.jdbc.queryForObject("SELECT id FROM users WHERE lower(username) = lower(?)", Long.class, username);
	}

	private long count(String tableAndCondition, Object... args) {
		return this.jdbc.queryForObject("SELECT count(*) FROM " + tableAndCondition, Long.class, args);
	}

	private long sum(String sql, Object... args) {
		return this.jdbc.queryForObject(sql, Long.class, args);
	}

}
