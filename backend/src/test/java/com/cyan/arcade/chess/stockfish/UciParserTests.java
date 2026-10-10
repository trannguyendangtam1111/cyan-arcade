package com.cyan.arcade.chess.stockfish;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Lines as Stockfish 19 writes them (copied from real output), and lines it must survive. */
class UciParserTests {

	@Test
	void anInfoLineGivesDepthScoreAndPrincipalVariation() {
		UciParser.Info info = UciParser.parseInfo(
				"info depth 16 seldepth 21 multipv 1 score cp -29 nodes 171739 nps 572463 hashfull 59 tbhits 0 time 300 pv e7e6 d2d4 d7d5 b1c3");

		assertThat(info.depth()).isEqualTo(16);
		assertThat(info.seldepth()).isEqualTo(21);
		assertThat(info.multipv()).isEqualTo(1);
		assertThat(info.score()).isEqualTo(EngineScore.centipawns(-29));
		assertThat(info.nodes()).isEqualTo(171739);
		assertThat(info.timeMs()).isEqualTo(300);
		assertThat(info.pv()).containsExactly("e7e6", "d2d4", "d7d5", "b1c3");
	}

	@Test
	void mateScoresAreKeptApartFromCentipawns() {
		assertThat(UciParser.parseInfo("info depth 6 seldepth 4 multipv 1 score mate 2 nodes 236 time 1 pv g7g8q a8a7 g8a2").score())
			.isEqualTo(EngineScore.mate(2));
		assertThat(UciParser.parseInfo("info depth 9 multipv 2 score mate -3 pv h1h2").score())
			.isEqualTo(EngineScore.mate(-3));
		// The side to move is mated already: Stockfish says so at depth 0, then "bestmove (none)".
		assertThat(UciParser.parseInfo("info depth 0 score mate 0").score()).isEqualTo(EngineScore.mate(0));
	}

	@Test
	void boundsAreMarked() {
		UciParser.Info lower = UciParser.parseInfo(
				"info depth 15 seldepth 21 multipv 1 score cp 30 lowerbound nodes 51323 time 92 pv e2e4 e7e5");
		assertThat(lower.score().bound()).isEqualTo(EngineScore.Bound.LOWER);
		assertThat(lower.score().value()).isEqualTo(30);
		assertThat(lower.pv()).containsExactly("e2e4", "e7e5");
		assertThat(UciParser.parseInfo("info depth 15 score cp -12 upperbound pv d2d4").score().bound())
			.isEqualTo(EngineScore.Bound.UPPER);
	}

	@Test
	void promotionsAreMovesToo() {
		assertThat(UciParser.parseInfo("info depth 3 score mate 2 pv g7g8q a8a7 g8a2").pv()).containsExactly("g7g8q",
				"a8a7", "g8a2");
		assertThat(UciParser.parseBestMove("bestmove g7g8n ponder a8a7")).isEqualTo(new UciParser.BestMove("g7g8n", "a8a7"));
	}

	@Test
	void bestMoveLinesAreRead() {
		assertThat(UciParser.parseBestMove("bestmove e7e6 ponder d2d4")).isEqualTo(new UciParser.BestMove("e7e6", "d2d4"));
		assertThat(UciParser.parseBestMove("bestmove e2e4")).isEqualTo(new UciParser.BestMove("e2e4", null));
		// No move in a finished position.
		assertThat(UciParser.parseBestMove("bestmove (none)")).isEqualTo(new UciParser.BestMove(null, null));
		assertThat(UciParser.parseBestMove("bestmove 0000")).isEqualTo(new UciParser.BestMove(null, null));
	}

	@ParameterizedTest
	@ValueSource(strings = { "info string NNUE evaluation using nn-1a298aa575a0.nnue", "info depth 12 currmove e2e4 currmovenumber 1",
			"info depth", "info depth x score cp 1", "info score cp 1", "info depth 3 score cp", "info depth 3 score banana 4",
			"readyok", "" })
	void chatterAndGarbageAreNotSearchInformation(String line) {
		assertThat(UciParser.parseInfo(line)).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = { "bestmove", "bestmove e2", "bestmove e2e9", "bestmovee2e4", "bestmove castle" })
	void malformedBestMovesAreRefused(String line) {
		assertThat(UciParser.parseBestMove(line)).isNull();
	}

	@Test
	void aBadMoveEndsThePrincipalVariation() {
		assertThat(UciParser.parseInfo("info depth 5 score cp 10 pv e2e4 xx e7e5").pv()).containsExactly("e2e4");
	}

	@Test
	void scoresTurnRoundForWhite() {
		assertThat(EngineScore.centipawns(40).forWhite(true)).isEqualTo(EngineScore.centipawns(40));
		assertThat(EngineScore.centipawns(40).forWhite(false)).isEqualTo(EngineScore.centipawns(-40));
		assertThat(EngineScore.mate(3).forWhite(false)).isEqualTo(EngineScore.mate(-3));
		assertThat(new EngineScore(EngineScore.Kind.CENTIPAWNS, 30, EngineScore.Bound.LOWER).negate().bound())
			.isEqualTo(EngineScore.Bound.UPPER);
	}

}
