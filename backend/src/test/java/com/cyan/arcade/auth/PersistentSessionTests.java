package com.cyan.arcade.auth;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.CyanArcadeApplication;
import com.cyan.arcade.Players;
import com.cyan.arcade.chess.FakeStockfish;
import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.jayway.jsonpath.JsonPath;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.session.Session;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

/** Real HTTP cookies and PostgreSQL, including destruction/recreation of the whole application. */
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PersistentSessionTests {

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

	private ConfigurableApplicationContext application;
	private JdbcTemplate jdbc;
	private int port;
	private int gamesBeforeUpgrade;

	@BeforeAll
	void upgradeExistingDatabaseAndStartApplication() {
		// Only the disposable container URL is ever supplied to Flyway or the application.
		Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
			.target("36").load().migrate();
		var oldDatabase = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(),
				POSTGRES.getUsername(), POSTGRES.getPassword()));
		this.gamesBeforeUpgrade = oldDatabase.queryForObject("SELECT count(*) FROM games", Integer.class);
		startApplication();
	}

	private void startApplication() {
		this.application = new SpringApplicationBuilder(CyanArcadeApplication.class, EngineFixture.class)
			.run("--server.port=0", "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
					"--spring.datasource.username=" + POSTGRES.getUsername(),
					"--spring.datasource.password=" + POSTGRES.getPassword(),
					"--app.scheduling.enabled=false", "--app.daily-challenges.generation-enabled=false",
					"--app.admin.seed=true", "--app.admin.username=" + Players.ADMIN_USERNAME,
					"--app.admin.password=" + Players.ADMIN_PASSWORD,
					"--app.security.request-limits.registration-max=10000",
					"--app.security.request-limits.login-max=10000",
					// Deterministic expiration tests call cleanup directly, rather than waiting for cron.
					"--spring.session.jdbc.cleanup-cron=-");
		this.port = ((ServletWebServerApplicationContext) this.application).getWebServer().getPort();
		this.jdbc = this.application.getBean(JdbcTemplate.class);
	}

	@AfterAll
	void stopApplication() {
		if (this.application != null) this.application.close();
	}

	@Test
	void flywayUpgradesExistingDataAndOwnsTheSessionSchema() {
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM games", Integer.class))
			.isEqualTo(this.gamesBeforeUpgrade);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version = '37' AND success",
				Integer.class)).isEqualTo(1);
		assertThat(this.application.getBean(Flyway.class).info().pending()).isEmpty();
		assertThat(this.application.getEnvironment().getProperty("spring.session.jdbc.initialize-schema"))
			.isEqualTo("never");
		assertThat(this.jdbc.queryForObject("SELECT to_regclass('spring_session_attributes')::text", String.class))
			.isEqualTo("spring_session_attributes");
	}

	@Test
	void loginRestoresTheExistingApiContractAndCookiePolicy() throws Exception {
		Client registered = new Client();
		String username = registered.register();
		Client client = new Client();
		client.csrf();
		var login = client.send("POST", "/api/auth/login", credentials(username), true);
		assertStatus(login, 200);
		assertThat(JsonPath.<Boolean>read(login.body(), "$.authenticated")).isTrue();
		assertThat(JsonPath.<String>read(login.body(), "$.user.role")).isEqualTo("USER");
		assertThat(login.body()).doesNotContain("password", "bcrypt", Players.PASSWORD);
		String cookie = login.headers().allValues("Set-Cookie").stream()
			.filter(value -> value.startsWith("CYAN_SESSION=")).findFirst().orElseThrow();
		assertThat(cookie).contains("Path=/", "HttpOnly", "SameSite=Lax")
			.doesNotContain("Domain=", "Max-Age=", "Secure");
		assertThat(client.cookie("XSRF-TOKEN").isHttpOnly()).isFalse();
		assertThat(client.cookie("XSRF-TOKEN").getPath()).isEqualTo("/");
		var restored = client.send("GET", "/api/auth/session", null, false);
		assertStatus(restored, 200);
		assertThat(JsonPath.<String>read(restored.body(), "$.user.username")).isEqualTo(username);
		assertStatus(client.send("GET", "/api/users/me", null, false), 200);
		assertThat(this.jdbc.queryForObject("SELECT max_inactive_interval FROM spring_session WHERE session_id=?",
				Integer.class, client.sessionId())).isEqualTo((int) Duration.ofDays(14).toSeconds());
	}

	@Test
	void sameCookieRestoresUserAdminAndScoreOwnershipAfterTheWholeApplicationRestarts() throws Exception {
		Client player = new Client();
		String username = player.register();
		Client admin = new Client();
		admin.csrf();
		assertStatus(admin.send("POST", "/api/auth/login", credentials(Players.ADMIN_USERNAME, Players.ADMIN_PASSWORD), true), 200);
		var started = player.send("POST", "/api/game-sessions", "{\"gameSlug\":\"snake\"}", true);
		assertStatus(started, 201);
		String run = JsonPath.read(started.body(), "$.id");
		// Same honest timing adjustment as other score API fixtures, confined to Testcontainers.
		this.jdbc.update("UPDATE game_sessions SET started_at=now()-interval '5 minutes' WHERE id=?::uuid", run);
		var finish = player.send("POST", "/api/game-sessions/" + run + "/finish",
				"{\"score\":7,\"details\":{\"length\":10,\"level\":2}}", true);
		assertStatus(finish, 200);
		String cookieBefore = player.cookie("CYAN_SESSION").getValue();
		ConfigurableApplicationContext oldApplication = this.application;
		JdbcIndexedSessionRepository oldRepository = this.application.getBean(JdbcIndexedSessionRepository.class);
		oldApplication.close();
		assertThat(oldApplication.isActive()).isFalse();
		startApplication();
		assertThat(this.application).isNotSameAs(oldApplication);
		assertThat(this.application.getBean(JdbcIndexedSessionRepository.class)).isNotSameAs(oldRepository);

		var restored = player.send("GET", "/api/auth/session", null, false);
		assertStatus(restored, 200);
		assertThat(JsonPath.<String>read(restored.body(), "$.user.username")).isEqualTo(username);
		assertThat(player.cookie("CYAN_SESSION").getValue()).isEqualTo(cookieBefore);
		assertStatus(player.send("GET", "/api/users/me/coins", null, false), 200);
		assertStatus(player.send("GET", "/api/admin/overview", null, false), 403);
		assertStatus(admin.send("GET", "/api/admin/overview", null, false), 200);
		assertStatus(admin.send("GET", "/api/ai/access", null, false), 204);
		var recovered = player.send("GET", "/api/game-sessions/" + run + "/result", null, false);
		assertStatus(recovered, 200);
		assertThat(JsonPath.<Map<String, Object>>read(recovered.body(), "$")).isEqualTo(JsonPath.read(finish.body(), "$"));
		Client stranger = new Client();
		stranger.register();
		assertStatus(stranger.send("GET", "/api/game-sessions/" + run + "/result", null, false), 404);
		// The existing readable CSRF cookie still works on authenticated writes after restart.
		assertStatus(player.send("PATCH", "/api/users/me", "{\"avatar\":\"CAT\"}", true), 200);
	}

	@Test
	void logoutDeletesPersistedSessionAndAttributesAndRejectsAReplayedCookie() throws Exception {
		Client client = new Client();
		client.register();
		String id = client.sessionId();
		String stolenCookie = client.cookie("CYAN_SESSION").getValue();
		String primaryId = this.jdbc.queryForObject("SELECT primary_id FROM spring_session WHERE session_id=?", String.class, id);
		var logout = client.send("POST", "/api/auth/logout", null, true);
		assertStatus(logout, 204);
		assertThat(logout.headers().allValues("Set-Cookie")).anyMatch(value -> value.startsWith("CYAN_SESSION=") && value.contains("Max-Age=0"));
		assertThat(sessionCount(id)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM spring_session_attributes WHERE session_primary_id=?",
				Integer.class, primaryId)).isZero();
		Client replay = new Client();
		replay.sessionCookie(stolenCookie);
		assertStatus(replay.send("GET", "/api/users/me", null, false), 401);
		assertThat(JsonPath.<Boolean>read(replay.send("GET", "/api/auth/session", null, false).body(), "$.authenticated")).isFalse();
	}

	@Test
	void expiredSessionCannotAuthenticateEvenBeforeCleanup() throws Exception {
		Client client = new Client();
		client.register();
		String id = client.sessionId();
		expire(id);
		assertThat(sessionCount(id)).isOne();
		assertStatus(client.send("GET", "/api/users/me", null, false), 401);
		var restored = client.send("GET", "/api/auth/session", null, false);
		assertStatus(restored, 200);
		assertThat(JsonPath.<Boolean>read(restored.body(), "$.authenticated")).isFalse();
	}

	@Test
	void cleanupRemovesOnlyExpiredSessionsAndCascadesToTheirAttributes() throws Exception {
		Client expired = new Client();
		expired.register();
		Client active = new Client();
		active.register();
		String expiredId = expired.sessionId();
		String primaryId = this.jdbc.queryForObject("SELECT primary_id FROM spring_session WHERE session_id=?", String.class, expiredId);
		expire(expiredId);
		this.application.getBean(JdbcIndexedSessionRepository.class).cleanUpExpiredSessions();
		assertThat(sessionCount(expiredId)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM spring_session_attributes WHERE session_primary_id=?",
				Integer.class, primaryId)).isZero();
		assertThat(sessionCount(active.sessionId())).isOne();
		assertStatus(active.send("GET", "/api/users/me", null, false), 200);
	}

	@Test
	void csrfIsRequiredForLoginProfileChangesAndLogout() throws Exception {
		Client client = new Client();
		String username = client.register();
		for (String path : new String[] { "/api/auth/login", "/api/auth/logout" }) {
			var denied = client.send("POST", path, path.endsWith("login") ? credentials(username) : null, false);
			assertStatus(denied, 403);
			assertThat(JsonPath.<String>read(denied.body(), "$.code")).isEqualTo("FORBIDDEN");
		}
		assertStatus(client.send("PATCH", "/api/users/me", "{\"avatar\":\"CAT\"}", false), 403);
		var invalid = HttpRequest.newBuilder(URI.create(baseUrl() + "/api/auth/logout"))
			.header("X-XSRF-TOKEN", "invalid-token").POST(HttpRequest.BodyPublishers.noBody()).build();
		assertStatus(client.http.send(invalid, HttpResponse.BodyHandlers.ofString()), 403);
		assertStatus(client.send("GET", "/api/users/me", null, false), 200);
		assertStatus(client.send("POST", "/api/auth/logout", null, true), 204);
		assertStatus(new Client().send("GET", "/api/admin/overview", null, false), 401);
	}

	@Test
	void loginRotatesAPreexistingAnonymousSessionAndInvalidatesTheOldId() throws Exception {
		Client registered = new Client();
		String username = registered.register();
		String plantedId = UUID.randomUUID().toString();
		long now = System.currentTimeMillis();
		this.jdbc.update("""
				INSERT INTO spring_session
				(primary_id, session_id, creation_time, last_access_time, max_inactive_interval, expiry_time)
				VALUES (?, ?, ?, ?, 1209600, ?)
				""", UUID.randomUUID().toString(), plantedId, now, now, now + Duration.ofDays(14).toMillis());
		String plantedCookie = Base64.getEncoder().encodeToString(plantedId.getBytes(StandardCharsets.UTF_8));
		Client client = new Client();
		client.sessionCookie(plantedCookie);
		client.csrf();
		String oldCsrf = client.cookie("XSRF-TOKEN").getValue();
		assertStatus(client.send("POST", "/api/auth/login", credentials(username), true), 200);
		assertThat(client.sessionId()).isNotEqualTo(plantedId);
		assertThat(client.cookie("XSRF-TOKEN").getValue()).isNotEqualTo(oldCsrf);
		assertThat(sessionCount(plantedId)).isZero();
		assertStatus(client.send("GET", "/api/users/me", null, false), 200);
		Client attacker = new Client();
		attacker.sessionCookie(plantedCookie);
		assertStatus(attacker.send("GET", "/api/users/me", null, false), 401);
	}

	@Test
	void persistedAuthenticationContainsOnlyTheSmallPrincipalAndNoCredentials() throws Exception {
		Client registered = new Client();
		String username = registered.register();
		Client client = new Client();
		client.csrf();
		assertStatus(client.send("POST", "/api/auth/login", credentials(username), true), 200);
		String id = client.sessionId();
		assertThat(this.jdbc.queryForList("""
				SELECT a.attribute_name FROM spring_session_attributes a JOIN spring_session s
				ON s.primary_id=a.session_primary_id WHERE s.session_id=?
				""", String.class, id)).containsExactly(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
		Session session = this.application.getBean(JdbcIndexedSessionRepository.class).findById(id);
		SecurityContext context = session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
		assertThat(context.getAuthentication().getPrincipal()).isInstanceOf(AuthenticatedUser.class);
		assertThat(context.getAuthentication().getCredentials()).isNull();
		assertThat(context.getAuthentication().getDetails()).isNull();
		byte[] bytes = this.jdbc.queryForObject("""
				SELECT a.attribute_bytes FROM spring_session_attributes a JOIN spring_session s
				ON s.primary_id=a.session_primary_id WHERE s.session_id=?
				""", byte[].class, id);
		assertThat(new String(bytes, StandardCharsets.ISO_8859_1))
			.doesNotContain(Players.PASSWORD, "{bcrypt}", "LoginUser", "password_hash");
	}

	private void expire(String id) {
		long past = System.currentTimeMillis() - Duration.ofDays(15).toMillis();
		this.jdbc.update("UPDATE spring_session SET last_access_time=?, expiry_time=? WHERE session_id=?",
				past, past + Duration.ofDays(14).toMillis(), id);
	}

	private int sessionCount(String id) {
		return this.jdbc.queryForObject("SELECT count(*) FROM spring_session WHERE session_id=?", Integer.class, id);
	}

	private String baseUrl() { return "http://localhost:" + this.port; }

	private static String credentials(String username) { return credentials(username, Players.PASSWORD); }

	private static String credentials(String username, String password) {
		return "{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password);
	}

	private static void assertStatus(HttpResponse<String> response, int expected) {
		assertThat(response.statusCode()).as("HTTP response: %s", response.body()).isEqualTo(expected);
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class EngineFixture {
		@Bean
		FakeStockfish fakeStockfish() { return new FakeStockfish(); }

		@Bean
		@Primary
		StockfishEngineAdapter.Launcher fakeLauncher(FakeStockfish fake) { return fake.launcher(); }
	}

	private class Client {
		private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
		private final HttpClient http = HttpClient.newBuilder().cookieHandler(this.cookies)
			.connectTimeout(Duration.ofSeconds(5)).build();

		HttpResponse<String> send(String method, String path, String body, boolean csrf) throws Exception {
			var request = HttpRequest.newBuilder(URI.create(baseUrl() + path)).timeout(Duration.ofSeconds(20));
			if (csrf) request.header("X-XSRF-TOKEN", cookie("XSRF-TOKEN").getValue());
			if (body != null) request.header("Content-Type", "application/json");
			return this.http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
					: HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
		}

		void csrf() throws Exception { assertStatus(send("GET", "/api/auth/session", null, false), 200); }

		String register() throws Exception {
			csrf();
			String username = Players.uniqueName();
			var response = send("POST", "/api/auth/register", credentials(username), true);
			assertStatus(response, 201);
			assertThat(JsonPath.<Boolean>read(response.body(), "$.authenticated")).isTrue();
			return username;
		}

		HttpCookie cookie(String name) {
			return this.cookies.getCookieStore().getCookies().stream()
				.filter(cookie -> cookie.getName().equals(name)).findFirst().orElseThrow();
		}

		String sessionId() {
			return new String(Base64.getDecoder().decode(cookie("CYAN_SESSION").getValue()), StandardCharsets.UTF_8);
		}

		void sessionCookie(String value) throws Exception {
			// Let CookieManager apply the same host/domain rules as a real Set-Cookie response,
			// so rotation replaces this cookie rather than retaining a second artificial one.
			this.cookies.put(URI.create(baseUrl()), Map.of("Set-Cookie",
					java.util.List.of("CYAN_SESSION=" + value + "; Path=/; HttpOnly; SameSite=Lax")));
		}
	}

}
