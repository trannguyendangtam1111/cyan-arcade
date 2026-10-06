package com.cyan.arcade.admin;

import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin dashboard and coin grants: admins only, every grant validated, audited in the ledger
 * and safe to repeat.
 */
@IntegrationTest
class AdminEconomyTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	// --- Dashboard -----------------------------------------------------------------------------------

	@Test
	void anAdminSeesTheArcadeAtAGlance() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Players.play(this.mockMvc, player, "snake", 3);
		long users = this.jdbc.queryForObject("SELECT count(*) FROM users", Long.class);
		long games = this.jdbc.queryForObject("SELECT count(*) FROM scores", Long.class);
		long coins = this.jdbc.queryForObject("SELECT coalesce(sum(balance), 0) FROM user_wallets", Long.class);

		this.mockMvc.perform(get("/api/admin/stats").session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalUsers").value(users))
			.andExpect(jsonPath("$.gamesPlayed").value(games))
			.andExpect(jsonPath("$.coinsInCirculation").value(coins))
			.andExpect(jsonPath("$.newUsersToday").value(greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$.gamesToday").value(greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$.activeUsers").value(greaterThanOrEqualTo(1)))
			.andExpect(jsonPath("$.activities[*].key", contains("tcg.packsOpened", "tcg.cardsCollected")))
			.andExpect(jsonPath("$.activities[0].today").isNumber())
			.andExpect(jsonPath("$.generatedAt").isNotEmpty());
	}

	@Test
	void anAdminCanLookUpPlayers() throws Exception {
		String name = Players.uniqueName();
		Players.register(this.mockMvc, name);

		this.mockMvc.perform(get("/api/admin/users").param("query", name.substring(2).toUpperCase())
			.session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].username").value(name))
			.andExpect(jsonPath("$[0].role").value("USER"))
			.andExpect(jsonPath("$[0].level").value(1))
			.andExpect(jsonPath("$[0].coins").value(0));
	}

	@Test
	void anUnderscoreInASearchIsJustAnUnderscore() throws Exception {
		this.mockMvc.perform(get("/api/admin/users").param("query", "_").session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isOk())
			// "admin" has no underscore, so a wildcard would have matched it.
			.andExpect(jsonPath("$[*].username", org.hamcrest.Matchers.not(hasItem("admin"))));
	}

	// --- Granting coins ------------------------------------------------------------------------------

	@Test
	void aGrantIsPaidAndRecordedWithTheAdminAndTheReason() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);

		grant(admin, playerId, 250, "Tournament prize", UUID.randomUUID()).andExpect(status().isCreated())
			.andExpect(jsonPath("$.userId").value(playerId))
			.andExpect(jsonPath("$.amount").value(250))
			.andExpect(jsonPath("$.balance").value(250))
			.andExpect(jsonPath("$.repeated").value(false));

		this.mockMvc.perform(get("/api/users/me/transactions").session(player))
			.andExpect(jsonPath("$.entries[0].type").value("ADMIN_GRANT"))
			.andExpect(jsonPath("$.entries[0].amount").value(250))
			.andExpect(jsonPath("$.entries[0].description").value("Granted by an admin: Tournament prize"));
		assertThat(this.jdbc.queryForObject("SELECT created_by FROM coin_transactions WHERE user_id = ?", Long.class,
				playerId))
			.isEqualTo(adminId);
	}

	@Test
	void repeatingAGrantRequestGrantsOnce() throws Exception {
		Long playerId = Players.userId(this.mockMvc, Players.register(this.mockMvc));
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		UUID requestId = UUID.randomUUID();

		grant(admin, playerId, 100, "Once", requestId).andExpect(status().isCreated());
		grant(admin, playerId, 100, "Once", requestId).andExpect(status().isCreated())
			.andExpect(jsonPath("$.repeated").value(true))
			.andExpect(jsonPath("$.balance").value(100));

		assertThat(this.jdbc.queryForObject("SELECT balance FROM user_wallets WHERE user_id = ?", Long.class, playerId))
			.isEqualTo(100L);
	}

	@ParameterizedTest
	@ValueSource(ints = { 0, -50, 100_001 })
	void aGrantMustBeAPositiveAmountWithinTheLimit(int amount) throws Exception {
		Long playerId = Players.userId(this.mockMvc, Players.register(this.mockMvc));

		grant(Players.signInAsAdmin(this.mockMvc), playerId, amount, "Bad amount", UUID.randomUUID())
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ?", Integer.class,
				playerId))
			.isZero();
	}

	@Test
	void aGrantNeedsAReasonAndAnExistingPlayer() throws Exception {
		Long playerId = Players.userId(this.mockMvc, Players.register(this.mockMvc));
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);

		grant(admin, playerId, 10, " ", UUID.randomUUID()).andExpect(status().isBadRequest());
		grant(admin, 999_999L, 10, "Nobody", UUID.randomUUID()).andExpect(status().isNotFound());
	}

	// --- Who may -------------------------------------------------------------------------------------

	@Test
	void playersCannotUseTheAdminEconomy() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);

		this.mockMvc.perform(get("/api/admin/stats").session(player)).andExpect(status().isForbidden());
		this.mockMvc.perform(get("/api/admin/users").param("query", "a").session(player))
			.andExpect(status().isForbidden());
		// Not even to give coins to themselves.
		grant(player, playerId, 1000, "Myself", UUID.randomUUID()).andExpect(status().isForbidden());
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ?", Integer.class,
				playerId))
			.isZero();
	}

	@Test
	void guestsCannotUseTheAdminEconomy() throws Exception {
		this.mockMvc.perform(get("/api/admin/stats")).andExpect(status().isUnauthorized());
		this.mockMvc
			.perform(post("/api/admin/users/1/coins").contentType(MediaType.APPLICATION_JSON)
				.content("{\"amount\":10,\"reason\":\"x\",\"requestId\":\"%s\"}".formatted(UUID.randomUUID())))
			.andExpect(status().isUnauthorized());
	}

	private ResultActions grant(MockHttpSession session, Long userId, int amount, String reason, UUID requestId)
			throws Exception {
		return this.mockMvc.perform(post("/api/admin/users/{id}/coins", userId).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"amount\":%d,\"reason\":\"%s\",\"requestId\":\"%s\"}".formatted(amount, reason, requestId)));
	}

}
