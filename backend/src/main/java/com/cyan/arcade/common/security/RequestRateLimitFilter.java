package com.cyan.arcade.common.security;

import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import com.cyan.arcade.common.error.Problems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounded, atomic fixed-window counters for expensive public POSTs, after CSRF verification. */
final class RequestRateLimitFilter extends OncePerRequestFilter {

	static final int MAX_TRACKED = 10_000;

	static final String RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED";

	@ConfigurationProperties("app.security.request-limits")
	record Limits(@DefaultValue("5") int registrationMax, @DefaultValue("1h") Duration registrationWindow,
			@DefaultValue("30") int loginMax, @DefaultValue("1m") Duration loginWindow,
			@DefaultValue("60") int gameSessionMax, @DefaultValue("1m") Duration gameSessionWindow) {
		Limits {
			new Rule(registrationMax, registrationWindow);
			new Rule(loginMax, loginWindow);
			new Rule(gameSessionMax, gameSessionWindow);
		}
	}

	private record Rule(int max, Duration window) {
		Rule {
			if (max <= 0 || window == null || window.isZero() || window.isNegative()) {
				throw new IllegalArgumentException("Request limits and windows must be positive");
			}
		}
	}

	private record Key(String path, String address) {
	}

	private record Counter(int count, Instant resetsAt) {
	}

	private final Map<String, Rule> rules;

	private final Map<Key, Counter> counters = new HashMap<>();

	private final Clock clock;

	private final JsonMapper json;

	RequestRateLimitFilter(Limits limits, Clock clock, JsonMapper json) {
		this.clock = clock;
		this.json = json;
		this.rules = Map.of("/api/auth/register", new Rule(limits.registrationMax(), limits.registrationWindow()),
				"/api/auth/login", new Rule(limits.loginMax(), limits.loginWindow()),
				"/api/game-sessions", new Rule(limits.gameSessionMax(), limits.gameSessionWindow()));
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		// Servlet paths are container-decoded, so encoded letters cannot bypass the route budget.
		String path = request.getServletPath();
		if (path.isEmpty()) {
			path = request.getRequestURI().substring(request.getContextPath().length());
		}
		Rule rule = "POST".equals(request.getMethod()) ? this.rules.get(path) : null;
		// Never parse forwarding headers here. Only the container, when explicitly configured for
		// trusted proxies, may change getRemoteAddr(). LoginAttemptLimiter uses the same address.
		long retryAfter = (rule == null) ? 0 : consume(new Key(path, request.getRemoteAddr()), rule);
		if (retryAfter == 0) {
			chain.doFilter(request, response);
			return;
		}
		ProblemDetail problem = Problems.of(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMIT_EXCEEDED,
				"Too many requests. Please try again later.");
		problem.setInstance(URI.create(request.getRequestURI()));
		response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
		response.setHeader("Retry-After", Long.toString(retryAfter));
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		this.json.writeValue(response.getOutputStream(), problem);
	}

	/** Counter checks and updates are atomic; a full store refuses new keys instead of evicting live limits. */
	private synchronized long consume(Key key, Rule rule) {
		Instant now = this.clock.instant();
		Counter counter = this.counters.get(key);
		if (counter != null && !now.isBefore(counter.resetsAt())) {
			this.counters.remove(key);
			counter = null;
		}
		if (counter == null) {
			if (this.counters.size() >= MAX_TRACKED) {
				this.counters.values().removeIf((entry) -> !now.isBefore(entry.resetsAt()));
				if (this.counters.size() >= MAX_TRACKED) {
					Instant earliest = this.counters.values().stream().map(Counter::resetsAt).min(Instant::compareTo).orElseThrow();
					return retryAfter(now, earliest);
				}
			}
			counter = new Counter(0, now.plus(rule.window()));
		}
		if (counter.count() >= rule.max()) {
			return retryAfter(now, counter.resetsAt());
		}
		this.counters.put(key, new Counter(counter.count() + 1, counter.resetsAt()));
		return 0;
	}

	private static long retryAfter(Instant now, Instant resetsAt) {
		Duration remaining = Duration.between(now, resetsAt);
		return Math.max(1, remaining.getSeconds() + ((remaining.getNano() > 0) ? 1 : 0));
	}

	synchronized int tracked() {
		return this.counters.size();
	}

}
