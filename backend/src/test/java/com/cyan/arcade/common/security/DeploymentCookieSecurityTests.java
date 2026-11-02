package com.cyan.arcade.common.security;

import java.time.Clock;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real cookie/CSRF/security chain, endpoint stubs, no database or application server. */
@WebMvcTest(controllers = DeploymentCookieSecurityTests.Endpoints.class, properties = {
		"server.servlet.session.cookie.secure=true",
		"app.cors.allowed-origins=https://arcade.example.invalid"
})
@Import({ SecurityConfig.class, ProblemDetailSecurityHandler.class,
		DeploymentCookieSecurityTests.Endpoints.class, DeploymentCookieSecurityTests.ClockConfig.class })
class DeploymentCookieSecurityTests {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private SecurityContextRepository contexts;

	@Test
	void csrfCookieIsReadableHostOnlyAndSecureEvenWithoutTrustedForwarding() throws Exception {
		var result = this.mvc.perform(get("/api/auth/session").secure(false)).andExpect(status().isOk()).andReturn();
		Cookie cookie = result.getResponse().getCookie("XSRF-TOKEN");
		assertThat(cookie).isNotNull();
		assertThat(cookie.getSecure()).isTrue();
		assertThat(cookie.isHttpOnly()).isFalse();
		assertThat(cookie.getDomain()).isNull();
		assertThat(cookie.getPath()).isEqualTo("/");
		// MockHttpServletResponse does not serialize arbitrary Servlet 6 cookie attributes.
		assertThat(cookie.getAttribute("SameSite")).isEqualTo("Lax");
		this.mvc.perform(post("/api/auth/login").cookie(cookie)).andExpect(status().isForbidden());
		this.mvc.perform(post("/api/auth/login").cookie(cookie).header("X-XSRF-TOKEN", cookie.getValue())
			.header("Origin", "https://arcade.example.invalid")).andExpect(status().isOk())
			.andExpect(header().string("Access-Control-Allow-Origin", "https://arcade.example.invalid"));
	}

	@Test
	void developmentHttpsRetainsTheRepositorySecureCookieDefault() {
		var repository = new SecurityConfig().csrfTokenRepository(false);
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setSecure(true);
		MockHttpServletResponse response = new MockHttpServletResponse();
		repository.saveToken(repository.generateToken(request), request, response);
		assertThat(response.getCookie("XSRF-TOKEN").getSecure()).isTrue();
	}

	@Test
	void rejectsUnapprovedOriginsAndPreservesAdminAuthorization() throws Exception {
		this.mvc.perform(get("/api/auth/session").header("Origin", "https://other.example.invalid"))
			.andExpect(status().isForbidden());
		this.mvc.perform(get("/api/ai/access")).andExpect(status().isUnauthorized());
		this.mvc.perform(get("/api/ai/access").with(user("player").roles("USER")))
			.andExpect(status().isForbidden());
		this.mvc.perform(get("/api/ai/access").with(user("configured-admin").roles("ADMIN")))
			.andExpect(status().isNoContent());
	}

	@Test
	void theSameSavedSessionRestoresAuthenticationAcrossRequests() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest();
		var context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated("configured-admin", null,
				AuthorityUtils.createAuthorityList("ROLE_ADMIN")));
		this.contexts.saveContext(context, request, new MockHttpServletResponse());
		MockHttpSession session = (MockHttpSession) request.getSession(false);
		assertThat(session).isNotNull();
		this.mvc.perform(get("/api/ai/access").session(session)).andExpect(status().isNoContent());
		this.mvc.perform(get("/api/ai/access").session(session)).andExpect(status().isNoContent());
		this.mvc.perform(get("/api/ai/access")).andExpect(status().isUnauthorized());
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class ClockConfig {
		@Bean
		Clock clock() {
			return Clock.systemUTC();
		}
	}

	@RestController
	@TestComponent
	static class Endpoints {
		@GetMapping("/api/auth/session")
		String session() {
			return "ok";
		}

		@PostMapping("/api/auth/login")
		String login() {
			return "ok";
		}

		@GetMapping("/api/ai/access")
		org.springframework.http.ResponseEntity<Void> aiAccess() {
			return org.springframework.http.ResponseEntity.noContent().build();
		}
	}

}
