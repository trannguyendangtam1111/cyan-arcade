package com.cyan.arcade.chess.stockfish;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The UCI conversation with one engine, against a scripted process. */
class UciEngineTests {

	private static final Duration READY = Duration.ofSeconds(2);

	private static final Duration GRACE = Duration.ofMillis(300);

	private static final SearchRequest START = new SearchRequest(null, List.of(),
			new SearchRequest.Limits(10, null, null), 1, SearchRequest.Strength.FULL);

	private final FakeUciProcess process = new FakeUciProcess();

	private UciEngine start() {
		return UciEngine.start(this.process, 1, 16, READY, GRACE);
	}

	// --- Starting -------------------------------------------------------------------------------------

	@Test
	void theHandshakeReadsTheNameAndSetsTheFixedOptions() {
		UciEngine engine = start();

		assertThat(engine.name()).isEqualTo("Fake Engine 1");
		assertThat(engine.isHealthy()).isTrue();
		assertThat(this.process.received).containsExactly("uci", "setoption name Threads value 1",
				"setoption name Hash value 16", "isready");
	}

	@Test
	void anEngineThatNeverSaysUciokIsUnavailableAndEnded() {
		this.process.answersUci = false;

		assertThatThrownBy(() -> UciEngine.start(this.process, 1, 16, Duration.ofMillis(200), GRACE))
			.isInstanceOfSatisfying(EngineException.class,
					(ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.UNAVAILABLE));
		assertThat(this.process.destroyed).isTrue();
	}

	// --- Searching ------------------------------------------------------------------------------------

	@Test
	void aSearchSetsItsOwnOptionsAndReadsEveryLine() {
		UciEngine engine = start();
		this.process.onGo = (commands) -> List.of("info string thinking", "info depth 1 multipv 1 score cp 20 pv d2d4",
				"info depth 1 multipv 2 score cp 10 pv e2e4", "info depth 12 seldepth 15 multipv 1 score cp 31 nodes 900 pv e2e4 e7e5 g1f3",
				"info depth 12 seldepth 14 multipv 2 score cp 18 nodes 900 pv d2d4 d7d5",
				"info depth 13 multipv 1 score cp 40 lowerbound pv e2e4", "bestmove e2e4 ponder e7e5");
		SearchRequest request = new SearchRequest(null, List.of("e2e4", "e7e5"), new SearchRequest.Limits(13, 500, null), 2,
				SearchRequest.Strength.FULL);

		SearchResult result = engine.search(request, Duration.ofSeconds(2), () -> false);

		assertThat(this.process.sent("setoption name UCI_LimitStrength")).containsExactly("setoption name UCI_LimitStrength value false");
		assertThat(this.process.sent("setoption name Skill Level")).containsExactly("setoption name Skill Level value 20");
		assertThat(this.process.sent("setoption name MultiPV")).containsExactly("setoption name MultiPV value 2");
		assertThat(this.process.sent("position")).containsExactly("position startpos moves e2e4 e7e5");
		assertThat(this.process.sent("go")).containsExactly("go depth 13 movetime 500");
		assertThat(result.bestMove()).isEqualTo("e2e4");
		assertThat(result.ponder()).isEqualTo("e7e5");
		assertThat(result.depth()).isEqualTo(13);
		assertThat(result.interrupted()).isFalse();
		// The exact report beats a later bound.
		assertThat(result.lines()).extracting(SearchResult.Line::multipv).containsExactly(1, 2);
		assertThat(result.best().score()).isEqualTo(EngineScore.centipawns(31));
		assertThat(result.best().pv()).containsExactly("e2e4", "e7e5", "g1f3");
		assertThat(result.lines().get(1).score()).isEqualTo(EngineScore.centipawns(18));
	}

	@Test
	void aWeakerEngineIsAskedForWithItsOwnOptions() {
		UciEngine engine = start();
		SearchRequest club = new SearchRequest("8/8/8/8/8/8/k7/7K w - - 0 1", List.of(), new SearchRequest.Limits(null, 100, null),
				1, new SearchRequest.Strength(20, 1600));
		SearchRequest beginner = new SearchRequest(null, List.of(), new SearchRequest.Limits(null, 100, null), 1,
				new SearchRequest.Strength(0, null));
		SearchRequest tooStrong = new SearchRequest(null, List.of(), new SearchRequest.Limits(null, 100, null), 1,
				new SearchRequest.Strength(20, 9000));

		engine.search(club, Duration.ofSeconds(1), () -> false);
		engine.search(beginner, Duration.ofSeconds(1), () -> false);
		engine.search(tooStrong, Duration.ofSeconds(1), () -> false);

		assertThat(this.process.sent("setoption name UCI_")).containsExactly("setoption name UCI_LimitStrength value true",
				"setoption name UCI_Elo value 1600", "setoption name UCI_LimitStrength value false",
				"setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 3190");
		assertThat(this.process.sent("setoption name Skill Level")).containsExactly("setoption name Skill Level value 20",
				"setoption name Skill Level value 0", "setoption name Skill Level value 20");
		assertThat(this.process.sent("position")).first().isEqualTo("position fen 8/8/8/8/8/8/k7/7K w - - 0 1");
	}

	@Test
	void aFinishedPositionHasNoBestMove() {
		UciEngine engine = start();
		this.process.onGo = (commands) -> List.of("info depth 0 score mate 0", "bestmove (none)");

		SearchResult result = engine.search(START, Duration.ofSeconds(1), () -> false);

		assertThat(result.bestMove()).isNull();
		assertThat(result.best().score()).isEqualTo(EngineScore.mate(0));
	}

	@Test
	void outputLeftFromAnEarlierSearchIsNeverTakenForThisOne() {
		UciEngine engine = start();
		this.process.output.add("info depth 30 score cp 999 pv a2a3");
		this.process.output.add("bestmove a2a3");

		SearchResult result = engine.search(START, Duration.ofSeconds(1), () -> false);

		assertThat(result.bestMove()).isEqualTo("e2e4");
		assertThat(result.best().score().value()).isEqualTo(25);
	}

	// --- Stopping, failing ----------------------------------------------------------------------------

	@Test
	void aSearchThatRunsOverIsStoppedAndItsResultMarkedIncomplete() {
		UciEngine engine = start();
		this.process.onGo = (commands) -> List.of("info depth 7 score cp 12 pv g1f3");
		this.process.onStop = List.of("info depth 8 score cp 14 upperbound pv g1f3", "bestmove g1f3");

		SearchResult result = engine.search(START, Duration.ofMillis(100), () -> false);

		assertThat(this.process.sent("stop")).hasSize(1);
		assertThat(result.interrupted()).isTrue();
		assertThat(result.bestMove()).isEqualTo("g1f3");
		assertThat(result.best().score()).isEqualTo(EngineScore.centipawns(12));
		assertThat(engine.isHealthy()).isTrue();
	}

	@Test
	void anEngineThatIgnoresStopTimesOutAndIsRetired() {
		UciEngine engine = start();
		this.process.onGo = (commands) -> List.of();
		this.process.onStop = List.of();

		assertThatThrownBy(() -> engine.search(START, Duration.ofMillis(50), () -> false))
			.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.TIMEOUT));
		assertThat(engine.isHealthy()).isFalse();
		assertThatThrownBy(() -> engine.search(START, Duration.ofSeconds(1), () -> false)).isInstanceOf(EngineException.class);
	}

	@Test
	void aCancelledSearchIsStoppedAndTheEngineStaysUsable() {
		UciEngine engine = start();
		AtomicBoolean cancelled = new AtomicBoolean();
		this.process.onGo = (commands) -> {
			cancelled.set(true);
			return List.of();
		};

		assertThatThrownBy(() -> engine.search(START, Duration.ofSeconds(5), cancelled::get))
			.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.CANCELLED));
		assertThat(this.process.sent("stop")).hasSize(1);
		assertThat(engine.isHealthy()).isTrue();

		this.process.onGo = (commands) -> List.of("info depth 5 score cp 3 pv d2d4", "bestmove d2d4");
		assertThat(engine.search(START, Duration.ofSeconds(1), () -> false).bestMove()).isEqualTo("d2d4");
	}

	@Test
	void anEngineThatDiesMidSearchIsReportedAsCrashed() {
		UciEngine engine = start();
		this.process.onGo = (commands) -> {
			this.process.alive = false;
			return List.of("info depth 3 score cp 1 pv e2e4");
		};

		assertThatThrownBy(() -> engine.search(START, Duration.ofSeconds(1), () -> false))
			.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.CRASHED));
		assertThat(engine.isHealthy()).isFalse();
	}

	@Test
	void garbageInsteadOfABestMoveIsAProtocolError() {
		UciEngine engine = start();
		this.process.onGo = (commands) -> List.of("bestmove ???");

		assertThatThrownBy(() -> engine.search(START, Duration.ofSeconds(1), () -> false))
			.isInstanceOfSatisfying(EngineException.class, (ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.PROTOCOL));
		assertThat(engine.isHealthy()).isFalse();
	}

	@Test
	void closingEndsTheProcess() {
		UciEngine engine = start();
		engine.close();
		assertThat(this.process.destroyed).isTrue();
		assertThat(engine.isHealthy()).isFalse();
	}

}
