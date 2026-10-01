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
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** XP, levels and achievements as a player earns them by finishing games through the API. */
@IntegrationTest
class ProgressionApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void theFirstGameEarnsXpABestBonusAndTheFirstAchievement() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "snake", 7)
			// 10 for finishing + 25 for a personal best + 50 for the "First Coin" achievement.
			.andExpect(jsonPath("$.rewards.xpEarned").value(85))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", contains("FIRST_GAME")))
			.andExpect(jsonPath("$.rewards.achievements[0].name").value("First Coin"))
			.andExpect(jsonPath("$.rewards.achievements[0].xp").value(50))
			.andExpect(jsonPath("$.rewards.totalXp").value(85))
			.andExpect(jsonPath("$.rewards.level").value(1))
			.andExpect(jsonPath("$.rewards.leveledUp").value(false));

		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.xp").value(85))
			.andExpect(jsonPath("$.level").value(1))
			.andExpect(jsonPath("$.xpIntoLevel").value(85));
	}

	@Test
	void aLaterGameEarnsTheBaseXpAndABonusOnlyForBeatingYourBest() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 7);

		// Worse than before: just the 10 for finishing, and no achievement twice.
		Players.play(this.mockMvc, session, "snake", 3)
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.personalBest").value(false))
			.andExpect(jsonPath("$.rewards.achievements", hasSize(0)))
			.andExpect(jsonPath("$.rewards.totalXp").value(95));
		// Equal to the best is not a new best either.
		Players.play(this.mockMvc, session, "snake", 7).andExpect(jsonPath("$.rewards.personalBest").value(false));
		// Better than before: the bonus again.
		Players.play(this.mockMvc, session, "snake", 8)
			.andExpect(jsonPath("$.rewards.xpEarned").value(35))
			.andExpect(jsonPath("$.rewards.personalBest").value(true));
	}

	@Test
	void bestsAreTrackedPerGame() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "tetris", 5000);

		// 12 is far below the Tetris score, but it is this player's first and best Snake score.
		Players.play(this.mockMvc, session, "snake", 12).andExpect(jsonPath("$.rewards.personalBest").value(true));
	}

	@Test
	void aScoreOfZeroIsNotAPersonalBest() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, session, "snake", 0)
			.andExpect(jsonPath("$.rewards.personalBest").value(false))
			.andExpect(jsonPath("$.rewards.xpEarned").value(60)); // 10 + "First Coin"
	}

	@Test
	void reachingTheNextLevelIsReported() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 7); // 85 XP
		Players.play(this.mockMvc, session, "snake", 1); // 95 XP

		Players.play(this.mockMvc, session, "snake", 1) // 105 XP: past the 100 needed for level 2
			.andExpect(jsonPath("$.rewards.totalXp").value(105))
			.andExpect(jsonPath("$.rewards.level").value(2))
			.andExpect(jsonPath("$.rewards.leveledUp").value(true));

		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.level").value(2))
			.andExpect(jsonPath("$.xpIntoLevel").value(5))
			.andExpect(jsonPath("$.xpForNextLevel").value(200));
	}

	@Test
	void scoreAchievementsUnlockInTheRightGameOnly() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		// 30 points in Tetris is not 25 apples in Snake.
		Players.play(this.mockMvc, session, "tetris", 30)
			.andExpect(jsonPath("$.rewards.achievements[*].code", contains("FIRST_GAME")));

		Players.play(this.mockMvc, session, "snake", 30)
			.andExpect(jsonPath("$.rewards.achievements[*].code", contains("SNAKE_25")))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10 + 25 + 100));
	}

	@Test
	void detailAchievementsUseWhatTheGameReportsAboutTheRun() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 1);

		Players.play(this.mockMvc, session, "tetris", 4000, Map.of("lines", 12, "level", 2))
			.andExpect(jsonPath("$.rewards.achievements[*].code", contains("TETRIS_10_LINES")));
		// Making the 2048 tile also passes 512 on the way: both unlock at once.
		Players.play(this.mockMvc, session, "2048", 21000, Map.of("highestTile", 2048, "moves", 950))
			.andExpect(jsonPath("$.rewards.achievements[*].code", containsInAnyOrder("REACH_512", "REACH_2048")));
		// Lines reported for a game of Snake do not count towards a Tetris achievement.
		Players.play(this.mockMvc, session, "snake", 2, Map.of("lines", 99))
			.andExpect(jsonPath("$.rewards.achievements", hasSize(0)));
	}

	@Test
	void anAchievementIsUnlockedAndRewardedOnlyOnce() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 30);

		Players.play(this.mockMvc, session, "snake", 40)
			.andExpect(jsonPath("$.rewards.achievements", hasSize(0)))
			.andExpect(jsonPath("$.rewards.xpEarned").value(35));
	}

	@Test
	void playingTenGamesUnlocksRegular() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		for (int game = 1; game <= 9; game++) {
			Players.play(this.mockMvc, session, "snake", 1);
		}

		Players.play(this.mockMvc, session, "snake", 1)
			.andExpect(jsonPath("$.rewards.achievements[*].code", contains("PLAY_10_GAMES")));
	}

	@Test
	void guestsEarnNothingAndTheirGamesDoNotCountForAnyone() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		Players.play(this.mockMvc, null, "snake", 50).andExpect(jsonPath("$.rewards").doesNotExist());

		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.gamesPlayed").value(0));
	}

	@Test
	void aRunStartedBySomeoneElseCannotBeFinished() throws Exception {
		MockHttpSession alice = Players.register(this.mockMvc);
		MockHttpSession mallory = Players.register(this.mockMvc);
		String aliceRun = Players.startGame(this.mockMvc, alice, "snake");

		// Neither another player nor a guest can put a score on Alice's run.
		Players.finishGame(this.mockMvc, mallory, aliceRun, 253, Map.of())
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("FORBIDDEN"));
		Players.finishGame(this.mockMvc, null, aliceRun, 253, Map.of()).andExpect(status().isForbidden());

		// The run is untouched, so Alice can still finish it herself.
		Players.finishGame(this.mockMvc, alice, aliceRun, 9, Map.of())
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.score").value(9));
		this.mockMvc.perform(get("/api/users/me").session(mallory)).andExpect(jsonPath("$.xp").value(0));
	}

	@Test
	void aScoreIsStoredWithItsPlayerAndWhatItEarned() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		String run = Players.startGame(this.mockMvc, session, "snake");
		Players.finishGame(this.mockMvc, session, run, 7, Map.of()).andExpect(status().isOk());

		Map<String, Object> row = this.jdbc.queryForMap("""
				SELECT u.username, sc.xp_awarded, sc.personal_best, s.user_id = sc.user_id AS same_user
				FROM scores sc
				JOIN users u ON u.id = sc.user_id
				JOIN game_sessions s ON s.id = sc.game_session_id
				WHERE sc.game_session_id = ?::uuid
				""", run);
		assertThat(row.get("username")).isEqualTo(username);
		assertThat(row.get("xp_awarded")).isEqualTo(85);
		assertThat(row.get("personal_best")).isEqualTo(true);
		assertThat(row.get("same_user")).isEqualTo(true);
	}

	@Test
	void runDetailsAreValidated() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		Players.finishGame(this.mockMvc, session, Players.startGame(this.mockMvc, session, "tetris"), 10,
				Map.of("lines", -1))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		Players.finishGame(this.mockMvc, session, Players.startGame(this.mockMvc, session, "tetris"), 10,
				Map.of("not a name", 1))
			.andExpect(status().isBadRequest());
	}

}
