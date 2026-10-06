package com.cyan.arcade.challenge;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.challenge.ChallengeTemplates.Activity;
import com.cyan.arcade.common.platform.PlayerActivity;
import com.cyan.arcade.tcg.TinyCardGame;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
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
 * Challenges that count something done outside the games: "open 3 card packs today". The card game
 * only reports that a pack was opened; the count, the completion and the reward are the
 * platform's, decided on the server.
 */
@IntegrationTest
class ActivityChallengeTests {

	private static final Activity CARD_PACKS = new Activity(PlayerActivity.TCG_PACK_OPENED, "Card packs", List.of());

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private DailyChallengeStore store;

	@Autowired
	private TcgDatasetImporter importer;

	@Autowired
	private Clock clock;

	private Long booster;

	@BeforeEach
	@AfterEach
	void clearChallenges() {
		this.jdbc.update("DELETE FROM daily_challenge_completions");
		this.jdbc.update("DELETE FROM daily_challenge_progress");
		this.jdbc.update("DELETE FROM daily_challenges");
	}

	@BeforeEach
	void importTinyGame() {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		this.booster = TinyCardGame.packId(this.jdbc, "booster");
	}

	@Test
	void openingThePacksCompletesTheChallengeAndPaysItOnce() throws Exception {
		givenToday(ChallengeTemplate.count("Pack Opener", "Open 3 card packs today.", 3, 30, 60));
		MockHttpSession session = Players.register(this.mockMvc);

		open(session);
		open(session);
		mine(session).andExpect(jsonPath("$.challenges[0].activity.code").value("TCG_PACK_OPENED"))
			.andExpect(jsonPath("$.challenges[0].game").value(nullValue()))
			.andExpect(jsonPath("$.challenges[0].progress").value(2))
			.andExpect(jsonPath("$.challenges[0].completed").value(false));
		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(0));

		open(session);
		mine(session).andExpect(jsonPath("$.completedCount").value(1))
			.andExpect(jsonPath("$.challenges[0].progress").value(3))
			.andExpect(jsonPath("$.challenges[0].completed").value(true));
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.coins").value(60))
			.andExpect(jsonPath("$.xp").value(30));

		// A fourth pack counts, and pays nothing more.
		open(session);
		mine(session).andExpect(jsonPath("$.challenges[0].progress").value(4));
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.coins").value(60))
			.andExpect(jsonPath("$.xp").value(30));
		this.mockMvc.perform(get("/api/users/me/transactions").session(session))
			.andExpect(jsonPath("$.entries[0].type").value("DAILY_CHALLENGE"))
			.andExpect(jsonPath("$.totalEntries").value(1));
	}

	@Test
	void playingGamesDoesNotCountTowardsAnActivity() throws Exception {
		givenToday(ChallengeTemplate.count("Pack Opener", "Open 3 card packs today.", 1, 30, 60));
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "snake", 5).andExpect(jsonPath("$.rewards.bonuses").isEmpty());

		mine(session).andExpect(jsonPath("$.challenges[0].progress").value(0))
			.andExpect(jsonPath("$.challenges[0].completed").value(false));
	}

	@Test
	void everyPlayerCountsTheirOwnPacks() throws Exception {
		givenToday(ChallengeTemplate.count("Pack Opener", "Open 2 card packs today.", 2, 30, 60));
		MockHttpSession first = Players.register(this.mockMvc);
		MockHttpSession second = Players.register(this.mockMvc);

		open(first);
		open(second);

		mine(first).andExpect(jsonPath("$.challenges[0].progress").value(1));
		mine(second).andExpect(jsonPath("$.challenges[0].progress").value(1));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions", Integer.class))
			.isZero();
	}

	private void givenToday(ChallengeTemplate template) {
		LocalDate today = LocalDate.ofInstant(this.clock.instant(), ZoneOffset.UTC);
		assertThat(this.store.insertIfAbsent(today, CARD_PACKS, template, this.clock.instant())).isTrue();
	}

	private void open(MockHttpSession session) throws Exception {
		this.mockMvc.perform(post("/api/tcg/packs/{id}/open", this.booster).session(session))
			.andExpect(status().isCreated());
	}

	private ResultActions mine(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/daily-challenges/me").session(session)).andExpect(status().isOk());
	}

}
