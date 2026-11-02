package com.cyan.arcade.common.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class RequestRateLimitFilterTests {

	private static final String HOME = "203.0.113.7";

	private final TestClock clock = new TestClock();

	private final RequestRateLimitFilter filter = new RequestRateLimitFilter(
			new RequestRateLimitFilter.Limits(2, Duration.ofMinutes(1), 3, Duration.ofMinutes(1), 4, Duration.ofMinutes(1)),
			this.clock, JsonMapper.builder().findAndAddModules().build());

	@Test
	void registrationAndGameSessionLimitsCountAllAttemptsAndRecoverAtTheWindowBoundary() throws Exception {
		for (String path : List.of("/api/auth/register", "/api/auth/login", "/api/game-sessions")) {
			int max = path.endsWith("register") ? 2 : path.endsWith("login") ? 3 : 4;
			for (int index = 0; index < max; index++) {
				assertThat(send(this.filter, "POST", path, HOME).getStatus()).isEqualTo(204);
			}
			MockHttpServletResponse blocked = send(this.filter, "POST", path, HOME);
			assertThat(blocked.getStatus()).isEqualTo(429);
			assertThat(blocked.getHeader("Retry-After")).isEqualTo("60");
		}
		this.clock.advance(Duration.ofSeconds(59));
		assertThat(send(this.filter, "POST", "/api/auth/register", HOME).getHeader("Retry-After")).isEqualTo("1");
		this.clock.advance(Duration.ofSeconds(1));
		assertThat(send(this.filter, "POST", "/api/auth/register", HOME).getStatus()).isEqualTo(204);
		assertThat(send(this.filter, "POST", "/api/auth/login", HOME).getStatus()).isEqualTo(204);
		assertThat(send(this.filter, "POST", "/api/game-sessions", HOME).getStatus()).isEqualTo(204);
	}

	@Test
	void routesAndAddressesHaveSeparateBudgets() throws Exception {
		send(this.filter, "POST", "/api/auth/register", HOME);
		send(this.filter, "POST", "/api/auth/register", HOME);
		assertThat(send(this.filter, "POST", "/api/auth/register", HOME).getStatus()).isEqualTo(429);
		assertThat(send(this.filter, "POST", "/api/auth/register", "198.51.100.20").getStatus()).isEqualTo(204);
		assertThat(send(this.filter, "POST", "/api/auth/login", HOME).getStatus()).isEqualTo(204);
		assertThat(send(this.filter, "POST", "/api/game-sessions", HOME).getStatus()).isEqualTo(204);
	}

	@Test
	void forwardedHeadersAndNewCookiesCannotChangeTheSocketAddressBudget() throws Exception {
		for (int index = 0; index < 3; index++) {
			MockHttpServletRequest request = request("POST", "/api/auth/register", HOME);
			request.addHeader("X-Forwarded-For", "198.51.100." + index);
			request.addHeader("Forwarded", "for=198.51.100." + index);
			request.addHeader("Cookie", "CYAN_SESSION=changed-" + index);
			assertThat(send(this.filter, request).getStatus()).isEqualTo(index < 2 ? 204 : 429);
		}
	}

	@Test
	void decodedServletPathsShareTheSameBudget() throws Exception {
		for (int index = 0; index < 3; index++) {
			MockHttpServletRequest request = request("POST", "/api/auth/%72egister", HOME);
			request.setServletPath("/api/auth/register");
			assertThat(send(this.filter, request).getStatus()).isEqualTo(index < 2 ? 204 : 429);
		}
	}

	@Test
	void restorationLogoutAndFinishingExistingGameSessionsAreNeverCounted() throws Exception {
		for (int index = 0; index < 10; index++) {
			assertThat(send(this.filter, "GET", "/api/auth/session", HOME).getStatus()).isEqualTo(204);
			assertThat(send(this.filter, "POST", "/api/auth/logout", HOME).getStatus()).isEqualTo(204);
			assertThat(send(this.filter, "POST", "/api/game-sessions/run-id/finish", HOME).getStatus()).isEqualTo(204);
		}
		assertThat(this.filter.tracked()).isZero();
	}

	@Test
	void concurrentRequestsCannotAllPassTheSameCounter() throws Exception {
		List<Callable<Integer>> attempts = new ArrayList<>();
		for (int index = 0; index < 20; index++) {
			attempts.add(() -> send(this.filter, "POST", "/api/auth/register", HOME).getStatus());
		}
		try (var executor = Executors.newFixedThreadPool(8)) {
			List<Integer> statuses = new ArrayList<>();
			for (var result : executor.invokeAll(attempts)) {
				statuses.add(result.get());
			}
			assertThat(statuses).filteredOn((status) -> status == 204).hasSize(2);
			assertThat(statuses).filteredOn((status) -> status == 429).hasSize(18);
		}
	}

	@Test
	void memoryIsBoundedWithoutEvictingLiveLimitsAndExpiredCapacityIsRecovered() throws Exception {
		for (int index = 0; index < RequestRateLimitFilter.MAX_TRACKED; index++) {
			String address = "198.18." + index / 256 + "." + index % 256;
			assertThat(send(this.filter, "POST", "/api/auth/register", address).getStatus()).isEqualTo(204);
		}
		assertThat(send(this.filter, "POST", "/api/auth/register", HOME).getStatus()).isEqualTo(429);
		assertThat(this.filter.tracked()).isEqualTo(RequestRateLimitFilter.MAX_TRACKED);
		this.clock.advance(Duration.ofMinutes(1));
		assertThat(send(this.filter, "POST", "/api/auth/register", HOME).getStatus()).isEqualTo(204);
		assertThat(this.filter.tracked()).isEqualTo(1);
	}

	@Test
	void invalidConfigurationIsRejected() {
		assertThatIllegalArgumentException().isThrownBy(() -> new RequestRateLimitFilter.Limits(0, Duration.ofHours(1),
				30, Duration.ofMinutes(1), 60, Duration.ofMinutes(1)));
		assertThatIllegalArgumentException().isThrownBy(() -> new RequestRateLimitFilter.Limits(5, Duration.ZERO,
				30, Duration.ofMinutes(1), 60, Duration.ofMinutes(1)));
	}

	private MockHttpServletResponse send(RequestRateLimitFilter limiter, String method, String path, String address)
			throws Exception {
		return send(limiter, request(method, path, address));
	}

	private MockHttpServletRequest request(String method, String path, String address) {
		MockHttpServletRequest request = new MockHttpServletRequest(method, path);
		request.setRemoteAddr(address);
		return request;
	}

	private MockHttpServletResponse send(RequestRateLimitFilter limiter, MockHttpServletRequest request) throws Exception {
		MockHttpServletResponse response = new MockHttpServletResponse();
		limiter.doFilter(request, response, (req, res) -> ((HttpServletResponse) res).setStatus(204));
		return response;
	}

	static final class TestClock extends Clock {
		private Instant now = Instant.parse("2026-11-01T00:00:00Z");

		void advance(Duration duration) {
			this.now = this.now.plus(duration);
		}

		@Override
		public Instant instant() {
			return this.now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}
	}

}
