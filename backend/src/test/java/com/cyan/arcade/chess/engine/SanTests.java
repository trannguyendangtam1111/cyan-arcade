package com.cyan.arcade.chess.engine;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** Standard algebraic notation for every kind of move. */
class SanTests {

	@ParameterizedTest(name = "{2} in {0}")
	@CsvSource(delimiter = '|', textBlock = """
			pawn push                    | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 | e2e4  | e4
			knight                       | rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 | g1f3  | Nf3
			pawn capture                 | 4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1                        | e4d5  | exd5
			piece capture                | 4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1                         | d1d5  | Qxd5
			en passant                   | 4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1                        | e5d6  | exd6
			kingside castling            | 4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1                         | e1g1  | O-O
			queenside castling           | 4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1                         | e1c1  | O-O-O
			promotion with check         | 8/P7/8/8/8/8/8/k6K w - - 0 1                             | a7a8q | a8=Q+
			underpromotion               | 8/P7/8/8/8/8/8/k6K w - - 0 1                             | a7a8n | a8=N
			capture and promotion        | 1r5k/P7/8/8/8/8/8/K7 w - - 0 1                           | a7b8q | axb8=Q+
			check                        | 4k3/8/8/8/8/8/8/R3K3 w - - 0 1                           | a1a8  | Ra8+
			checkmate                    | rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2 | d8h4 | Qh4#
			by file                      | 4k3/8/8/8/8/8/8/R4RK1 w - - 0 1                          | a1d1  | Rad1
			by file, the other one       | 4k3/8/8/8/8/8/8/R4RK1 w - - 0 1                          | f1d1  | Rfd1
			by rank                      | 4k3/8/8/R7/8/8/8/R5K1 w - - 0 1                          | a1a3  | R1a3
			by rank, the other one       | 4k3/8/8/R7/8/8/8/R5K1 w - - 0 1                          | a5a3  | R5a3
			by file and rank             | 4k3/8/8/8/8/Q7/8/Q1Q4K w - - 0 1                         | a1b2  | Qa1b2
			a pinned twin needs no name  | k7/8/8/8/7K/2N3N1/8/4b3 w - - 0 1                        | c3e4  | Ne4
			""")
	void movesAreWrittenAsStandardAlgebraicNotation(String name, String fen, String uci, String san) {
		assertThat(San.of(Position.fromFen(fen), Move.parse(uci))).isEqualTo(san);
	}

	@Test
	void onlyLegalMovesHaveANotation() {
		assertThatIllegalArgumentException().isThrownBy(() -> San.of(Position.initial(), Move.parse("e2e5")));
	}

}
