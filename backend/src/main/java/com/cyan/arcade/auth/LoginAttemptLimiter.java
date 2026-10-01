package com.cyan.arcade.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.cyan.arcade.common.error.ApiException;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing: after a few failed logins for the same username from the same
 * address, further attempts are refused for a while, without the password even being checked.
 *
 * <p>Failures are counted per username and address, in memory. Counting per pair rather than per
 * username keeps someone else from locking a player out of their own account just by failing on
 * purpose, as long as the two come from different addresses. Behind a reverse proxy every request
 * has the proxy's address, so there the limit is effectively per username.
 *
 * <p>This is a speed bump, not a vault door: the counts are lost on restart and are not shared
 * between instances.
 */
@Component
@EnableConfigurationProperties(LoginAttemptLimiter.Limits.class)
class LoginAttemptLimiter {

	static final String TOO_MANY_LOGIN_ATTEMPTS = "TOO_MANY_LOGIN_ATTEMPTS";

	/** A bound on memory: how many username and address pairs are remembered at once. */
	static final int MAX_TRACKED = 10_000;

	private static final int MAX_USERNAME_LENGTH = 64;

	/**
	 * @param maxFailures failed logins allowed within the window
	 * @param window how long failures are remembered, counted from the first one
	 */
	@ConfigurationProperties("app.auth.login")
	record Limits(@DefaultValue("5") int maxFailures, @DefaultValue("5m") Duration window) {
	}

	private record Failures(int count, Instant since) {
	}

	private final Map<String, Failures> failures = new ConcurrentHashMap<>();

	private final Limits limits;

	private final Clock clock;

	LoginAttemptLimiter(Limits limits, Clock clock) {
		this.limits = limits;
		this.clock = clock;
	}

	/**
	 * Call before checking a password.
	 * @throws ApiException 429 when this username has failed too often from this address lately
	 */
	void check(String username, String address) {
		Failures recent = current(key(username, address));
		if (recent != null && recent.count() >= this.limits.maxFailures()) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_LOGIN_ATTEMPTS,
					"Too many failed attempts. Please wait a few minutes and try again.");
		}
	}

	void recordFailure(String username, String address) {
		Instant now = this.clock.instant();
		this.failures.merge(key(username, address), new Failures(1, now),
				(known, first) -> isExpired(known, now) ? first : new Failures(known.count() + 1, known.since()));
		if (this.failures.size() > MAX_TRACKED) {
			makeRoom(now);
		}
	}

	/** A successful login wipes the slate clean. */
	void recordSuccess(String username, String address) {
		this.failures.remove(key(username, address));
	}

	int tracked() {
		return this.failures.size();
	}

	private Failures current(String key) {
		Failures known = this.failures.get(key);
		if (known != null && isExpired(known, this.clock.instant())) {
			this.failures.remove(key, known);
			return null;
		}
		return known;
	}

	private boolean isExpired(Failures known, Instant now) {
		return !now.isBefore(known.since().plus(this.limits.window()));
	}

	/** Forgets what has expired, and if that is not enough, as many other entries as it takes. */
	private void makeRoom(Instant now) {
		this.failures.values().removeIf((known) -> isExpired(known, now));
		Iterator<String> keys = this.failures.keySet().iterator();
		while (this.failures.size() > MAX_TRACKED && keys.hasNext()) {
			keys.next();
			keys.remove();
		}
	}

	private static String key(String username, String address) {
		String name = username.strip().toLowerCase(Locale.ROOT);
		if (name.length() > MAX_USERNAME_LENGTH) {
			name = name.substring(0, MAX_USERNAME_LENGTH);
		}
		return name + '|' + address;
	}

}
