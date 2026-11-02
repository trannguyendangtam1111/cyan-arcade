package com.cyan.arcade.common.security;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real security chain, endpoint stubs, no database. */
@WebMvcTest(controllers = RequestRateLimitSecurityTests.Endpoints.class, properties = {
		"app.security.request-limits.registration-max=1", "app.security.request-limits.login-max=1",
		"app.security.request-limits.game-session-max=1" })
@Import({ SecurityConfig.class, ProblemDetailSecurityHandler.class, RequestRateLimitSecurityTests.ClockConfig.class,
		RequestRateLimitSecurityTests.Endpoints.class })
class RequestRateLimitSecurityTests {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private RequestRateLimitFilterTests.TestClock clock;

	@Test
	void registrationReturnsConsistentProblemsAndRecoversWithoutBlockingLoginOrRestoration() throws Exception {
		String address = "203.0.113.10";
		this.mvc.perform(post("/api/auth/register").with(csrf()).with((request) -> {
			request.setRemoteAddr(address);
			return request;
		})).andExpect(status().isOk());
		this.mvc.perform(post("/api/auth/register").with(csrf()).with((request) -> {
			request.setRemoteAddr(address);
			return request;
		})).andExpect(status().isTooManyRequests())
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"))
			.andExpect(jsonPath("$.status").value(429))
			.andExpect(jsonPath("$.timestamp").exists())
			.andExpect(jsonPath("$.instance").value("/api/auth/register"))
			.andExpect(header().string("Retry-After", "3600"));
		this.mvc.perform(post("/api/auth/login").with(csrf()).with((request) -> {
			request.setRemoteAddr(address);
			return request;
		})).andExpect(status().isOk());
		for (int index = 0; index < 3; index++) {
			this.mvc.perform(get("/api/auth/session").with(user("pixel"))).andExpect(status().isOk());
		}
		this.clock.advance(Duration.ofHours(1));
		this.mvc.perform(post("/api/auth/register").with(csrf()).with((request) -> {
			request.setRemoteAddr(address);
			return request;
		})).andExpect(status().isOk());
	}

	@Test
	void csrfRunsBeforeTheCounterAndLogoutRetainsItsSecurityBehavior() throws Exception {
		for (int index = 0; index < 3; index++) {
			this.mvc.perform(post("/api/auth/register")).andExpect(status().isForbidden());
		}
		this.mvc.perform(post("/api/auth/register").with(csrf())).andExpect(status().isOk());
		this.mvc.perform(post("/api/auth/logout")).andExpect(status().isForbidden());
		this.mvc.perform(post("/api/auth/logout").session(new MockHttpSession()).with(user("pixel")).with(csrf()))
			.andExpect(status().isNoContent());
	}

	@Test
	void guestsCannotBypassTheGameSessionBudgetWithForwardedHeaders() throws Exception {
		for (int index = 0; index < 2; index++) {
			this.mvc.perform(post("/api/game-sessions").with(csrf())
				.header("X-Forwarded-For", "198.51.100." + index)
				.header("Forwarded", "for=198.51.100." + index))
				.andExpect(index == 0 ? status().isOk() : status().isTooManyRequests());
		}
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class ClockConfig {
		@Bean
		RequestRateLimitFilterTests.TestClock clock() {
			return new RequestRateLimitFilterTests.TestClock();
		}
	}

	@RestController
	@TestComponent
	static class Endpoints {
		@PostMapping({ "/api/auth/register", "/api/auth/login", "/api/game-sessions" })
		String create() {
			return "ok";
		}

		@GetMapping("/api/auth/session")
		String session() {
			return "ok";
		}
	}

}
