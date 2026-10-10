package com.cyan.arcade.chess.engine;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Perft: the number of legal move sequences of a given length from a position, compared with the
 * published counts for the standard test positions (chessprogramming.org, "Perft Results"). They
 * cover castling through and out of check, en passant (with its discovered checks), promotions
 * with and without captures, pins and double checks, so a single wrong rule shows up as a wrong
 * count.
 */
class PerftTests {

	@ParameterizedTest(name = "{0} depth {2}")
	@CsvSource(delimiter = '|', textBlock = """
			initial      | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1             | 1 | 20
			initial      | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1             | 2 | 400
			initial      | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1             | 3 | 8902
			initial      | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1             | 4 | 197281
			kiwipete     | r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1 | 1 | 48
			kiwipete     | r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1 | 2 | 2039
			kiwipete     | r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1 | 3 | 97862
			position 3   | 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1                            | 1 | 14
			position 3   | 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1                            | 3 | 2812
			position 3   | 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1                            | 4 | 43238
			position 3   | 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1                            | 5 | 674624
			position 4   | r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1     | 1 | 6
			position 4   | r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1     | 2 | 264
			position 4   | r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1     | 3 | 9467
			position 4 b | r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1     | 3 | 9467
			position 5   | rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8            | 1 | 44
			position 5   | rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8            | 2 | 1486
			position 5   | rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8            | 3 | 62379
			position 6   | r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10 | 1 | 46
			position 6   | r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10 | 2 | 2079
			position 6   | r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10 | 3 | 89890
			""")
	void countsMatchThePublishedNumbers(String name, String fen, int depth, long expected) {
		assertThat(perft(Position.fromFen(fen), depth)).isEqualTo(expected);
	}

	static long perft(Position position, int depth) {
		if (depth == 1) {
			return position.legalMoves().size();
		}
		long nodes = 0;
		for (Move move : position.legalMoves()) {
			nodes += perft(position.play(move), depth - 1);
		}
		return nodes;
	}

}
