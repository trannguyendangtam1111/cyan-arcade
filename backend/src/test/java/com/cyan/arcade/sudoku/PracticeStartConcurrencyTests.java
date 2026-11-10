package com.cyan.arcade.sudoku;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuViews.RunResponse;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.jayway.jsonpath.JsonPath;
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
 * Practice starts arriving at the same moment: a player ends up with exactly one Practice game in
 * play (the last one started), whatever the timing; other players and the player's Daily
 * runs are not held up or touched.
 */
@IntegrationTest
class PracticeStartConcurrencyTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private SudokuService sudoku;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private SudokuRunStore store;

	@Autowired
	private TransactionTemplate transaction;

	@Test
	void twoStartsAtOnceLeaveOnePracticeGameInPlay() throws Exception {
		// A few rounds: each is a fresh race between two starts of the same player.
		for (int round = 0; round < 5; round++) {
			Owner owner = account().owner();
			List<RunResponse> runs = all(List.of(owner, owner), Difficulty.EASY);
			assertThat(playing(owner)).as("practice games in play after round " + round).hasSize(1);
			assertThat(practice(owner, "ABANDONED")).hasSize(1);
			// The one in play is one of the two started, and the player's current game.
			assertThat(runs.stream().map(RunResponse::id)).contains(playing(owner).get(0));
			assertThat(this.sudoku.today(owner).practice().id()).isEqualTo(playing(owner).get(0));
			// One after the other: the game left ends no later than the one in play starts.
			assertThat(this.jdbc.sql("SELECT bool_and(a.finished_at <= p.started_at) FROM sudoku_runs a, sudoku_runs p "
					+ "WHERE a.id = :abandoned AND p.id = :playing")
				.param("abandoned", practice(owner, "ABANDONED").get(0))
				.param("playing", playing(owner).get(0))
				.query(Boolean.class)
				.single()).isTrue();
		}
	}

	@Test
	void aStartWaitsOnlyForThatPlayersOwnStart() throws Exception {
		Owner held = account().owner();
		Owner other = account().owner();
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(3);
		try {
			// A start of `held` under way: its lock taken in a transaction that has not ended yet.
			Future<?> holder = pool.submit(() -> this.transaction.executeWithoutResult((status) -> {
				this.store.lockStarts(held, SudokuRun.Mode.PRACTICE);
				locked.countDown();
				try {
					release.await(30, TimeUnit.SECONDS);
				}
				catch (InterruptedException ex) {
					Thread.currentThread().interrupt();
				}
			}));
			assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
			// Another player is not held up (a wait here would time out).
			RunResponse otherRun = pool.submit(() -> this.sudoku.startPractice(other, Difficulty.EASY, null))
				.get(10, TimeUnit.SECONDS);
			assertThat(playing(other)).containsExactly(otherRun.id());
			// The same player's next start waits for the one under way, then goes ahead.
			Future<RunResponse> waiting = pool.submit(() -> this.sudoku.startPractice(held, Difficulty.EASY, null));
			Thread.sleep(700);
			assertThat(waiting.isDone()).isFalse();
			assertThat(playing(held)).isEmpty();
			release.countDown();
			holder.get(10, TimeUnit.SECONDS);
			RunResponse heldRun = waiting.get(30, TimeUnit.SECONDS);
			assertThat(playing(held)).containsExactly(heldRun.id());
		}
		finally {
			release.countDown();
			pool.shutdownNow();
		}
	}

	@Test
	void manyStartsAtOnceLeaveOnePracticeGameInPlayForAnAccountAndForAGuest() throws Exception {
		for (Owner owner : List.of(account().owner(), new Owner(null, UUID.randomUUID()))) {
			List<RunResponse> runs = all(List.of(owner, owner, owner, owner, owner, owner, owner, owner), Difficulty.MEDIUM);
			assertThat(runs).hasSize(8);
			assertThat(playing(owner)).hasSize(1);
			assertThat(practice(owner, "ABANDONED")).hasSize(7);
			// Each start still got a puzzle of its own: the repeat guard holds under the race.
			assertThat(runs.stream().map(RunResponse::givens).distinct()).hasSize(8);
		}
	}

	@Test
	void differentPlayersStartAtOnceAndEachKeepsTheirOwnGame() throws Exception {
		List<Owner> owners = new ArrayList<>();
		for (int player = 0; player < 8; player++) {
			owners.add((player % 2 == 0) ? account().owner() : new Owner(null, UUID.randomUUID()));
		}
		List<RunResponse> runs = all(owners, Difficulty.HARD);
		assertThat(runs).hasSize(8);
		for (Owner owner : owners) {
			assertThat(playing(owner)).hasSize(1);
			assertThat(practice(owner, "ABANDONED")).isEmpty();
		}
	}

	@Test
	void startsAtOnceLeaveTheDailyRunAlone() throws Exception {
		Player player = account();
		Owner owner = player.owner();
		String dailySession = gameSession(player.session(), "classic");
		this.mockMvc.perform(post("/api/sudoku/daily/runs").session(player.session())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(dailySession))).andExpect(status().isOk());
		String others = otherRuns(owner);
		assertThat(others).contains("DAILY,PLAYING");

		all(List.of(owner, owner, owner, owner), Difficulty.EASY);
		assertThat(playing(owner)).hasSize(1);
		assertThat(otherRuns(owner)).isEqualTo(others);
	}

	@Test
	void rankedStartsAtOnceWithTheSameSessionGiveTheOneGameOfThatSession() throws Exception {
		Player player = account();
		Owner owner = player.owner();
		UUID session = UUID.fromString(gameSession(player.session(), "classic"));
		List<RunResponse> runs = all(List.of(owner, owner, owner), Difficulty.EASY, session);
		assertThat(runs.stream().map(RunResponse::id).distinct()).hasSize(1);
		assertThat(runs.get(0).ranked()).isTrue();
		assertThat(playing(owner)).containsExactly(runs.get(0).id());
		assertThat(practice(owner, "ABANDONED")).isEmpty();
	}

	// --- Helpers ---------------------------------------------------------------------------------------

	private record Player(MockHttpSession session, Owner owner) {
	}

	private Player account() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		return new Player(session, new Owner(Players.userId(this.mockMvc, session), null));
	}

	private List<RunResponse> all(List<Owner> owners, Difficulty difficulty) throws Exception {
		return all(owners, difficulty, null);
	}

	/** Starts a practice game for each owner, all released at the same moment. */
	private List<RunResponse> all(List<Owner> owners, Difficulty difficulty, UUID session) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(owners.size());
		try {
			CyclicBarrier together = new CyclicBarrier(owners.size());
			List<Future<RunResponse>> starts = new ArrayList<>();
			for (Owner owner : owners) {
				Callable<RunResponse> start = () -> {
					together.await(10, TimeUnit.SECONDS);
					return this.sudoku.startPractice(owner, difficulty, session);
				};
				starts.add(pool.submit(start));
			}
			List<RunResponse> runs = new ArrayList<>();
			for (Future<RunResponse> start : starts) {
				runs.add(start.get(60, TimeUnit.SECONDS));
			}
			return runs;
		}
		finally {
			pool.shutdownNow();
		}
	}

	private List<UUID> playing(Owner owner) {
		return practice(owner, "PLAYING");
	}

	private List<UUID> practice(Owner owner, String status) {
		return this.jdbc.sql("SELECT id FROM sudoku_runs WHERE mode = 'PRACTICE' AND status = :status AND "
				+ owned(owner) + " ORDER BY started_at")
			.param("status", status)
			.param("owner", (owner.userId() != null) ? owner.userId() : owner.playerId())
			.query(UUID.class)
			.list();
	}

	/** The player's non-Practice runs, whole. */
	private String otherRuns(Owner owner) {
		return this.jdbc.sql("SELECT string_agg(mode || ',' || status || ',' || r::text, '|' ORDER BY mode) FROM sudoku_runs r "
				+ "WHERE mode <> 'PRACTICE' AND " + owned(owner))
			.param("owner", (owner.userId() != null) ? owner.userId() : owner.playerId())
			.query(String.class)
			.single();
	}

	private static String owned(Owner owner) {
		return (owner.userId() != null) ? "user_id = :owner" : "user_id IS NULL AND player_id = :owner";
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
