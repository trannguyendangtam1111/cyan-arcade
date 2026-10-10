package com.cyan.arcade.chess;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.cyan.arcade.common.error.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * How often one account may ask the engine for something (a hint, an engine move, an evaluation, a
 * review): at most {@code app.chess.requests-per-minute} in any minute. Counts are in memory and per
 * instance, like the login limiter: a brake on one account hogging the engines, not a quota system.
 */
@Component
class EngineRateLimiter {

	static final String TOO_MANY_ENGINE_REQUESTS = "TOO_MANY_ENGINE_REQUESTS";

	private static final Duration WINDOW = Duration.ofMinutes(1);

	/** Accounts tracked at most; the quietest are forgotten first. */
	private static final int MAX_ACCOUNTS = 10_000;

	private final int perMinute;

	private final Clock clock;

	private final Map<Long, Deque<Long>> requests = new ConcurrentHashMap<>();

	EngineRateLimiter(ChessAiProperties properties, Clock clock) {
		this.perMinute = properties.requestsPerMinute();
		this.clock = clock;
	}

	/**
	 * Counts a request for an account.
	 * @throws ApiException ({@code 429}) when the account has made too many in the last minute
	 */
	void check(Long userId) {
		long now = this.clock.millis();
		if (this.requests.size() > MAX_ACCOUNTS) {
			forgetQuiet(now);
		}
		Deque<Long> times = this.requests.computeIfAbsent(userId, (id) -> new ArrayDeque<>());
		synchronized (times) {
			while (!times.isEmpty() && times.peekFirst() <= now - WINDOW.toMillis()) {
				times.pollFirst();
			}
			if (times.size() >= this.perMinute) {
				throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_ENGINE_REQUESTS,
						"Too many engine requests. Wait a moment and try again.");
			}
			times.addLast(now);
		}
	}

	private void forgetQuiet(long now) {
		for (Iterator<Map.Entry<Long, Deque<Long>>> it = this.requests.entrySet().iterator(); it.hasNext();) {
			Deque<Long> times = it.next().getValue();
			synchronized (times) {
				if (times.isEmpty() || times.peekLast() <= now - WINDOW.toMillis()) {
					it.remove();
				}
			}
		}
	}

}
