package com.cyan.arcade.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import com.cyan.arcade.auth.LoginAttemptLimiter.Limits;
import com.cyan.arcade.common.error.ApiException;
import org.junit.jupiter.api.Test;

import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/** The rules of login throttling on their own, with a clock the test can move. */
class LoginAttemptLimiterTests {

	private static final String HOME = "203.0.113.7";

	private final MovableClock clock = new MovableClock(Instant.parse("2026-10-01T12:00:00Z"));

	private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(new Limits(3, Duration.ofMinutes(5)), this.clock);

	@Test
	void allowsAttemptsUntilTheLimitIsReached() {
		fail("pixel", HOME, 2);

		assertAllowed("pixel", HOME);
	}

	@Test
	void refusesFurtherAttemptsOnceTheLimitIsReached() {
		fail("pixel", HOME, 3);

		assertThatExceptionOfType(ApiException.class).isThrownBy(() -> this.limiter.check("pixel", HOME))
			.satisfies((ex) -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
				assertThat(ex.getCode()).isEqualTo("TOO_MANY_LOGIN_ATTEMPTS");
			});
	}

	@Test
	void theUsernameIsCountedWhateverItsCaseOrPadding() {
		this.limiter.recordFailure("Pixel", HOME);
		this.limiter.recordFailure("PIXEL ", HOME);
		this.limiter.recordFailure("pixel", HOME);

		assertBlocked("pIxEl", HOME);
	}

	@Test
	void otherUsernamesAndOtherAddressesAreNotAffected() {
		fail("pixel", HOME, 3);

		assertAllowed("zelda", HOME);
		// Someone failing on purpose from elsewhere does not lock the player out at home, and vice versa.
		assertAllowed("pixel", "198.51.100.23");
	}

	@Test
	void theBlockEndsWhenTheWindowHasPassedSinceTheFirstFailure() {
		fail("pixel", HOME, 3);

		this.clock.advance(Duration.ofMinutes(4).plusSeconds(59));
		assertBlocked("pixel", HOME);

		this.clock.advance(Duration.ofSeconds(1));
		assertAllowed("pixel", HOME);
	}

	@Test
	void failuresFromAnOldWindowDoNotCountTowardsANewOne() {
		fail("pixel", HOME, 2);
		this.clock.advance(Duration.ofMinutes(6));

		fail("pixel", HOME, 2);

		assertAllowed("pixel", HOME);
	}

	@Test
	void aSuccessfulLoginForgetsEarlierFailures() {
		fail("pixel", HOME, 2);
		this.limiter.recordSuccess("pixel", HOME);

		fail("pixel", HOME, 2);

		assertAllowed("pixel", HOME);
	}

	@Test
	void remembersOnlyABoundedNumberOfGuessers() {
		for (int guesser = 0; guesser < LoginAttemptLimiter.MAX_TRACKED + 500; guesser++) {
			this.limiter.recordFailure("user" + guesser, HOME);
		}

		assertThat(this.limiter.tracked()).isLessThanOrEqualTo(LoginAttemptLimiter.MAX_TRACKED);
	}

	@Test
	void expiredEntriesAreTheFirstToGoWhenRoomIsNeeded() {
		for (int guesser = 0; guesser < LoginAttemptLimiter.MAX_TRACKED; guesser++) {
			this.limiter.recordFailure("old" + guesser, HOME);
		}
		this.clock.advance(Duration.ofMinutes(6));
		fail("pixel", HOME, 3);

		// One more than fits: the expired ones are dropped, the live block on "pixel" is kept.
		this.limiter.recordFailure("newcomer", HOME);

		assertThat(this.limiter.tracked()).isEqualTo(2);
		assertBlocked("pixel", HOME);
	}

	private void fail(String username, String address, int times) {
		for (int attempt = 0; attempt < times; attempt++) {
			this.limiter.recordFailure(username, address);
		}
	}

	private void assertAllowed(String username, String address) {
		assertThatCode(() -> this.limiter.check(username, address)).doesNotThrowAnyException();
	}

	private void assertBlocked(String username, String address) {
		assertThatExceptionOfType(ApiException.class).isThrownBy(() -> this.limiter.check(username, address));
	}

	/** A clock that stands still until the test moves it. */
	private static final class MovableClock extends Clock {

		private Instant now;

		private MovableClock(Instant start) {
			this.now = start;
		}

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
