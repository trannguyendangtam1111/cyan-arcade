package com.cyan.arcade.progression;

import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Coins earned by playing, through the real score flow: the server decides every amount, each is
 * a transaction in the ledger, and nothing is paid twice.
 */
@IntegrationTest
class CoinRewardsApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void aFirstGameEarnsCoinsForPlayingForABestAndForItsAchievement() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "snake", 3)
			// 5 for finishing, 15 for a best, 100 for "First Coin".
			.andExpect(jsonPath("$.rewards.coinsEarned").value(120))
			.andExpect(jsonPath("$.rewards.coinBalance").value(120))
			.andExpect(jsonPath("$.rewards.achievements[0].code").value("FIRST_GAME"))
			.andExpect(jsonPath("$.rewards.achievements[0].coins").value(100));

		Long userId = Players.userId(this.mockMvc, session);
		assertThat(this.jdbc.queryForList("SELECT type FROM coin_transactions WHERE user_id = ? ORDER BY id",
				String.class, userId))
			.containsExactly("GAME_COMPLETION", "HIGH_SCORE", "ACHIEVEMENT");
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(jsonPath("$.coins").value(120));
	}

	@Test
	void aGameThatIsNotABestEarnsOnlyTheCoinsForPlaying() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 10);

		Players.play(this.mockMvc, session, "snake", 4)
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
			.andExpect(jsonPath("$.rewards.coinBalance").value(125));
	}

	@Test
	void finishingTheSameRunTwicePaysOnce() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		String run = Players.startGame(this.mockMvc, session, "snake");
		Players.finishGame(this.mockMvc, session, run, 3, Map.of()).andExpect(status().isOk());

		Players.finishGame(this.mockMvc, session, run, 30, Map.of()).andExpect(status().isConflict());

		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(120));
	}

	@Test
	void onlySoManyGamesADayPayForBeingPlayed() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long userId = Players.userId(this.mockMvc, session);
		Players.play(this.mockMvc, session, "snake", 10);
		// As if the player had already been paid for the 40 games a day that are paid for.
		for (int game = 0; game < 39; game++) {
			this.jdbc.update("""
					INSERT INTO coin_transactions (user_id, amount, balance_after, type, reference_type, reference_id,
					    description, created_at)
					VALUES (?, 5, 0, 'GAME_COMPLETION', 'GAME_SESSION', ?, 'Earlier game', now())
					""", userId, "earlier-" + game);
		}

		// No coins for playing; still the XP, and a best still pays.
		Players.play(this.mockMvc, session, "snake", 2)
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		Players.play(this.mockMvc, session, "snake", 11).andExpect(jsonPath("$.rewards.coinsEarned").value(15));
	}

	@Test
	void guestsEarnNoCoins() throws Exception {
		Players.play(this.mockMvc, null, "snake", 50).andExpect(jsonPath("$.rewards").value(nullValue()));
	}

	@Test
	void everyAchievementShowsTheCoinsItIsWorth() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "tetris", 1500, Map.of("lines", 12))
			// 5 + 15, "First Coin" 100 and "Line Worker" 150.
			.andExpect(jsonPath("$.rewards.coinsEarned").value(270))
			.andExpect(jsonPath("$.rewards.achievements[*].code", containsInAnyOrder("FIRST_GAME", "TETRIS_10_LINES")));

		this.mockMvc.perform(get("/api/users/me/achievements").session(session))
			.andExpect(jsonPath("$[?(@.code == 'FIRST_GAME')].coins", contains(100)))
			.andExpect(jsonPath("$[?(@.code == 'REACH_2048')].coins", contains(500)));
	}

}
