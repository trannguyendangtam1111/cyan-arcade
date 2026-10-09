package com.cyan.arcade.profile;

import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A player's own profile, statistics, history and achievements. */
@IntegrationTest
class ProfileApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void aNewPlayerStartsAtLevelOneWithNothingPlayed() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);

		me(session).andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value(username))
			.andExpect(jsonPath("$.avatar").value("ROBOT"))
			.andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.level").value(1))
			.andExpect(jsonPath("$.xpIntoLevel").value(0))
			.andExpect(jsonPath("$.xpForNextLevel").value(100))
			.andExpect(jsonPath("$.gamesPlayed").value(0))
			.andExpect(jsonPath("$.totalScore").value(0))
			.andExpect(jsonPath("$.achievementsUnlocked").value(0))
			.andExpect(jsonPath("$.achievementsTotal").value(40))
			.andExpect(jsonPath("$.memberSince").exists())
			.andExpect(jsonPath("$.passwordHash").doesNotExist())
			.andExpect(jsonPath("$.password").doesNotExist());
	}

	@Test
	void statisticsAddUpTheGamesAPlayerHasFinished() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 12);
		Players.play(this.mockMvc, session, "tetris", 3000);
		Players.play(this.mockMvc, session, "snake", 5);

		me(session).andExpect(jsonPath("$.gamesPlayed").value(3)).andExpect(jsonPath("$.totalScore").value(3017));
	}

	@Test
	void aPlayerCanChangeTheirAvatar() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		update(session, "{\"avatar\":\"GHOST\"}").andExpect(status().isOk()).andExpect(jsonPath("$.avatar").value("GHOST"));

		me(session).andExpect(jsonPath("$.avatar").value("GHOST"));
	}

	@Test
	void anUnknownAvatarIsRejected() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		update(session, "{\"avatar\":\"DRAGON\"}").andExpect(status().isBadRequest());
		// Every field is optional: an empty update changes nothing.
		update(session, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.avatar").value("ROBOT"));
	}

	@Test
	void aPlayerCannotEditWhatIsEarned() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);

		// XP, level and the name are not part of what an update accepts; extra fields change nothing.
		update(session, "{\"avatar\":\"CAT\",\"xp\":99999,\"level\":50,\"username\":\"admin\",\"id\":1}")
			.andExpect(status().isOk());

		me(session).andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.level").value(1))
			.andExpect(jsonPath("$.username").value(username))
			.andExpect(jsonPath("$.avatar").value("CAT"));
	}

	@Test
	void gameHistoryListsThePlayersGamesNewestFirst() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.play(this.mockMvc, session, "snake", 12);
		Players.play(this.mockMvc, session, "2048", 1500, Map.of("highestTile", 128));
		Players.play(this.mockMvc, session, "snake", 5);

		history(session, "").andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[*].gameSlug", contains("snake", "2048", "snake")))
			.andExpect(jsonPath("$.entries[*].gameName", contains("Snake", "2048", "Snake")))
			.andExpect(jsonPath("$.entries[*].score", contains(5, 1500, 12)))
			// The first Snake game and the 2048 game were bests; the weaker second Snake game was not.
			.andExpect(jsonPath("$.entries[*].personalBest", contains(false, true, true)))
			.andExpect(jsonPath("$.entries[0].xpEarned").value(10))
			.andExpect(jsonPath("$.entries[0].playedAt").exists())
			.andExpect(jsonPath("$.entries[0].durationMs").isNumber())
			.andExpect(jsonPath("$.totalEntries").value(3))
			.andExpect(jsonPath("$.totalPages").value(1));
	}

	@Test
	void gameHistoryIsPaged() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		for (int score = 1; score <= 5; score++) {
			Players.play(this.mockMvc, session, "snake", score);
		}

		history(session, "?size=2").andExpect(jsonPath("$.entries[*].score", contains(5, 4)))
			.andExpect(jsonPath("$.totalEntries").value(5))
			.andExpect(jsonPath("$.totalPages").value(3));
		history(session, "?size=2&page=2").andExpect(jsonPath("$.entries[*].score", contains(1)));
		history(session, "?size=0").andExpect(status().isBadRequest());
		history(session, "?size=51").andExpect(status().isBadRequest());
	}

	@Test
	void aPlayerOnlyEverSeesTheirOwnData() throws Exception {
		MockHttpSession alice = Players.register(this.mockMvc);
		MockHttpSession bob = Players.register(this.mockMvc);
		Players.play(this.mockMvc, alice, "snake", 30);
		Players.play(this.mockMvc, null, "snake", 40); // a guest

		history(bob, "").andExpect(jsonPath("$.entries", hasSize(0)));
		me(bob).andExpect(jsonPath("$.gamesPlayed").value(0)).andExpect(jsonPath("$.xp").value(0));
		achievements(bob).andExpect(jsonPath("$[*].unlocked", everyItem(is(false))));

		history(alice, "").andExpect(jsonPath("$.entries", hasSize(1)));
	}

	@Test
	void thereIsNoWayToAskForAnotherPlayersProfile() throws Exception {
		MockHttpSession alice = Players.register(this.mockMvc);
		MockHttpSession bob = Players.register(this.mockMvc);
		Integer aliceId = JsonPath.read(me(alice).andReturn().getResponse().getContentAsString(), "$.id");

		// Their own data is only under /me; an id in the path leads nowhere (the public profile is by
		// username, and read-only).
		this.mockMvc.perform(get("/api/users/" + aliceId).session(bob)).andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/users/" + aliceId + "/game-history").session(bob)).andExpect(status().isNotFound());
		this.mockMvc
			.perform(patch("/api/users/" + aliceId).session(bob)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"avatar\":\"CAT\"}"))
			.andExpect(status().isNotFound());
		me(alice).andExpect(jsonPath("$.avatar").value("ROBOT"));
	}

	@Test
	void achievementsListTheWholeCatalogWithWhatIsUnlocked() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		achievements(session).andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(40)))
			.andExpect(jsonPath("$[0].code").value("FIRST_GAME"))
			.andExpect(jsonPath("$[0].name").value("First Coin"))
			.andExpect(jsonPath("$[0].description").isNotEmpty())
			.andExpect(jsonPath("$[0].xp").value(50))
			.andExpect(jsonPath("$[0].unlocked").value(false))
			.andExpect(jsonPath("$[0].unlockedAt").doesNotExist());

		Players.play(this.mockMvc, session, "snake", 3);

		achievements(session).andExpect(jsonPath("$[0].unlocked").value(true))
			.andExpect(jsonPath("$[0].unlockedAt").exists())
			.andExpect(jsonPath("$[1].unlocked").value(false));
		me(session).andExpect(jsonPath("$.achievementsUnlocked").value(1));
	}

	private ResultActions me(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/users/me").session(session));
	}

	private ResultActions update(MockHttpSession session, String body) throws Exception {
		return this.mockMvc
			.perform(patch("/api/users/me").session(session).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions history(MockHttpSession session, String query) throws Exception {
		return this.mockMvc.perform(get("/api/users/me/game-history" + query).session(session));
	}

	private ResultActions achievements(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/users/me/achievements").session(session));
	}

}
