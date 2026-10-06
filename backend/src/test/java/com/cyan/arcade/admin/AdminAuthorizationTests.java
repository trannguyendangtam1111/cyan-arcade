package com.cyan.arcade.admin;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin-only endpoints, called directly as the app would never call them: a player is refused
 * ({@code 403}), a guest is asked to sign in ({@code 401}), and only {@code ROLE_ADMIN} gets through.
 * The controllers refuse on their own too, without the URL rules.
 */
@IntegrationTest
class AdminAuthorizationTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private AdminController adminController;

	@Autowired
	private AiAccessController aiAccessController;

	@AfterEach
	void clearSecurityContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void anAdminSeesWhatTheyMayDo() throws Exception {
		this.mockMvc.perform(get("/api/admin/overview").session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value("admin"))
			.andExpect(jsonPath("$.role").value("ADMIN"))
			.andExpect(jsonPath("$.privileges", contains("AI_MODE", "UNLIMITED_PACKS", "GRANT_COINS")))
			// The allowance players have, which this admin does not.
			.andExpect(jsonPath("$.playerDailyPackLimit").value(5));
	}

	@Test
	void anAdminMayUseAiMode() throws Exception {
		this.mockMvc.perform(get("/api/ai/access").session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isNoContent());
	}

	@ParameterizedTest
	@ValueSource(strings = { "/api/admin/overview", "/api/ai/access", "/api/admin/anything-else" })
	void aPlayerIsRefused(String path) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		this.mockMvc.perform(get(path).session(player))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("FORBIDDEN"));
		this.mockMvc.perform(post(path).session(player)).andExpect(status().isForbidden());
	}

	@ParameterizedTest
	@ValueSource(strings = { "/api/admin/overview", "/api/ai/access" })
	void aGuestIsAskedToSignIn(String path) throws Exception {
		this.mockMvc.perform(get(path))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
	}

	@Test
	void theControllersCheckTheRoleThemselvesToo() {
		signInAs(Role.USER);
		assertThatExceptionOfType(AccessDeniedException.class).isThrownBy(this.aiAccessController::access);
		assertThatExceptionOfType(AccessDeniedException.class)
			.isThrownBy(() -> this.adminController.overview(new AuthenticatedUser(1L, "player", Role.USER)));

		signInAs(Role.ADMIN);
		assertThatNoException().isThrownBy(this.aiAccessController::access);
	}

	/** A signed-in player of the given role, without going through HTTP. */
	private static void signInAs(Role role) {
		AuthenticatedUser user = new AuthenticatedUser(1L, "someone", role);
		SecurityContextHolder.getContext()
			.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(user, null, role.authorities()));
	}

}
