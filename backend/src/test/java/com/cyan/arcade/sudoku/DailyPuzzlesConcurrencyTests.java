package com.cyan.arcade.sudoku;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.sudoku.engine.Puzzle;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The first requests of a day all ask for its puzzle at once: one stores it, the others get the
 * stored one rather than an error.
 */
@IntegrationTest
class DailyPuzzlesConcurrencyTests {

	/** Days far from any the other tests ask for, so each is asked for the first time here. */
	private static final LocalDate FIRST = LocalDate.of(2400, 1, 1);

	private static final int DAYS = 10;

	private static final int REQUESTS = 6;

	@Autowired
	private DailyPuzzles dailyPuzzles;

	@Autowired
	private JdbcClient jdbc;

	@AfterEach
	void forgetTheDays() {
		this.jdbc.sql("DELETE FROM sudoku_daily_puzzles WHERE puzzle_date >= :first")
			.param("first", FIRST)
			.update();
	}

	@Test
	void requestsAskingForANewDayTogetherAllGetItsOnePuzzle() throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(REQUESTS);
		try {
			for (int day = 0; day < DAYS; day++) {
				LocalDate date = FIRST.plusDays(day);
				CyclicBarrier together = new CyclicBarrier(REQUESTS);
				List<Future<Puzzle>> asked = new ArrayList<>();
				for (int request = 0; request < REQUESTS; request++) {
					Callable<Puzzle> ask = () -> {
						together.await();
						return this.dailyPuzzles.forDay(date);
					};
					asked.add(pool.submit(ask));
				}
				List<String> givens = new ArrayList<>();
				for (Future<Puzzle> answer : asked) {
					givens.add(answer.get().givens());
				}
				assertThat(givens).as("puzzles of %s", date).containsOnly(givens.get(0));
				assertThat(this.jdbc.sql("SELECT count(*) FROM sudoku_daily_puzzles WHERE puzzle_date = :date")
					.param("date", date)
					.query(Long.class)
					.single()).isOne();
			}
		}
		finally {
			pool.shutdownNow();
		}
	}

}
