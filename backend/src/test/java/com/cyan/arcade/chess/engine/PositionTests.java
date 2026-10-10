package com.cyan.arcade.chess.engine;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** One position at a time: the board, how each piece moves, and the special moves' conditions. */
class PositionTests {

	// --- The board and FEN ---------------------------------------------------------------------------

	@Test
	void theInitialPositionHasEveryPieceInPlaceAndWhiteToMove() {
		Position position = Position.initial();

		assertThat(position.toFen()).isEqualTo(Position.INITIAL_FEN);
		assertThat(position.turn()).isEqualTo(Color.WHITE);
		assertThat(position.pieceAt(Square.parse("e1"))).isEqualTo(Piece.of(Color.WHITE, PieceType.KING));
		assertThat(position.pieceAt(Square.parse("d8"))).isEqualTo(Piece.of(Color.BLACK, PieceType.QUEEN));
		assertThat(position.pieceAt(Square.parse("e4"))).isNull();
		assertThat(position.canCastle(Color.WHITE, true)).isTrue();
		assertThat(position.canCastle(Color.BLACK, false)).isTrue();
		assertThat(position.inCheck()).isFalse();
		// Sixteen pawn moves and four knight moves.
		assertThat(position.legalMoves()).hasSize(20);
		assertThat(uci(position)).contains("e2e4", "e2e3", "g1f3", "b1c3").doesNotContain("e1e2", "a1a2", "f1c4");
	}

	@ParameterizedTest
	@ValueSource(strings = { "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
			"r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", "8/8/8/8/8/8/8/K6k w - - 12 40" })
	void fenGoesBothWays(String fen) {
		assertThat(Position.fromFen(fen).toFen()).isEqualTo(fen);
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1",
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1",
			"rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w KQkq - 0 1",
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e4 0 1", "P3k3/8/8/8/8/8/8/4K3 w - - 0 1",
			"4k3/8/8/8/8/8/8/4R2K w - - 0 1" })
	void nonsenseIsNotAPosition(String fen) {
		assertThatIllegalArgumentException().isThrownBy(() -> Position.fromFen(fen));
	}

	// --- How each piece moves ------------------------------------------------------------------------

	@ParameterizedTest(name = "{0}")
	@CsvSource(delimiter = '|', textBlock = """
			knight in the centre    | 4k3/8/8/8/3N4/8/8/4K3 w - - 0 1 | d4 | 8
			knight in a corner      | 4k3/8/8/8/8/8/8/N3K3 w - - 0 1  | a1 | 2
			bishop in the centre    | 4k3/8/8/8/3B4/8/8/4K3 w - - 0 1 | d4 | 13
			rook in the centre      | 4k3/8/8/8/3R4/8/8/4K3 w - - 0 1 | d4 | 14
			queen in the centre     | 4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1 | d4 | 27
			king on its own         | 4k3/8/8/8/8/8/8/4K3 w - - 0 1   | e1 | 5
			king in the centre      | 4k3/8/8/8/3K4/8/8/8 w - - 0 1   | d4 | 8
			pawn on its first move  | 4k3/8/8/8/8/8/4P3/4K3 w - - 0 1 | e2 | 2
			pawn later on           | 4k3/8/8/8/8/4P3/8/4K3 w - - 0 1 | e3 | 1
			blocked pawn            | 4k3/8/8/8/8/4p3/4P3/4K3 w - - 0 1 | e2 | 0
			pawn with two captures  | 4k3/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1 | e4 | 3
			black pawn moves down   | 4k3/4p3/8/8/8/8/8/4K3 b - - 0 1 | e7 | 2
			""")
	void eachPieceMovesItsOwnWay(String name, String fen, String square, int moves) {
		Position position = Position.fromFen(fen);
		int from = Square.parse(square);

		assertThat(position.legalMoves().stream().filter((move) -> move.from() == from)).hasSize(moves);
	}

	@Test
	void slidingPiecesStopAtTheFirstPieceAndMayTakeOnlyAnEnemy() {
		Position position = Position.fromFen("4k3/8/8/3p4/8/8/3P4/3RK3 w - - 0 1");

		assertThat(uci(position)).doesNotContain("d1d2", "d1d3").contains("d2d3", "d2d4");
		Position queen = Position.fromFen("4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1");
		assertThat(uci(queen)).contains("d1d5").doesNotContain("d1d6", "d1d8");
	}

	// --- Illegal moves -------------------------------------------------------------------------------

	@Test
	void aMoveThatLeavesTheKingInCheckIsIllegal() {
		// The knight on e2 is pinned to its king by the rook on e7.
		Position pinned = Position.fromFen("4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1");
		assertThat(pinned.legalMoves().stream().filter((move) -> move.from() == Square.parse("e2"))).isEmpty();

		// The king may not step onto an attacked square, nor stay in check.
		Position check = Position.fromFen("4k3/8/8/8/8/8/3r4/4K3 w - - 0 1");
		assertThat(check.inCheck()).isFalse();
		assertThat(uci(check)).containsExactlyInAnyOrder("e1f1", "e1d2");

		Position inCheck = Position.fromFen("4k3/4r3/8/8/8/8/8/R3K3 w - - 0 1");
		assertThat(inCheck.inCheck()).isTrue();
		// Only the king can answer: the rook cannot reach the e-file between them.
		assertThat(uci(inCheck)).containsExactlyInAnyOrder("e1d1", "e1d2", "e1f1", "e1f2");
	}

	@Test
	void aPinnedPieceMayMoveAlongItsPin() {
		Position position = Position.fromFen("4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1");

		assertThat(uci(position).stream().filter((move) -> move.startsWith("e2")))
			.containsExactlyInAnyOrder("e2e3", "e2e4", "e2e5", "e2e6", "e2e7");
	}

	@Test
	void playRefusesAnIllegalMove() {
		Position position = Position.initial();

		assertThatIllegalArgumentException().isThrownBy(() -> position.play(Move.parse("e2e5")));
		assertThatIllegalArgumentException().isThrownBy(() -> position.play(Move.parse("e7e5")));
		assertThatIllegalArgumentException().isThrownBy(() -> position.play(Move.parse("a1a3")));
		assertThatIllegalArgumentException().isThrownBy(() -> position.play(Move.parse("e4e5")));
	}

	// --- Castling ------------------------------------------------------------------------------------

	@Test
	void bothSidesCastleWhenEverythingAllowsIt() {
		Position position = Position.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");

		assertThat(uci(position)).contains("e1g1", "e1c1");
		Position kingside = position.play(Move.parse("e1g1"));
		assertThat(kingside.pieceAt(Square.parse("g1"))).isEqualTo(Piece.of(Color.WHITE, PieceType.KING));
		assertThat(kingside.pieceAt(Square.parse("f1"))).isEqualTo(Piece.of(Color.WHITE, PieceType.ROOK));
		assertThat(kingside.pieceAt(Square.parse("h1"))).isNull();
		assertThat(kingside.canCastle(Color.WHITE, false)).isFalse();
		// The rook now on f1 attacks f8, which Black's king would cross.
		assertThat(uci(kingside)).contains("e8c8").doesNotContain("e8g8");

		Position queenside = kingside.play(Move.parse("e8c8"));
		assertThat(queenside.pieceAt(Square.parse("c8"))).isEqualTo(Piece.of(Color.BLACK, PieceType.KING));
		assertThat(queenside.pieceAt(Square.parse("d8"))).isEqualTo(Piece.of(Color.BLACK, PieceType.ROOK));
		assertThat(queenside.pieceAt(Square.parse("a8"))).isNull();
		assertThat(queenside.toFen()).isEqualTo("2kr3r/8/8/8/8/8/8/R4RK1 w - - 2 2");
	}

	@ParameterizedTest(name = "{0}")
	@CsvSource(delimiter = '|', textBlock = """
			out of check                   | 4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1 | e1g1 e1c1 |
			through check                  | 4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1 | e1g1      | e1c1
			into check                     | 4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1 | e1g1      | e1c1
			queenside through d1           | 3rk3/8/8/8/8/8/8/R3K2R w KQ - 0 1  | e1c1      | e1g1
			queenside with b1 attacked     | 1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1 |           | e1c1 e1g1
			a piece in the way             | 4k3/8/8/8/8/8/8/RN2K1NR w KQ - 0 1 | e1g1 e1c1 |
			b1 occupied                    | 4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1  | e1c1      | e1g1
			no rights                      | 4k3/8/8/8/8/8/8/R3K2R w - - 0 1    | e1g1 e1c1 |
			only kingside rights           | 4k3/8/8/8/8/8/8/R3K2R w K - 0 1    | e1c1      | e1g1
			the rook is missing            | 4k3/8/8/8/8/8/8/R3K3 w KQ - 0 1    | e1g1      | e1c1
			black through check            | r3k2r/8/8/8/8/8/8/3RK3 b kq - 0 1  | e8c8      | e8g8
			""")
	void castlingFollowsEveryRestriction(String name, String fen, String refused, String allowed) {
		List<String> moves = uci(Position.fromFen(fen));

		if (refused != null) {
			assertThat(moves).doesNotContainAnyElementsOf(List.of(refused.split(" ")));
		}
		if (allowed != null) {
			assertThat(moves).containsAll(List.of(allowed.split(" ")));
		}
	}

	@Test
	void castlingRightsGoForGoodWhenTheKingOrARookMovesOrARookIsTaken() {
		Position start = Position.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");

		// The king steps out and back: no castling on either side, ever again.
		Position kingBack = play(start, "e1f1", "e8f8", "f1e1", "f8e8");
		assertThat(uci(kingBack)).doesNotContain("e1g1", "e1c1");
		assertThat(kingBack.toFen()).startsWith("r3k2r/8/8/8/8/8/8/R3K2R w - -");

		// A rook goes and comes back: only that side is lost.
		Position rookBack = play(start, "h1h2", "a8a7", "h2h1", "a7a8");
		assertThat(uci(rookBack)).contains("e1c1").doesNotContain("e1g1");
		assertThat(rookBack.toFen()).contains(" w Qk - ");

		// A rook taken on its square takes its side's right with it.
		Position taken = play(start, "a1a8");
		assertThat(taken.canCastle(Color.BLACK, false)).isFalse();
		assertThat(taken.canCastle(Color.BLACK, true)).isTrue();
		assertThat(taken.canCastle(Color.WHITE, false)).isFalse();
	}

	// --- En passant ----------------------------------------------------------------------------------

	@Test
	void enPassantTakesThePawnThatJustMovedTwoSquares() {
		Position position = play(Position.initial(), "e2e4", "a7a6", "e4e5", "d7d5");

		assertThat(position.enPassant()).isEqualTo(Square.parse("d6"));
		Move capture = Move.parse("e5d6");
		assertThat(position.isLegal(capture)).isTrue();
		assertThat(position.isEnPassant(capture)).isTrue();
		assertThat(position.capturedBy(capture)).isEqualTo(Piece.of(Color.BLACK, PieceType.PAWN));

		Position after = position.play(capture);
		assertThat(after.pieceAt(Square.parse("d6"))).isEqualTo(Piece.of(Color.WHITE, PieceType.PAWN));
		assertThat(after.pieceAt(Square.parse("d5"))).isNull();
		assertThat(after.halfmoveClock()).isZero();
	}

	@Test
	void theRightToTakeEnPassantExpiresAfterOneMove() {
		Position position = play(Position.initial(), "e2e4", "a7a6", "e4e5", "d7d5", "a2a3", "a6a5");

		assertThat(position.enPassant()).isEqualTo(Square.NONE);
		assertThat(position.isLegal(Move.parse("e5d6"))).isFalse();
	}

	@Test
	void enPassantIsIllegalWhenItWouldExposeTheKing() {
		// Taking would empty the fifth rank between the king on a5 and the rook on h5.
		Position position = Position.fromFen("8/8/8/KPp4r/8/8/8/4k3 w - c6 0 1");

		assertThat(position.isLegal(Move.parse("b5c6"))).isFalse();
		assertThat(position.isLegal(Move.parse("b5b6"))).isTrue();
	}

	@Test
	void anEnPassantSquareOnlyCountsForRepetitionWhenACaptureIsPossible() {
		Position possible = Position.fromFen("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
		Position impossible = Position.fromFen("4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1");

		assertThat(possible.repetitionKey()).isNotEqualTo(Position.fromFen("4k3/8/8/8/3pP3/8/8/4K3 b - - 0 1").repetitionKey());
		assertThat(impossible.repetitionKey()).isEqualTo(Position.fromFen("4k3/8/8/8/4P3/8/8/4K3 b - - 0 1").repetitionKey());
	}

	// --- Promotion -----------------------------------------------------------------------------------

	@ParameterizedTest
	@CsvSource({ "q, QUEEN", "r, ROOK", "b, BISHOP", "n, KNIGHT" })
	void aPawnOnTheLastRankBecomesTheChosenPiece(String letter, PieceType type) {
		Position position = Position.fromFen("8/P7/8/8/8/8/8/k6K w - - 0 1");

		Position after = position.play(Move.parse("a7a8" + letter));

		assertThat(after.pieceAt(Square.parse("a8"))).isEqualTo(Piece.of(Color.WHITE, type));
		assertThat(after.pieceAt(Square.parse("a7"))).isNull();
	}

	@Test
	void aPromotionMustNameItsPieceAndCanCapture() {
		Position position = Position.fromFen("1r5k/P7/8/8/8/8/8/K7 w - - 0 1");

		assertThat(position.isLegal(Move.parse("a7a8"))).isFalse();
		assertThat(uci(position)).contains("a7a8q", "a7a8r", "a7a8b", "a7a8n", "a7b8q", "a7b8n");
		assertThat(position.play(Move.parse("a7b8n")).pieceAt(Square.parse("b8")))
			.isEqualTo(Piece.of(Color.WHITE, PieceType.KNIGHT));
		assertThat(Position.fromFen("4k3/8/8/8/8/8/p7/4K3 b - - 0 1").play(Move.parse("a2a1r")).pieceAt(0))
			.isEqualTo(Piece.of(Color.BLACK, PieceType.ROOK));
	}

	// --- Material ------------------------------------------------------------------------------------

	@ParameterizedTest(name = "{0}")
	@CsvSource(delimiter = '|', textBlock = """
			kings alone                       | 4k3/8/8/8/8/8/8/4K3 w - - 0 1     | true
			king and knight                   | 4k3/8/8/8/8/8/8/4KN2 w - - 0 1    | true
			king and bishop                   | 4k3/8/8/8/8/8/8/4KB2 w - - 0 1    | true
			bishops on one colour             | 4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1  | true
			three bishops on one colour       | 4kb2/8/8/8/8/8/8/B1B1K3 w - - 0 1 | true
			bishops on both colours           | 4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1 | false
			two knights                       | 4k3/8/8/8/8/8/8/3NKN2 w - - 0 1   | false
			knight against bishop             | 4kb2/8/8/8/8/8/8/4KN2 w - - 0 1   | false
			a pawn                            | 4k3/8/8/8/8/8/4P3/4K3 w - - 0 1   | false
			a rook                            | 4k3/8/8/8/8/8/8/4KR2 w - - 0 1    | false
			""")
	void insufficientMaterialMeansNoMateIsPossible(String name, String fen, boolean insufficient) {
		assertThat(Position.fromFen(fen).insufficientMaterial()).isEqualTo(insufficient);
	}

	static Position play(Position position, String... moves) {
		Position current = position;
		for (String move : moves) {
			current = current.play(Move.parse(move));
		}
		return current;
	}

	static List<String> uci(Position position) {
		return position.legalMoves().stream().map(Move::uci).toList();
	}

}
