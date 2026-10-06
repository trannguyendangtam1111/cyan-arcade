package com.cyan.arcade.auth;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.auth.AdminAccountSeeder.AdminProperties;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.Role;
import com.cyan.arcade.user.UserService;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Roles and the seeded admin account: every account is a USER or an ADMIN, the session carries the
 * matching authority, and the admin exists exactly once, with a hashed password.
 */
@IntegrationTest
class RolesAndAdminAccountTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private AdminAccountSeeder seeder;

	@Autowired
	private UserService users;

	@Autowired
	private PasswordEncoder passwordEncoder;

	// --- Seeding ---------------------------------------------------------------------------------

	@Test
	void theAdminAccountIsCreatedAtStartupWithTheAdminRoleAndAHashedPassword() {
		Map<String, Object> admin = this.jdbc.queryForMap(
				"SELECT role, password_hash FROM users WHERE lower(username) = lower(?)", Players.ADMIN_USERNAME);

		assertThat(admin).containsEntry("role", "ADMIN");
		String hash = (String) admin.get("password_hash");
		assertThat(hash).startsWith("{bcrypt}").doesNotContain(Players.ADMIN_PASSWORD);
		assertThat(this.passwordEncoder.matches(Players.ADMIN_PASSWORD, hash)).isTrue();
	}

	@Test
	void seedingAgainChangesNothingAndCreatesNoSecondAdmin() {
		String hashBefore = this.jdbc.queryForObject("SELECT password_hash FROM users WHERE lower(username) = 'admin'",
				String.class);
		int adminsBefore = this.jdbc.queryForObject("SELECT count(*) FROM users WHERE role = 'ADMIN'", Integer.class);

		// What every restart of the application does.
		assertThat(this.seeder.seed()).isFalse();
		assertThat(this.seeder.seed()).isFalse();

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM users WHERE lower(username) = 'admin'", Integer.class))
			.isEqualTo(1);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM users WHERE role = 'ADMIN'", Integer.class))
			.isEqualTo(adminsBefore);
		assertThat(this.jdbc.queryForObject("SELECT password_hash FROM users WHERE lower(username) = 'admin'",
				String.class))
			.isEqualTo(hashBefore);
	}

	@Test
	void aConfiguredAdminIsCreatedOnceAndAPlayerWithThatNameIsNeverPromoted() throws Exception {
		String newAdmin = Players.uniqueName();
		AdminAccountSeeder configured = new AdminAccountSeeder(this.users, this.passwordEncoder,
				new AdminProperties(true, newAdmin, "a-configured-secret"));

		assertThat(configured.seed()).isTrue();
		assertThat(configured.seed()).isFalse();
		assertThat(this.jdbc.queryForObject("SELECT role FROM users WHERE username = ?", String.class, newAdmin))
			.isEqualTo("ADMIN");

		// Someone registered the name first: they stay a player.
		String taken = Players.uniqueName();
		Players.register(this.mockMvc, taken);
		AdminAccountSeeder late = new AdminAccountSeeder(this.users, this.passwordEncoder,
				new AdminProperties(true, taken, "another-secret"));
		assertThat(late.seed()).isFalse();
		assertThat(this.jdbc.queryForObject("SELECT role FROM users WHERE username = ?", String.class, taken))
			.isEqualTo("USER");
	}

	@Test
	void theAdminPasswordIsNeverPartOfTheConfigurationsDescription() {
		assertThat(new AdminProperties(true, "admin", "11112002")).asString().doesNotContain("11112002");
	}

	// --- Signing in --------------------------------------------------------------------------------

	@Test
	void theAdminSignsInAndTheSessionHasTheAdminRole() throws Exception {
		MockHttpSession session = new MockHttpSession();
		login(Players.ADMIN_USERNAME, Players.ADMIN_PASSWORD, session).andExpect(status().isOk())
			.andExpect(jsonPath("$.user.username").value("admin"))
			.andExpect(jsonPath("$.user.role").value("ADMIN"));

		this.mockMvc.perform(get("/api/auth/session").session(session))
			.andExpect(jsonPath("$.user.role").value("ADMIN"));
		assertThat(authoritiesOf(session)).containsExactly("ROLE_ADMIN");
		assertThat(principalOf(session).role()).isEqualTo(Role.ADMIN);
	}

	@Test
	void aPlayerSignsInWithTheUserRole() throws Exception {
		String username = Players.uniqueName();
		Players.register(this.mockMvc, username);
		MockHttpSession session = new MockHttpSession();

		login(username, Players.PASSWORD, session).andExpect(status().isOk())
			.andExpect(jsonPath("$.user.role").value("USER"));

		assertThat(authoritiesOf(session)).containsExactly("ROLE_USER");
		assertThat(principalOf(session).role()).isEqualTo(Role.USER);
	}

	@Test
	void aWrongAdminPasswordIsRefusedLikeAnyOther() throws Exception {
		login(Players.ADMIN_USERNAME, "not-the-admin-password", new MockHttpSession())
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
	}

	@Test
	void nobodyCanSignUpAsAnAdmin() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = new MockHttpSession();

		this.mockMvc
			.perform(post("/api/auth/register").session(session)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"%s\",\"password\":\"%s\",\"role\":\"ADMIN\"}".formatted(username,
						Players.PASSWORD)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.user.role").value("USER"));

		assertThat(authoritiesOf(session)).containsExactly("ROLE_USER");
		this.mockMvc.perform(get("/api/admin/overview").session(session)).andExpect(status().isForbidden());
	}

	@Test
	void theAdminUsernameCannotBeRegisteredAgain() throws Exception {
		this.mockMvc
			.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"ADMIN\",\"password\":\"%s\"}".formatted(Players.PASSWORD)))
			.andExpect(status().isConflict());
	}

	private ResultActions login(String username, String password,
			MockHttpSession session) throws Exception {
		return this.mockMvc.perform(post("/api/auth/login").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)));
	}

	private static SecurityContext contextOf(MockHttpSession session) {
		return (SecurityContext) session
			.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
	}

	private static List<String> authoritiesOf(MockHttpSession session) {
		return contextOf(session).getAuthentication()
			.getAuthorities()
			.stream()
			.map(GrantedAuthority::getAuthority)
			.toList();
	}

	private static AuthenticatedUser principalOf(MockHttpSession session) {
		return (AuthenticatedUser) contextOf(session).getAuthentication().getPrincipal();
	}

}
