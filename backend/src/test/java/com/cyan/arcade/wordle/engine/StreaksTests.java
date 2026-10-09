package com.cyan.arcade.wordle.engine;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

import com.cyan.arcade.wordle.daily.DailySchedule;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Daily streaks, in UTC days. */
class StreaksTests {

	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 5);

	private static Map<LocalDate, Boolean> results(Object... dayAndSolved) {
		Map<LocalDate, Boolean> results = new HashMap<>();
		for (int index = 0; index < dayAndSolved.length; index += 2) {
			results.put(MONDAY.plusDays((Integer) dayAndSolved[index]), (Boolean) dayAndSolved[index + 1]);
		}
		return results;
	}

	@Test
	void theFirstSolvedDayStartsAStreakOfOne() {
		Map<LocalDate, Boolean> results = results(0, true);

		assertThat(Streaks.endingOn(results, MONDAY)).isEqualTo(1);
		assertThat(Streaks.current(results, MONDAY)).isEqualTo(1);
		assertThat(Streaks.best(results)).isEqualTo(1);
	}

	@Test
	void consecutiveSolvedDaysAddUp() {
		Map<LocalDate, Boolean> results = results(0, true, 1, true, 2, true);

		assertThat(Streaks.endingOn(results, MONDAY.plusDays(2))).isEqualTo(3);
		assertThat(Streaks.best(results)).isEqualTo(3);
	}

	@Test
	void aMissedDayStartsOver() {
		Map<LocalDate, Boolean> results = results(0, true, 1, true, 3, true);

		assertThat(Streaks.endingOn(results, MONDAY.plusDays(3))).isEqualTo(1);
		assertThat(Streaks.best(results)).isEqualTo(2);
		// Two days after the last solve, with nothing played today: the streak is gone.
		assertThat(Streaks.current(results, MONDAY.plusDays(5))).isZero();
	}

	@Test
	void aFailedDayEndsTheStreak() {
		Map<LocalDate, Boolean> results = results(0, true, 1, true, 2, false);

		assertThat(Streaks.current(results, MONDAY.plusDays(2))).isZero();
		assertThat(Streaks.endingOn(results, MONDAY.plusDays(2))).isZero();
		assertThat(Streaks.best(results)).isEqualTo(2);
		// And the next solve starts again from one.
		results.put(MONDAY.plusDays(3), true);
		assertThat(Streaks.endingOn(results, MONDAY.plusDays(3))).isEqualTo(1);
	}

	@Test
	void todayNotPlayedYetKeepsYesterdaysStreakAlive() {
		Map<LocalDate, Boolean> results = results(0, true, 1, true);

		assertThat(Streaks.current(results, MONDAY.plusDays(2))).isEqualTo(2);
	}

	@Test
	void playingTheSameDayAgainCannotCountItTwice() {
		Map<LocalDate, Boolean> results = results(0, true, 1, true);
		// A day is one key: "solving" Tuesday again changes nothing.
		results.put(MONDAY.plusDays(1), true);

		assertThat(Streaks.endingOn(results, MONDAY.plusDays(1))).isEqualTo(2);
	}

	@Test
	void daysAreUtcCalendarDays() {
		Map<LocalDate, Boolean> results = results(0, true);
		// One second before UTC midnight it is still Monday, even in Ho Chi Minh City (already Tuesday there).
		Clock lateMonday = Clock.fixed(Instant.parse("2026-10-05T23:59:59Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
		Clock earlyTuesday = Clock.fixed(Instant.parse("2026-10-06T00:00:00Z"), ZoneId.of("America/Los_Angeles"));

		assertThat(DailySchedule.today(lateMonday)).isEqualTo(MONDAY);
		assertThat(DailySchedule.today(earlyTuesday)).isEqualTo(MONDAY.plusDays(1));
		assertThat(Streaks.current(results, DailySchedule.today(lateMonday))).isEqualTo(1);
		// Tuesday has started: Monday's streak still counts until Tuesday's puzzle is played.
		assertThat(Streaks.current(results, DailySchedule.today(earlyTuesday))).isEqualTo(1);
		assertThat(Streaks.current(results, DailySchedule.today(earlyTuesday).plusDays(1))).isZero();
	}

	@Test
	void noResultsNoStreak() {
		assertThat(Streaks.current(Map.of(), MONDAY)).isZero();
		assertThat(Streaks.best(Map.of())).isZero();
	}

}
