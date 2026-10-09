package com.cyan.arcade.wordle.daily;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.cyan.arcade.wordle.RealWords;
import com.cyan.arcade.wordle.dictionary.Dictionary;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** The Daily Word: the date alone decides the word, for everyone, forever. */
class DailyScheduleTests {

	private final DailySchedule schedule = new DailySchedule(List.of("APPLE", "CRANE", "SLOTH"));

	@Test
	void theSameDayAlwaysGivesTheSameWord() {
		LocalDate day = LocalDate.of(2026, 10, 8);
		DailySchedule again = new DailySchedule(List.of("APPLE", "CRANE", "SLOTH"));

		assertThat(this.schedule.answerFor(day)).isEqualTo(this.schedule.answerFor(day)).isEqualTo(again.answerFor(day));
	}

	@Test
	void eachDayTakesTheNextWordInTheScheduleAndWrapsRound() {
		LocalDate first = DailySchedule.FIRST_DAY;

		assertThat(this.schedule.answerFor(first)).isEqualTo("APPLE");
		assertThat(this.schedule.answerFor(first.plusDays(1))).isEqualTo("CRANE");
		assertThat(this.schedule.answerFor(first.plusDays(2))).isEqualTo("SLOTH");
		assertThat(this.schedule.answerFor(first.plusDays(3))).isEqualTo("APPLE");
		assertThat(this.schedule.puzzleNumber(first)).isEqualTo(1);
		assertThat(this.schedule.puzzleNumber(first.plusDays(3))).isEqualTo(4);
	}

	@Test
	void appendingWordsLeavesEveryPastPuzzleAsItWas() {
		DailySchedule grown = new DailySchedule(List.of("APPLE", "CRANE", "SLOTH", "PIXEL"));
		for (int day = 0; day < 3; day++) {
			LocalDate date = DailySchedule.FIRST_DAY.plusDays(day);
			assertThat(grown.answerFor(date)).isEqualTo(this.schedule.answerFor(date));
		}
	}

	@Test
	void thereIsNoPuzzleBeforeTheFirstDay() {
		LocalDate before = DailySchedule.FIRST_DAY.minusDays(1);

		assertThat(this.schedule.hasPuzzle(before)).isFalse();
		assertThatIllegalArgumentException().isThrownBy(() -> this.schedule.answerFor(before));
	}

	@Test
	void theDayChangesAtUtcMidnight() {
		Clock late = Clock.fixed(Instant.parse("2026-10-08T23:59:59.999Z"), ZoneOffset.ofHours(7));
		Clock early = Clock.fixed(Instant.parse("2026-10-09T00:00:00Z"), ZoneOffset.ofHours(-8));

		assertThat(DailySchedule.today(late)).isEqualTo(LocalDate.of(2026, 10, 8));
		assertThat(DailySchedule.today(early)).isEqualTo(LocalDate.of(2026, 10, 9));
		assertThat(DailySchedule.nextPuzzleAt(late)).isEqualTo(Instant.parse("2026-10-09T00:00:00Z"));
	}

	@Test
	void theRealScheduleGivesEveryAnswerOneDayPerRoundAndPastDaysStayPut() {
		Dictionary words = RealWords.dictionary();
		DailySchedule real = new DailySchedule(words.answers());
		Set<String> round = new HashSet<>();
		for (int day = 0; day < words.answers().size(); day++) {
			round.add(real.answerFor(DailySchedule.FIRST_DAY.plusDays(day)));
		}
		assertThat(round).hasSize(words.answers().size());
		// Pinned, so a change to the list that rewrites history fails here.
		assertThat(real.answerFor(DailySchedule.FIRST_DAY)).isEqualTo("METAL");
		assertThat(real.puzzleNumber(LocalDate.of(2026, 10, 8))).isEqualTo(281);
	}

}
