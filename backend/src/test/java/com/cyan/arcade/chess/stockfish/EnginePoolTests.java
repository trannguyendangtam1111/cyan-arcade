package com.cyan.arcade.chess.stockfish;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The bounded pool: never more engines than allowed, each search on its own engine, failures replaced. */
class EnginePoolTests {

	private final List<FakeUciProcess> processes = new CopyOnWriteArrayList<>();

	private final AtomicInteger busy = new AtomicInteger();

	private final AtomicInteger mostBusy = new AtomicInteger();

	private EnginePool pool;

	/**
	 * Engines that take a little time over each search and answer with a move named after the search's
	 * position, so a mix-up between searches would show.
	 */
	private EnginePool pool(int size, int maxWaiting) {
		this.pool = new EnginePool(() -> {
			FakeUciProcess process = new FakeUciProcess();
			process.onGo = (commands) -> {
				int now = this.busy.incrementAndGet();
				this.mostBusy.accumulateAndGet(now, Math::max);
				sleep(20);
				this.busy.decrementAndGet();
				String last = commands[0].substring(commands[0].lastIndexOf(' ') + 1);
				return List.of("info depth 4 score cp 1 pv " + last, "bestmove " + last);
			};
			this.processes.add(process);
			return UciEngine.start(process, 1, 16, Duration.ofSeconds(1), Duration.ofMillis(200));
		}, size, maxWaiting);
		return this.pool;
	}

	@AfterEach
	void close() {
		if (this.pool != null) {
			this.pool.close();
		}
	}

	@Test
	void concurrentSearchesShareAtMostThePoolsEnginesAndNeverEachOthersResults() throws Exception {
		EnginePool engines = pool(2, 50);
		String[] moves = { "a2a3", "b2b3", "c2c3", "d2d3", "e2e3", "f2f3", "g2g3", "h2h3" };
		ExecutorService threads = Executors.newFixedThreadPool(8);
		try {
			List<Future<String>> answers = new ArrayList<>();
			for (int index = 0; index < 24; index++) {
				String move = moves[index % moves.length];
				answers.add(threads.submit(() -> {
					try (EnginePool.Lease lease = engines.acquire(Duration.ofSeconds(5))) {
						SearchRequest request = new SearchRequest(null, List.of(move), new SearchRequest.Limits(4, null, null), 1,
								SearchRequest.Strength.FULL);
						return lease.engine().search(request, Duration.ofSeconds(2), () -> false).bestMove();
					}
				}));
			}
			for (int index = 0; index < answers.size(); index++) {
				assertThat(answers.get(index).get(10, TimeUnit.SECONDS)).isEqualTo(moves[index % moves.length]);
			}
		}
		finally {
			threads.shutdownNow();
		}
		assertThat(this.processes).hasSize(2);
		assertThat(this.mostBusy.get()).isLessThanOrEqualTo(2);
		assertThat(engines.idleEngines()).isEqualTo(2);
	}

	@Test
	void tooManyWaitingRequestsAreRefusedAtOnce() throws Exception {
		EnginePool engines = pool(1, 0);
		try (EnginePool.Lease held = engines.acquire(Duration.ofSeconds(1))) {
			long started = System.nanoTime();
			assertThatThrownBy(() -> engines.acquire(Duration.ofSeconds(5)))
				.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.BUSY));
			assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
		}
	}

	@Test
	void aRequestWaitsOnlySoLongForAnEngine() throws Exception {
		EnginePool engines = pool(1, 5);
		CountDownLatch holding = new CountDownLatch(1);
		try (EnginePool.Lease held = engines.acquire(Duration.ofSeconds(1))) {
			holding.countDown();
			assertThatThrownBy(() -> engines.acquire(Duration.ofMillis(100)))
				.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.BUSY));
		}
		// Given back, it is lent again.
		try (EnginePool.Lease again = engines.acquire(Duration.ofMillis(100))) {
			assertThat(again.engine().isHealthy()).isTrue();
		}
	}

	@Test
	void aBrokenEngineIsEndedAndReplaced() {
		EnginePool engines = pool(1, 1);
		try (EnginePool.Lease lease = engines.acquire(Duration.ofSeconds(1))) {
			this.processes.get(0).alive = false;
		}
		assertThat(this.processes.get(0).destroyed).isTrue();
		assertThat(engines.idleEngines()).isZero();

		try (EnginePool.Lease lease = engines.acquire(Duration.ofSeconds(1))) {
			assertThat(lease.engine().isHealthy()).isTrue();
		}
		assertThat(this.processes).hasSize(2);
	}

	@Test
	void anEngineThatCannotStartIsUnavailableAndLeavesThePoolUsable() {
		AtomicInteger attempts = new AtomicInteger();
		this.pool = new EnginePool(() -> {
			if (attempts.incrementAndGet() == 1) {
				throw new EngineException(EngineException.Kind.UNAVAILABLE, "no binary");
			}
			return UciEngine.start(new FakeUciProcess(), 1, 16, Duration.ofSeconds(1), Duration.ofMillis(200));
		}, 1, 0);

		assertThatThrownBy(() -> this.pool.acquire(Duration.ofSeconds(1)))
			.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.UNAVAILABLE));
		// The failed start gave its place back.
		try (EnginePool.Lease lease = this.pool.acquire(Duration.ofSeconds(1))) {
			assertThat(lease.engine().name()).isEqualTo("Fake Engine 1");
		}
	}

	@Test
	void closingThePoolEndsItsEnginesAndRefusesNewLoans() {
		EnginePool engines = pool(2, 1);
		engines.acquire(Duration.ofSeconds(1)).close();
		engines.close();

		assertThat(this.processes).allSatisfy((process) -> assertThat(process.destroyed).isTrue());
		assertThatThrownBy(() -> engines.acquire(Duration.ofSeconds(1))).isInstanceOf(EngineException.class);
	}

	private static void sleep(long millis) {
		try {
			Thread.sleep(millis);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
	}

}
