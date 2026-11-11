package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.score.GameSessionService;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuViews.RunResponse;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.LogicSolver;
import com.cyan.arcade.sudoku.engine.Solver;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Practice puzzles: a new one for every game, of the asked difficulty and with one solution, never
 * one the player (account or guest) has had, made on the request without pooling or storing anything
 * but the run.
 */
@IntegrationTest
class PracticePuzzlesTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private SudokuService sudoku;

	@Autowired
	private SudokuRunStore store;

	@Autowired
	private DailyPuzzles dailyPuzzles;

	@Autowired
	private GameSessionService sessions;

	@Autowired
	private JdbcClient jdbc;

	// --- Variety and correctness ---------------------------------------------------------------------

	@Test
	void everyStartIsANewPuzzleOfItsDifficultyWithOneSolution() throws Exception {
		Owner owner = account();
		Set<String> seen = new HashSet<>();
		for (Difficulty difficulty : Difficulty.values()) {
			for (int start = 0; start < 5; start++) {
				RunResponse run = this.sudoku.startPractice(owner, difficulty, null);
				Stored stored = stored(run.id());
				assertThat(seen.add(stored.givens())).as("a repeated puzzle").isTrue();
				assertThat(stored.difficulty()).isEqualTo(difficulty.name());
				int[] givens = Grid.parse(stored.givens());
				assertThat(Solver.hasUniqueSolution(givens)).isTrue();
				assertThat(Solver.solve(givens)).hasValueSatisfying(
						(solution) -> assertThat(solution).isEqualTo(Grid.parse(stored.solution())));
				assertThat(LogicSolver.grade(givens).difficulty()).contains(difficulty);
				assertThat(Grid.filled(givens)).isGreaterThanOrEqualTo(difficulty.minGivens());
				// The browser gets the clues and never the solution while it plays.
				assertThat(run.givens()).isEqualTo(stored.givens());
				assertThat(run.solution()).isNull();
			}
		}
		assertThat(seen).hasSize(20);
	}

	@Test
	void aGuestGetsANewPuzzleEachTimeToo() {
		Owner guest = new Owner(null, UUID.randomUUID());
		Set<String> seen = new HashSet<>();
		for (int start = 0; start < 6; start++) {
			seen.add(stored(this.sudoku.startPractice(guest, Difficulty.MEDIUM, null).id()).givens());
		}
		assertThat(seen).hasSize(6);
	}

	// --- Never one the player has had ------------------------------------------------------------------

	@Test
	void aPuzzleThePlayerHasHadIsMadeAgainButAnotherPlayerMayGetIt() {
		long first = 101;
		long second = 202;
		Owner owner = account();
		SudokuService seeded = service(seeds(first, first, second));
		RunResponse had = seeded.startPractice(owner, Difficulty.EASY, null);
		RunResponse next = seeded.startPractice(owner, Difficulty.EASY, null);
		assertThat(had.givens()).isEqualTo(Generator.generate(Difficulty.EASY, first).givens());
		// The first seed again would repeat the player's puzzle: the next seed's is taken instead.
		assertThat(next.givens()).isEqualTo(Generator.generate(Difficulty.EASY, second).givens());

		// Repeats are only avoided per player: someone else can have that first puzzle.
		RunResponse other = service(seeds(first)).startPractice(account(), Difficulty.EASY, null);
		assertThat(other.givens()).isEqualTo(had.givens());
	}

	@Test
	void aGuestIsNotGivenTheirOwnPuzzleAgain() {
		long first = 303;
		long second = 404;
		Owner guest = new Owner(null, UUID.randomUUID());
		SudokuService seeded = service(seeds(first, first, second));
		RunResponse had = seeded.startPractice(guest, Difficulty.HARD, null);
		RunResponse next = seeded.startPractice(guest, Difficulty.HARD, null);
		assertThat(next.givens()).isNotEqualTo(had.givens())
			.isEqualTo(Generator.generate(Difficulty.HARD, second).givens());
	}

	@Test
	void aPuzzleFromAnyOfThePlayersModesCountsAsHad() {
		// The archive replay of a day is a run with that day's clues: practice never hands them out again.
		Owner owner = account();
		RunResponse replay = this.sudoku.startArchive(owner, java.time.LocalDate.of(2026, 3, 14));
		assertThat(this.store.hasPlayed(owner, replay.givens())).isTrue();
		assertThat(this.store.hasPlayed(new Owner(null, UUID.randomUUID()), replay.givens())).isFalse();
	}

	@Test
	void makingAgainStopsAfterAFewTries() {
		// A seed source that only ever makes the one puzzle the player has had: three tries, then it is taken.
		long only = 505;
		AtomicInteger asked = new AtomicInteger();
		Owner owner = account();
		service(() -> {
			asked.incrementAndGet();
			return only;
		}).startPractice(owner, Difficulty.EASY, null);
		asked.set(0);
		RunResponse again = service(() -> {
			asked.incrementAndGet();
			return only;
		}).startPractice(owner, Difficulty.EASY, null);
		assertThat(asked).hasValue(PracticePuzzles.MAX_TRIES);
		assertThat(again.givens()).isEqualTo(Generator.generate(Difficulty.EASY, only).givens());
	}

	// --- At once, and what is stored -------------------------------------------------------------------

	@Test
	void manyPlayersStartingAtOnceEachGetANewPuzzle() throws Exception {
		int players = 8;
		List<Owner> owners = new ArrayList<>();
		for (int player = 0; player < players; player++) {
			owners.add((player % 2 == 0) ? account() : new Owner(null, UUID.randomUUID()));
		}
		ExecutorService pool = Executors.newFixedThreadPool(players);
		try {
			CyclicBarrier together = new CyclicBarrier(players);
			List<Future<RunResponse>> starts = new ArrayList<>();
			for (Owner owner : owners) {
				Callable<RunResponse> start = () -> {
					together.await(10, TimeUnit.SECONDS);
					return this.sudoku.startPractice(owner, Difficulty.EXPERT, null);
				};
				starts.add(pool.submit(start));
			}
			Set<String> puzzles = new HashSet<>();
			for (Future<RunResponse> start : starts) {
				RunResponse run = start.get(60, TimeUnit.SECONDS);
				assertThat(run.difficulty()).isEqualTo(Difficulty.EXPERT);
				puzzles.add(run.givens());
			}
			assertThat(puzzles).hasSize(players);
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void aStartStoresItsRunAndNothingElseAndLeavesTheDailyPuzzlesAlone() {
		Owner owner = account();
		String dailyBefore = dailyPuzzleRows();
		this.sudoku.startPractice(owner, Difficulty.MEDIUM, null);
		this.sudoku.startPractice(owner, Difficulty.EXPERT, null);
		assertThat(this.jdbc.sql("SELECT count(*) FROM sudoku_runs WHERE user_id = :id")
			.param("id", owner.userId())
			.query(Long.class)
			.single()).isEqualTo(2);
		assertThat(dailyPuzzleRows()).isEqualTo(dailyBefore);
		// No puzzle store of any kind: the Sudoku tables are the ones there were.
		assertThat(this.jdbc.sql("SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables "
				+ "WHERE table_schema = 'public' AND table_name LIKE 'sudoku%'").query(String.class).single())
			.isEqualTo("sudoku_daily_puzzles,sudoku_run_notes,sudoku_runs");
	}

	// --- Helpers ---------------------------------------------------------------------------------------

	private Owner account() {
		try {
			return new Owner(Players.userId(this.mockMvc, Players.register(this.mockMvc)), null);
		}
		catch (Exception ex) {
			throw new IllegalStateException(ex);
		}
	}

	/** The Sudoku service with practice seeds of the test's choosing (the shared one stays random). */
	private SudokuService service(LongSupplier seeds) {
		return new SudokuService(this.store, this.dailyPuzzles, this.sessions, Clock.systemUTC(),
				new PracticePuzzles(this.store, seeds));
	}

	/** These seeds in order, then the last one again. */
	private static LongSupplier seeds(long... seeds) {
		AtomicInteger next = new AtomicInteger();
		return () -> seeds[Math.min(next.getAndIncrement(), seeds.length - 1)];
	}

	private Stored stored(UUID runId) {
		return this.jdbc.sql("SELECT givens, solution, difficulty FROM sudoku_runs WHERE id = :id")
			.param("id", runId)
			.query((row, index) -> new Stored(row.getString("givens"), row.getString("solution"),
					row.getString("difficulty")))
			.single();
	}

	private String dailyPuzzleRows() {
		return this.jdbc.sql("SELECT count(*) || ' ' || md5(coalesce(string_agg(p::text, '|' ORDER BY p.puzzle_date), '')) "
				+ "FROM sudoku_daily_puzzles p").query(String.class).single();
	}

	private record Stored(String givens, String solution, String difficulty) {
	}

}
