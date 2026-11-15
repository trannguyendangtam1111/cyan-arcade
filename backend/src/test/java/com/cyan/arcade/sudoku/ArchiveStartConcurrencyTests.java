package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.sudoku.SudokuRun.Mode;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuViews.RunResponse;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Archive replays started at the same moment: a player ends up with exactly one replay in play (the
 * last one started), every run handed back is stored, other players are not held up, and the player's
 * Daily and Practice games are not touched.
 */
@IntegrationTest
class ArchiveStartConcurrencyTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private SudokuService sudoku;

	@Autowired
	private DailyPuzzles dailyPuzzles;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private Clock clock;

	@Autowired
	private SudokuRunStore store;

	@Autowired
	private TransactionTemplate transaction;

	private LocalDate today;

	@BeforeEach
	void setUp() {
		this.today = DailySchedule.today(this.clock);
	}

	@Test
	void twoStartsOfTheSameDayAtOnceLeaveOneReplayInPlay() throws Exception {
		LocalDate day = this.today.minusDays(3);
		// A few rounds: each is a fresh race between two starts of the same player.
		for (int round = 0; round < 5; round++) {
			Owner owner = account().owner();
			List<RunResponse> runs = started(all(List.of(new Start(owner, day), new Start(owner, day))));
			assertThat(replays(owner, "PLAYING")).as("replays in play after round " + round).hasSize(1);
			assertThat(replays(owner, "ABANDONED")).hasSize(1);
			assertStored(runs);
			UUID playing = replays(owner, "PLAYING").get(0);
			assertThat(runs.stream().map(RunResponse::id)).contains(playing);
			assertThat(this.sudoku.today(owner).archive().id()).isEqualTo(playing);
			// One after the other: the replay left ends no later than the one in play starts.
			assertThat(this.jdbc.sql("SELECT a.finished_at <= p.started_at FROM sudoku_runs a, sudoku_runs p "
					+ "WHERE a.id = :abandoned AND p.id = :playing")
				.param("abandoned", replays(owner, "ABANDONED").get(0))
				.param("playing", playing)
				.query(Boolean.class)
				.single()).isTrue();
		}
	}

	@Test
	void manyStartsOfTheSameAndOtherDaysAtOnceLeaveOneReplayInPlayForAnAccountAndForAGuest() throws Exception {
		List<LocalDate> days = List.of(this.today.minusDays(2), this.today.minusDays(5), this.today.minusDays(9),
				this.today.minusDays(2));
		for (Owner owner : List.of(account().owner(), new Owner(null, UUID.randomUUID()))) {
			List<Start> starts = new ArrayList<>();
			for (int start = 0; start < 8; start++) {
				starts.add(new Start(owner, days.get(start % days.size())));
			}
			List<RunResponse> runs = started(all(starts));
			assertThat(runs).hasSize(8);
			assertThat(runs.stream().map(RunResponse::id).distinct()).hasSize(8);
			assertStored(runs);
			assertThat(replays(owner, "PLAYING")).hasSize(1);
			assertThat(replays(owner, "ABANDONED")).hasSize(7);
			// The replay in play is the run handed back for it, of the day asked for.
			UUID playing = replays(owner, "PLAYING").get(0);
			RunResponse run = runs.stream().filter((started) -> started.id().equals(playing)).findFirst().orElseThrow();
			assertThat(dayOf(playing)).isEqualTo(run.date());
		}
	}

	@Test
	void differentPlayersStartAtOnceAndEachKeepsTheirOwnReplay() throws Exception {
		List<Start> starts = new ArrayList<>();
		for (int player = 0; player < 8; player++) {
			Owner owner = (player % 2 == 0) ? account().owner() : new Owner(null, UUID.randomUUID());
			// Half on the same day, half on days of their own.
			starts.add(new Start(owner, this.today.minusDays((player < 4) ? 4 : 10 + player)));
		}
		List<RunResponse> runs = started(all(starts));
		assertThat(runs).hasSize(8);
		assertStored(runs);
		for (Start start : starts) {
			assertThat(replays(start.owner(), "PLAYING")).hasSize(1);
			assertThat(replays(start.owner(), "ABANDONED")).isEmpty();
		}
	}

	@Test
	void aReplayStartWaitsOnlyForThatPlayersOwnReplayStart() throws Exception {
		Owner held = account().owner();
		Owner other = account().owner();
		LocalDate day = this.today.minusDays(4);
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(4);
		try {
			// A replay start of `held` under way: its lock taken in a transaction that has not ended yet.
			Future<?> holder = pool.submit(() -> this.transaction.executeWithoutResult((status) -> {
				this.store.lockStarts(held, Mode.ARCHIVE);
				locked.countDown();
				try {
					release.await(30, TimeUnit.SECONDS);
				}
				catch (InterruptedException ex) {
					Thread.currentThread().interrupt();
				}
			}));
			assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
			// Another player's replay is not held up (a wait here would time out)...
			RunResponse otherRun = pool.submit(() -> this.sudoku.startArchive(other, day)).get(10, TimeUnit.SECONDS);
			assertThat(replays(other, "PLAYING")).containsExactly(otherRun.id());
			// ... nor the player's own practice game.
			RunResponse practice = pool.submit(() -> this.sudoku.startPractice(held, Difficulty.EASY, null))
				.get(10, TimeUnit.SECONDS);
			assertThat(practice.mode()).isEqualTo("PRACTICE");
			// The same player's next replay waits for the one under way, then goes ahead.
			Future<RunResponse> waiting = pool.submit(() -> this.sudoku.startArchive(held, day));
			Thread.sleep(700);
			assertThat(waiting.isDone()).isFalse();
			assertThat(replays(held, "PLAYING")).isEmpty();
			release.countDown();
			holder.get(10, TimeUnit.SECONDS);
			RunResponse heldRun = waiting.get(30, TimeUnit.SECONDS);
			assertThat(replays(held, "PLAYING")).containsExactly(heldRun.id());
		}
		finally {
			release.countDown();
			pool.shutdownNow();
		}
	}

	@Test
	void startsAtOnceLeaveTheDailyAndPracticeGamesAlone() throws Exception {
		Player player = account();
		Owner owner = player.owner();
		String dailySession = gameSession(player.session(), "daily");
		this.mockMvc.perform(post("/api/sudoku/daily/runs").session(player.session())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(dailySession))).andExpect(status().isOk());
		this.sudoku.startPractice(owner, Difficulty.EASY, null);
		String others = otherRuns(owner);
		assertThat(others).contains("DAILY,PLAYING").contains("PRACTICE,PLAYING");

		LocalDate day = this.today.minusDays(6);
		started(all(List.of(new Start(owner, day), new Start(owner, day), new Start(owner, this.today.minusDays(7)),
				new Start(owner, day))));
		assertThat(replays(owner, "PLAYING")).hasSize(1);
		assertThat(otherRuns(owner)).isEqualTo(others);
	}

	@Test
	void aDayWhoseRankedDailyIsStillInPlayIsRefusedEvenAmongStartsAtOnce() throws Exception {
		Owner owner = account().owner();
		LocalDate yesterday = this.today.minusDays(1);
		LocalDate other = this.today.minusDays(8);
		UUID official = officialInPlay(owner, yesterday);

		List<Start> starts = List.of(new Start(owner, yesterday), new Start(owner, other), new Start(owner, yesterday),
				new Start(owner, other), new Start(owner, yesterday), new Start(owner, other));
		List<Object> outcomes = all(starts);
		for (int index = 0; index < starts.size(); index++) {
			if (starts.get(index).day().equals(yesterday)) {
				assertThat(outcomes.get(index)).isInstanceOfSatisfying(ApiException.class,
						(ex) -> assertThat(ex.getCode()).isEqualTo(SudokuService.DAILY_IN_PROGRESS));
			}
			else {
				assertThat(outcomes.get(index)).isInstanceOf(RunResponse.class);
			}
		}
		assertStored(started(outcomes.stream().filter(RunResponse.class::isInstance).toList()));
		assertThat(replays(owner, "PLAYING")).hasSize(1);
		assertThat(dayOf(replays(owner, "PLAYING").get(0))).isEqualTo(other);
		// No replay of that day was made, and the official run is untouched.
		assertThat(this.jdbc.sql("SELECT count(*) FROM sudoku_runs WHERE mode = 'ARCHIVE' AND puzzle_date = :day AND "
				+ "user_id = :owner")
			.param("day", yesterday)
			.param("owner", owner.userId())
			.query(Integer.class)
			.single()).isZero();
		assertThat(statusOf(official)).isEqualTo("PLAYING");
	}

	// --- Helpers ---------------------------------------------------------------------------------------

	private record Player(MockHttpSession session, Owner owner) {
	}

	private record Start(Owner owner, LocalDate day) {
	}

	private Player account() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		return new Player(session, new Owner(Players.userId(this.mockMvc, session), null));
	}

	/**
	 * Starts every replay, all released at the same moment.
	 * @return per start, in order, its run or the {@link ApiException} it was refused with
	 */
	private List<Object> all(List<Start> starts) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(starts.size());
		try {
			CyclicBarrier together = new CyclicBarrier(starts.size());
			List<Future<RunResponse>> futures = new ArrayList<>();
			for (Start start : starts) {
				Callable<RunResponse> call = () -> {
					together.await(10, TimeUnit.SECONDS);
					return this.sudoku.startArchive(start.owner(), start.day());
				};
				futures.add(pool.submit(call));
			}
			List<Object> outcomes = new ArrayList<>();
			for (Future<RunResponse> future : futures) {
				try {
					outcomes.add(future.get(60, TimeUnit.SECONDS));
				}
				catch (ExecutionException ex) {
					if (!(ex.getCause() instanceof ApiException refused)) {
						throw ex;
					}
					outcomes.add(refused);
				}
			}
			return outcomes;
		}
		finally {
			pool.shutdownNow();
		}
	}

	private static List<RunResponse> started(List<?> outcomes) {
		assertThat(outcomes).allSatisfy((outcome) -> assertThat(outcome).isInstanceOf(RunResponse.class));
		return outcomes.stream().map(RunResponse.class::cast).toList();
	}

	/** Every run handed back is a stored replay of the day it says. */
	private void assertStored(List<RunResponse> runs) {
		for (RunResponse run : runs) {
			assertThat(this.jdbc.sql("SELECT count(*) FROM sudoku_runs WHERE id = :id AND mode = 'ARCHIVE' "
					+ "AND puzzle_date = :day AND givens = :givens")
				.param("id", run.id())
				.param("day", run.date())
				.param("givens", run.givens())
				.query(Integer.class)
				.single()).as("stored run " + run.id()).isOne();
		}
	}

	private List<UUID> replays(Owner owner, String status) {
		return this.jdbc.sql("SELECT id FROM sudoku_runs WHERE mode = 'ARCHIVE' AND status = :status AND "
				+ owned(owner) + " ORDER BY started_at")
			.param("status", status)
			.param("owner", (owner.userId() != null) ? owner.userId() : owner.playerId())
			.query(UUID.class)
			.list();
	}

	private LocalDate dayOf(UUID run) {
		return this.jdbc.sql("SELECT puzzle_date FROM sudoku_runs WHERE id = :id")
			.param("id", run)
			.query(LocalDate.class)
			.single();
	}

	private String statusOf(UUID run) {
		return this.jdbc.sql("SELECT status FROM sudoku_runs WHERE id = :id").param("id", run).query(String.class).single();
	}

	/** The player's Daily and Practice runs, whole. */
	private String otherRuns(Owner owner) {
		return this.jdbc.sql("SELECT string_agg(mode || ',' || status || ',' || r::text, '|' ORDER BY mode) FROM sudoku_runs r "
				+ "WHERE mode <> 'ARCHIVE' AND " + owned(owner))
			.param("owner", (owner.userId() != null) ? owner.userId() : owner.playerId())
			.query(String.class)
			.single();
	}

	private static String owned(Owner owner) {
		return (owner.userId() != null) ? "user_id = :owner" : "user_id IS NULL AND player_id = :owner";
	}

	/** A ranked Daily of that day, started before midnight UTC and still being played. */
	private UUID officialInPlay(Owner owner, LocalDate day) {
		Puzzle puzzle = this.dailyPuzzles.forDay(day);
		UUID official = UUID.randomUUID();
		this.jdbc.sql("""
				INSERT INTO sudoku_runs (id, mode, ranked, difficulty, puzzle_date, puzzle_number, seed, givens, solution,
				                         actions, status, mistakes, hints, streak, user_id, started_at)
				VALUES (:id, 'DAILY', TRUE, :difficulty, :day, :number, :seed, :givens, :solution, '', 'PLAYING', 0, 0, 0,
				        :owner, now() - interval '1 hour')
				""")
			.param("id", official)
			.param("difficulty", puzzle.difficulty().name())
			.param("day", day)
			.param("number", DailySchedule.puzzleNumber(day))
			.param("seed", puzzle.seed())
			.param("givens", puzzle.givens())
			.param("solution", puzzle.solution())
			.param("owner", owner.userId())
			.update();
		return official;
	}

	private String gameSession(MockHttpSession session, String mode) throws Exception {
		String body = this.mockMvc.perform(post("/api/game-sessions").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"sudoku\",\"mode\":\"%s\"}".formatted(mode)))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

}
