package com.cyan.arcade.profile;

import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.TinyCardGame;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A player's statistics: across the platform, from the card game, and per game. */
@IntegrationTest
class ProfileStatsApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@Test
	void aNewPlayerHasNothingYet() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(get("/api/users/me/stats").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.gamesPlayed").value(0))
			.andExpect(jsonPath("$.playTimeMs").value(0))
			.andExpect(jsonPath("$.coins").value(0))
			.andExpect(jsonPath("$.coinsEarned").value(0))
			.andExpect(jsonPath("$.achievementsUnlocked").value(0))
			.andExpect(jsonPath("$.achievementsTotal").value(40))
			.andExpect(jsonPath("$.games").isEmpty())
			.andExpect(jsonPath("$.activities[*].key",
					contains("tcg.packsOpened", "tcg.cardsCollected", "tcg.uniqueCards")))
			.andExpect(jsonPath("$.activities[*].value", contains(0, 0, 0)));
	}

	@Test
	void statisticsCoverEveryGameAndTheCardsToo() throws Exception {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 4);
		Players.play(this.mockMvc, session, "snake", 10);
		Players.play(this.mockMvc, session, "snake", 7);
		Players.play(this.mockMvc, session, "tetris", 300, Map.of("lines", 2));
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", TinyCardGame.packId(this.jdbc, "booster"))
			.session(session)).andExpect(status().isCreated());

		this.mockMvc.perform(get("/api/users/me/stats").session(session))
			.andExpect(jsonPath("$.gamesPlayed").value(4))
			.andExpect(jsonPath("$.totalScore").value(321))
			.andExpect(jsonPath("$.playTimeMs").value(greaterThanOrEqualTo(0)))
			.andExpect(jsonPath("$.achievementsUnlocked").value(1))
			.andExpect(jsonPath("$.coins").value(jsonPathOf(session, "/api/users/me/coins", "$.balance")))
			// Most played first.
			.andExpect(jsonPath("$.games[*].slug", contains("snake", "tetris")))
			.andExpect(jsonPath("$.games[0].name").value("Snake"))
			.andExpect(jsonPath("$.games[0].gamesPlayed").value(3))
			.andExpect(jsonPath("$.games[0].bestScore").value(10))
			.andExpect(jsonPath("$.games[0].averageScore").value(7))
			.andExpect(jsonPath("$.games[0].lastPlayedAt").isNotEmpty())
			.andExpect(jsonPath("$.games[1].gamesPlayed").value(1))
			.andExpect(jsonPath("$.games[1].bestScore").value(300))
			.andExpect(jsonPath("$.activities[0].value").value(1))
			// A booster holds three cards.
			.andExpect(jsonPath("$.activities[1].value").value(3));
	}

	@Test
	void statisticsAreTheSignedInPlayersOwn() throws Exception {
		this.mockMvc.perform(get("/api/users/me/stats")).andExpect(status().isUnauthorized());
	}

	private Object jsonPathOf(MockHttpSession session, String url, String path) throws Exception {
		String body = this.mockMvc.perform(get(url).session(session)).andReturn().getResponse().getContentAsString();
		return com.jayway.jsonpath.JsonPath.read(body, path);
	}

}
