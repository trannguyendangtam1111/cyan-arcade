package com.cyan.arcade.chess.stockfish;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The adapter against the real Stockfish, with small searches. It runs only where the engine is
 * installed (STOCKFISH_PATH, or tools/stockfish/install.sh's dist/); everywhere else the protocol is
 * covered by the scripted tests.
 */
@EnabledIf("installed")
class RealStockfishTests {

	private static final Path BINARY = StockfishEngineAdapter.resolve(Path.of(
			System.getenv().getOrDefault("STOCKFISH_PATH", "../tools/stockfish/dist/stockfish")));

	private static StockfishEngineAdapter engine;

	static boolean installed() {
		return Files.isRegularFile(BINARY);
	}

	@BeforeAll
	static void start() {
		engine = new StockfishEngineAdapter(StockfishEngineAdapter.binaryAt(BINARY), 2, 4, 1, 16, Duration.ofSeconds(5),
				Duration.ofSeconds(30), Duration.ofSeconds(2));
	}

	@AfterAll
	static void stop() {
		engine.close();
	}

	private static SearchRequest at(String fen, int depth, int lines, SearchRequest.Strength strength) {
		return new SearchRequest(fen, List.of(), new SearchRequest.Limits(depth, null, null), lines, strength);
	}

	@Test
	void itIsThePinnedStockfish() {
		assertThat(engine.engineName()).isEqualTo("Stockfish 19");
	}

	@Test
	void itFindsAMateAndSaysSoAsAMate() {
		SearchResult result = engine.search(at("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", 10, 1, SearchRequest.Strength.FULL),
				Duration.ofSeconds(10), () -> false);

		assertThat(result.bestMove()).isEqualTo("a1a8");
		assertThat(result.best().score()).isEqualTo(EngineScore.mate(1));
		assertThat(result.interrupted()).isFalse();
	}

	@Test
	void itPromotesWithTheUciPromotionLetter() {
		SearchResult result = engine.search(at("k7/6P1/8/8/8/8/8/1R5K w - - 0 1", 8, 1, SearchRequest.Strength.FULL),
				Duration.ofSeconds(10), () -> false);

		assertThat(result.bestMove()).matches("g7g8[qr]");
		assertThat(result.best().score().isMate()).isTrue();
		assertThat(result.best().score().value()).isPositive();
	}

	@Test
	void aFinishedPositionHasNoMove() {
		SearchResult mated = engine.search(at("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", 5, 1,
				SearchRequest.Strength.FULL), Duration.ofSeconds(5), () -> false);
		SearchResult stalemate = engine.search(at("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", 5, 1, SearchRequest.Strength.FULL),
				Duration.ofSeconds(5), () -> false);

		assertThat(mated.bestMove()).isNull();
		assertThat(mated.best().score()).isEqualTo(EngineScore.mate(0));
		assertThat(stalemate.bestMove()).isNull();
		assertThat(stalemate.best().score()).isEqualTo(EngineScore.centipawns(0));
	}

	@Test
	void itGivesSeveralLinesBestFirst() {
		SearchResult result = engine.search(new SearchRequest(null, List.of("e2e4", "e7e5"),
				new SearchRequest.Limits(10, null, null), 3, SearchRequest.Strength.FULL), Duration.ofSeconds(10), () -> false);

		assertThat(result.lines()).hasSize(3);
		assertThat(result.lines()).extracting(SearchResult.Line::multipv).containsExactly(1, 2, 3);
		assertThat(result.lines().get(0).pv().get(0)).isEqualTo(result.bestMove());
	}

	@Test
	void weakerSettingsAreAcceptedAndALongSearchIsStoppedOnTime() {
		SearchResult weak = engine.search(new SearchRequest(null, List.of(), new SearchRequest.Limits(null, 100, null), 1,
				new SearchRequest.Strength(0, null)), Duration.ofSeconds(5), () -> false);
		SearchResult elo = engine.search(new SearchRequest(null, List.of(), new SearchRequest.Limits(null, 100, null), 1,
				new SearchRequest.Strength(20, 1600)), Duration.ofSeconds(5), () -> false);
		assertThat(weak.bestMove()).isNotNull();
		assertThat(elo.bestMove()).isNotNull();

		long started = System.nanoTime();
		SearchResult cut = engine.search(at(null, 60, 1, SearchRequest.Strength.FULL), Duration.ofMillis(300), () -> false);
		assertThat(cut.interrupted()).isTrue();
		assertThat(cut.bestMove()).isNotNull();
		assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(3));

		assertThatThrownBy(() -> engine.search(at(null, 60, 1, SearchRequest.Strength.FULL), Duration.ofSeconds(30),
				() -> true)).isInstanceOfSatisfying(EngineException.class,
						(ex) -> assertThat(ex.kind()).isEqualTo(EngineException.Kind.CANCELLED));
		// Both engines are still fine after that.
		assertThat(engine.search(at(null, 6, 1, SearchRequest.Strength.FULL), Duration.ofSeconds(5), () -> false).bestMove())
			.isNotNull();
	}

}
