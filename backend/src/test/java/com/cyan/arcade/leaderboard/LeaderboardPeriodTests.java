package com.cyan.arcade.leaderboard;

import java.time.Instant;

import com.cyan.arcade.leaderboard.LeaderboardPeriod.Window;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** The periods' boundaries on their own: always UTC, days from midnight, weeks from Monday. */
class LeaderboardPeriodTests {

	@Test
	void aDayRunsFromMidnightToMidnightUtc() {
		Window day = LeaderboardPeriod.DAILY.windowAt(Instant.parse("2026-10-06T15:30:00Z"));

		assertThat(day.start()).isEqualTo(Instant.parse("2026-10-06T00:00:00Z"));
		assertThat(day.end()).isEqualTo(Instant.parse("2026-10-07T00:00:00Z"));
	}

	@Test
	void midnightBelongsToTheDayItStartsAndTheMomentBeforeToTheDayBefore() {
		Window day = LeaderboardPeriod.DAILY.windowAt(Instant.parse("2026-10-06T00:00:00Z"));

		assertThat(day.contains(Instant.parse("2026-10-06T00:00:00Z"))).isTrue();
		assertThat(day.contains(Instant.parse("2026-10-05T23:59:59.999999Z"))).isFalse();
		assertThat(day.contains(Instant.parse("2026-10-06T23:59:59.999999Z"))).isTrue();
		assertThat(day.contains(Instant.parse("2026-10-07T00:00:00Z"))).isFalse();
	}

	@ParameterizedTest
	@CsvSource({
			// Any moment of a week gives that week's Monday 00:00 UTC to the next Monday.
			"2026-10-05T00:00:00Z, 2026-10-05T00:00:00Z, 2026-10-12T00:00:00Z", // Monday's first moment
			"2026-10-07T12:00:00Z, 2026-10-05T00:00:00Z, 2026-10-12T00:00:00Z", // Wednesday
			"2026-10-11T23:59:59Z, 2026-10-05T00:00:00Z, 2026-10-12T00:00:00Z", // Sunday's last second
			"2026-10-12T00:00:00Z, 2026-10-12T00:00:00Z, 2026-10-19T00:00:00Z", // the next Monday
			// Weeks run across months and years.
			"2026-11-01T10:00:00Z, 2026-10-26T00:00:00Z, 2026-11-02T00:00:00Z",
			"2027-01-01T08:00:00Z, 2026-12-28T00:00:00Z, 2027-01-04T00:00:00Z",
			// A leap day.
			"2028-02-29T23:00:00Z, 2028-02-28T00:00:00Z, 2028-03-06T00:00:00Z" })
	void aWeekRunsFromMondayToMondayUtc(Instant now, Instant start, Instant end) {
		Window week = LeaderboardPeriod.WEEKLY.windowAt(now);

		assertThat(week.start()).isEqualTo(start);
		assertThat(week.end()).isEqualTo(end);
	}

	@Test
	void itIsUtcWhereverThePlayerIs() {
		// 23:30 UTC on Sunday is 06:30 on Monday in Vietnam (UTC+7): still Sunday on the boards.
		Instant sundayNightUtc = Instant.parse("2026-10-11T23:30:00Z");

		assertThat(LeaderboardPeriod.DAILY.windowAt(sundayNightUtc).start()).isEqualTo(Instant.parse("2026-10-11T00:00:00Z"));
		assertThat(LeaderboardPeriod.WEEKLY.windowAt(sundayNightUtc).start())
			.isEqualTo(Instant.parse("2026-10-05T00:00:00Z"));
	}

	@Test
	void allTimeHasNoBoundaries() {
		Window always = LeaderboardPeriod.ALL_TIME.windowAt(Instant.parse("2026-10-06T15:30:00Z"));

		assertThat(always.start()).isNull();
		assertThat(always.end()).isNull();
		assertThat(always.contains(Instant.EPOCH)).isTrue();
	}

}
