package com.cyan.arcade.profile;

import java.util.Map;
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
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Player identity: the username is the account and never changes; the display name, bio and avatar
 * are the player's to change, checked on the server; the public profile shows what is safe to show.
 */
@IntegrationTest
class PlayerIdentityTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	// --- The own profile -----------------------------------------------------------------------------

	@Test
	void aNewPlayersDisplayNameIsTheirUsernameAndTheyHaveNoBio() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);

		me(session).andExpect(jsonPath("$.username").value(username))
			.andExpect(jsonPath("$.displayName").value(username))
			.andExpect(jsonPath("$.bio").value(nullValue()))
			.andExpect(jsonPath("$.role").value("USER"));
		this.mockMvc.perform(get("/api/auth/session").session(session))
			.andExpect(jsonPath("$.user.displayName").value(username));
	}

	@Test
	void aPlayerChangesTheirDisplayNameBioAndAvatarAndKeepsTheirUsername() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);

		update(session, """
				{"displayName": "  Cyan   the  Great ", "bio": "  Java backend developer building things.\\n  ", "avatar": "ROCKET"}
				""").andExpect(status().isOk())
			// Tidied on the server: no blank edges, one space between words.
			.andExpect(jsonPath("$.displayName").value("Cyan the Great"))
			.andExpect(jsonPath("$.bio").value("Java backend developer building things."))
			.andExpect(jsonPath("$.avatar").value("ROCKET"))
			.andExpect(jsonPath("$.username").value(username));

		// The session, and so the header, follow; signing in still takes the username.
		this.mockMvc.perform(get("/api/auth/session").session(session))
			.andExpect(jsonPath("$.user.displayName").value("Cyan the Great"))
			.andExpect(jsonPath("$.user.username").value(username));
		this.mockMvc
			.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, Players.PASSWORD)))
			.andExpect(status().isOk());
	}

	@Test
	void fieldsLeftOutStayAsTheyAreAndAnEmptyBioRemovesIt() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		update(session, "{\"displayName\":\"Pixel Pal\",\"bio\":\"Hello!\"}").andExpect(status().isOk());

		update(session, "{\"avatar\":\"CAT\"}").andExpect(jsonPath("$.displayName").value("Pixel Pal"))
			.andExpect(jsonPath("$.bio").value("Hello!"));
		update(session, "{\"bio\":\"   \"}").andExpect(status().isOk()).andExpect(jsonPath("$.bio").value(nullValue()));
		me(session).andExpect(jsonPath("$.displayName").value("Pixel Pal")).andExpect(jsonPath("$.avatar").value("CAT"));
	}

	@Test
	void displayNamesInOtherAlphabetsAreWelcome() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		update(session, "{\"displayName\":\"Trần Đăng Tâm\"}").andExpect(status().isOk())
			.andExpect(jsonPath("$.displayName").value("Trần Đăng Tâm"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "   ", "A", "This name is far too long for a badge", "<script>", "Bell\\u0007", "Smile 😀" })
	void aDisplayNameMustBeShortReadableText(String displayName) throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		update(session, "{\"displayName\":\"%s\"}".formatted(displayName)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("displayName"));
	}

	@Test
	void aBioHasALimit() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		update(session, "{\"bio\":\"%s\"}".formatted("a".repeat(161))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("bio"));
		update(session, "{\"bio\":\"bad\\u0000byte\"}").andExpect(status().isBadRequest());
		update(session, "{\"bio\":\"%s\"}".formatted("a".repeat(160))).andExpect(status().isOk());
		update(session, "{\"bio\":\"two\\nlines\"}").andExpect(jsonPath("$.bio").value("two\nlines"));
	}

	@Test
	void anAvatarMustBeOneOfTheArcades() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		update(session, "{\"avatar\":\"DRAGON\"}").andExpect(status().isBadRequest());
		update(session, "{\"avatar\":\"https://example.com/me.png\"}").andExpect(status().isBadRequest());
	}

	@Test
	void nothingButTheThreeFieldsCanBeChanged() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		Long id = Players.userId(this.mockMvc, session);

		update(session, """
				{"displayName": "Sneaky", "username": "admin", "role": "ADMIN", "coins": 99999, "xp": 99999,
				 "gamesPlayed": 500, "achievementsUnlocked": 9, "title": {"code": "TITLE_LEGEND"},
				 "memberSince": "2020-01-01T00:00:00Z", "id": 1}
				""").andExpect(status().isOk());

		me(session).andExpect(jsonPath("$.displayName").value("Sneaky"))
			.andExpect(jsonPath("$.username").value(username))
			.andExpect(jsonPath("$.role").value("USER"))
			.andExpect(jsonPath("$.coins").value(0))
			.andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.gamesPlayed").value(0))
			.andExpect(jsonPath("$.achievementsUnlocked").value(0))
			.andExpect(jsonPath("$.title").value(nullValue()));
		assertThat(this.jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, id)).isEqualTo("USER");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM user_inventory WHERE user_id = ?", Integer.class, id))
			.isZero();
		// And the admin account was not touched either.
		this.mockMvc.perform(get("/api/users/admin/profile")).andExpect(jsonPath("$.displayName").value("admin"));
	}

	@Test
	void onlyASignedInPlayerCanChangeAProfileAndOnlyTheirOwn() throws Exception {
		this.mockMvc
			.perform(patch("/api/users/me").contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"Ghost\"}"))
			.andExpect(status().isUnauthorized());

		String alice = Players.uniqueName();
		Players.register(this.mockMvc, alice);
		MockHttpSession bob = Players.register(this.mockMvc);
		// There is no endpoint that takes someone else's name or id for a change.
		this.mockMvc
			.perform(patch("/api/users/{name}/profile", alice).session(bob)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"displayName\":\"Hacked\"}"))
			.andExpect(status().isMethodNotAllowed());
		this.mockMvc.perform(get("/api/users/{name}/profile", alice)).andExpect(jsonPath("$.displayName").value(alice));
	}

	// --- The public profile --------------------------------------------------------------------------

	@Test
	void anyoneCanSeeAPlayersPublicProfile() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		update(session, "{\"displayName\":\"Arcade Ace\",\"bio\":\"Tetris every day.\",\"avatar\":\"CROWN\"}");
		Players.play(this.mockMvc, session, "tetris", 1500, Map.of("lines", 12));

		// Any case: usernames are case-insensitive.
		this.mockMvc.perform(get("/api/users/{name}/profile", username.toUpperCase()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value(username))
			.andExpect(jsonPath("$.displayName").value("Arcade Ace"))
			.andExpect(jsonPath("$.bio").value("Tetris every day."))
			.andExpect(jsonPath("$.avatar").value("CROWN"))
			.andExpect(jsonPath("$.role").value("USER"))
			.andExpect(jsonPath("$.level").value(2))
			.andExpect(jsonPath("$.memberSince").isNotEmpty())
			.andExpect(jsonPath("$.stats.gamesPlayed").value(1))
			.andExpect(jsonPath("$.stats.totalScore").value(1500))
			.andExpect(jsonPath("$.stats.games[0].slug").value("tetris"))
			.andExpect(jsonPath("$.stats.games[0].bestScore").value(1500))
			.andExpect(jsonPath("$.achievements[*].code", contains("FIRST_GAME", "TETRIS_10_LINES")))
			.andExpect(jsonPath("$.achievementsTotal").value(40))
			.andExpect(jsonPath("$.ranks.games[?(@.game.slug == 'tetris')].allTime.score", contains(1500)))
			.andExpect(jsonPath("$.you").value(false));
	}

	@Test
	void aPublicProfileLeavesOutWhatIsPrivate() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		Long id = Players.userId(this.mockMvc, session);
		Players.grantCoins(this.mockMvc, id, 1500);
		buy(session, "PACK_TRIO");
		buy(session, "BADGE_GOLD_COIN");

		String body = this.mockMvc.perform(get("/api/users/{name}/profile", username))
			.andExpect(status().isOk())
			// What the player wears is public, what they own is not.
			.andExpect(jsonPath("$.badge.name").value("Gold Coin"))
			.andExpect(jsonPath("$.title").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();

		assertThat(body).doesNotContain("\"id\"")
			.doesNotContain("coins")
			.doesNotContain("Pack Trio")
			.doesNotContain("PACK_TRIO")
			.doesNotContain("bonusPacks")
			.doesNotContain("password")
			.doesNotContain("transactions")
			.doesNotContain("ADMIN_GRANT");
	}

	@Test
	void theOwnerIsToldItIsTheirs() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);

		this.mockMvc.perform(get("/api/users/{name}/profile", username).session(session))
			.andExpect(jsonPath("$.you").value(true));
		this.mockMvc.perform(get("/api/users/{name}/profile", username).session(Players.register(this.mockMvc)))
			.andExpect(jsonPath("$.you").value(false));
	}

	@Test
	void anUnknownPlayerIsNotFound() throws Exception {
		this.mockMvc.perform(get("/api/users/{name}/profile", "nobody_" + UUID.randomUUID().toString().substring(0, 8)))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	void anAdminsPublicProfileSaysTheyAreAnAdmin() throws Exception {
		this.mockMvc.perform(get("/api/users/admin/profile"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("ADMIN"));
	}

	// --- Leaderboards ----------------------------------------------------------------------------------

	@Test
	void leaderboardsShowTheDisplayNameAndKeepTheUsernameForLinks() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		Players.play(this.mockMvc, session, "snake", 250);
		update(session, "{\"displayName\":\"Snake Charmer\"}");
		// A new name changes nothing about whose score it is.
		Players.play(this.mockMvc, session, "snake", 251);

		this.mockMvc.perform(get("/api/leaderboards/snake?period=DAILY&size=100").session(session))
			.andExpect(jsonPath("$.entries[?(@.you == true)].player.username", contains(username)))
			.andExpect(jsonPath("$.entries[?(@.you == true)].player.displayName", contains("Snake Charmer")))
			.andExpect(jsonPath("$.entries[?(@.you == true)].score", contains(251)))
			.andExpect(jsonPath("$.entries[*].player.username", not(hasItem("Snake Charmer"))))
			.andExpect(jsonPath("$.myScore").value(251));
	}

	private void buy(MockHttpSession session, String code) throws Exception {
		Long itemId = this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
		this.mockMvc
			.perform(post("/api/shop/purchases").session(session)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId, UUID.randomUUID())))
			.andExpect(status().isCreated());
	}

	private ResultActions me(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(get("/api/users/me").session(session));
	}

	private ResultActions update(MockHttpSession session, String body) throws Exception {
		return this.mockMvc
			.perform(patch("/api/users/me").session(session).contentType(MediaType.APPLICATION_JSON).content(body));
	}

}
