package com.cyan.arcade.auth;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Registration, signing in and out, and what is and is not reachable without signing in. */
@IntegrationTest
class AuthApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void registeringCreatesAnAccountAndSignsThePlayerIn() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = new MockHttpSession();

		register(username, Players.PASSWORD, session).andExpect(status().isCreated())
			.andExpect(jsonPath("$.authenticated").value(true))
			.andExpect(jsonPath("$.user.id").isNumber())
			.andExpect(jsonPath("$.user.username").value(username))
			.andExpect(jsonPath("$.user.avatar").value("ROBOT"));

		// The same session is now signed in.
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value(username));
	}

	@Test
	void passwordsAreStoredHashedAndNeverReturned() throws Exception {
		String username = Players.uniqueName();

		String response = register(username, Players.PASSWORD, new MockHttpSession()).andReturn()
			.getResponse()
			.getContentAsString();

		String stored = this.jdbc.queryForObject("SELECT password_hash FROM users WHERE username = ?", String.class,
				username);
		assertThat(stored).startsWith("{bcrypt}$2").doesNotContain(Players.PASSWORD);
		assertThat(response).doesNotContain(Players.PASSWORD).doesNotContain("password").doesNotContain("bcrypt");
	}

	@ParameterizedTest
	@ValueSource(strings = { "ab", "this_name_is_far_too_long", "has space", "semi;colon", "" })
	void rejectsInvalidUsernames(String username) throws Exception {
		register(username, Players.PASSWORD, new MockHttpSession()).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("username"));
	}

	@Test
	void rejectsPasswordsThatAreTooShortWithoutEchoingThem() throws Exception {
		String response = register(Players.uniqueName(), "short12", new MockHttpSession())
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("password"))
			.andReturn()
			.getResponse()
			.getContentAsString();

		assertThat(response).doesNotContain("short12");
	}

	@Test
	void aUsernameCanOnlyBeTakenOnceWhateverItsCase() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);

		register(username.toUpperCase(), Players.PASSWORD, new MockHttpSession()).andExpect(status().isConflict())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("USERNAME_TAKEN"));
	}

	@Test
	void signingInWithTheRightPasswordStartsASession() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);
		MockHttpSession session = new MockHttpSession();

		login(username, Players.PASSWORD, session).andExpect(status().isOk())
			.andExpect(jsonPath("$.authenticated").value(true))
			.andExpect(jsonPath("$.user.username").value(username));

		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(status().isOk());
	}

	@Test
	void theUsernameIsNotCaseSensitiveWhenSigningIn() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);

		login(username.toUpperCase(), Players.PASSWORD, new MockHttpSession()).andExpect(status().isOk())
			// The name is shown the way it was registered.
			.andExpect(jsonPath("$.user.username").value(username));
	}

	@Test
	void aWrongPasswordAndAnUnknownUserLookExactlyTheSame() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);
		MockHttpSession session = new MockHttpSession();

		String wrongPassword = login(username, "not-the-password", session).andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String unknownUser = login(Players.uniqueName(), Players.PASSWORD, new MockHttpSession())
			.andExpect(status().isUnauthorized())
			.andReturn()
			.getResponse()
			.getContentAsString();

		assertThat(JsonPath.<String>read(wrongPassword, "$.detail")).isEqualTo(JsonPath.read(unknownUser, "$.detail"));
		assertThat(JsonPath.<String>read(wrongPassword, "$.code")).isEqualTo(JsonPath.read(unknownUser, "$.code"));
		// A failed attempt does not sign anyone in.
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void repeatedWrongPasswordsAreRefusedEvenWhenTheRightOneFinallyComes() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);
		for (int attempt = 0; attempt < 5; attempt++) {
			login(username, "guess-number-" + attempt, new MockHttpSession()).andExpect(status().isUnauthorized());
		}

		// The sixth attempt is not even checked: right or wrong, it gets the same refusal.
		login(username, "guess-number-6", new MockHttpSession()).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("TOO_MANY_LOGIN_ATTEMPTS"));
		MockHttpSession session = new MockHttpSession();
		login(username, Players.PASSWORD, session).andExpect(status().isTooManyRequests());
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void throttlingOneUsernameDoesNotTouchOthersOrOtherAddresses() throws Exception {
		String guessed = Players.uniqueName();
		String bystander = Players.uniqueName();
		Players.register(this.mockMvc, guessed);
		Players.register(this.mockMvc, bystander);
		for (int attempt = 0; attempt < 5; attempt++) {
			login(guessed, "guess-number-" + attempt, new MockHttpSession());
		}

		login(bystander, Players.PASSWORD, new MockHttpSession()).andExpect(status().isOk());
		// The player themselves, from another address than the guesser's, still gets in.
		this.mockMvc
			.perform(post("/api/auth/login").with((request) -> {
				request.setRemoteAddr("203.0.113.50");
				return request;
			})
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(guessed, Players.PASSWORD)))
			.andExpect(status().isOk());
	}

	@Test
	void aSuccessfulLoginClearsEarlierFailures() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);
		for (int round = 0; round < 3; round++) {
			for (int attempt = 0; attempt < 4; attempt++) {
				login(username, "guess-number-" + attempt, new MockHttpSession()).andExpect(status().isUnauthorized());
			}
			login(username, Players.PASSWORD, new MockHttpSession()).andExpect(status().isOk());
		}
	}

	@Test
	void signingInGivesTheSessionANewId() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);
		MockHttpSession session = new MockHttpSession();
		String idBeforeLogin = session.getId();

		login(username, Players.PASSWORD, session).andExpect(status().isOk());

		// An id an attacker might have planted before the login is worthless afterwards.
		assertThat(session.getId()).isNotEqualTo(idBeforeLogin);
	}

	@Test
	void theSessionEndpointSaysWhoIsSignedIn() throws Exception {
		this.mockMvc.perform(get("/api/auth/session"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.authenticated").value(false))
			.andExpect(jsonPath("$.user").doesNotExist());

		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);

		this.mockMvc.perform(get("/api/auth/session").session(session))
			.andExpect(jsonPath("$.authenticated").value(true))
			.andExpect(jsonPath("$.user.username").value(username));
	}

	@Test
	void signingOutEndsTheSession() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isNoContent());

		assertThat(session.isInvalid()).isTrue();
		this.mockMvc.perform(get("/api/users/me").session(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void requestsThatChangeSomethingNeedAValidCsrfToken() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		String credentials = "{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, Players.PASSWORD);

		// As if another website made the browser send these requests: the cookies go along, the token does not.
		this.mockMvc
			.perform(post("/api/auth/login").with(csrf().useInvalidToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(credentials))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("FORBIDDEN"));
		this.mockMvc
			.perform(patch("/api/users/me").session(session)
				.with(csrf().useInvalidToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"avatar\":\"CAT\"}"))
			.andExpect(status().isForbidden());
		this.mockMvc.perform(post("/api/auth/logout").session(session).with(csrf().useInvalidToken()))
			.andExpect(status().isForbidden());

		// Nothing happened: still signed in, avatar unchanged.
		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.avatar").value("ROBOT"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "/api/users/me", "/api/users/me/game-history", "/api/users/me/achievements" })
	void aPlayersOwnDataNeedsASignedInSession(String path) throws Exception {
		this.mockMvc.perform(get(path))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
	}

	@Test
	void changingAProfileNeedsASignedInSession() throws Exception {
		this.mockMvc.perform(patch("/api/users/me").contentType(MediaType.APPLICATION_JSON).content("{\"avatar\":\"CAT\"}"))
			.andExpect(status().isUnauthorized());
	}

	private ResultActions register(String username, String password, MockHttpSession session) throws Exception {
		return this.mockMvc.perform(post("/api/auth/register").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
	}

	private ResultActions login(String username, String password, MockHttpSession session) throws Exception {
		return this.mockMvc.perform(post("/api/auth/login").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
	}

}
