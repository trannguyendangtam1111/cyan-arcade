package com.cyan.arcade.chess.engine;

import java.util.Arrays;
import java.util.List;

import com.cyan.arcade.chess.engine.ChessGame.Rejection;
import com.cyan.arcade.chess.engine.ChessGame.RuleException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A whole game: how it ends, the draw rules, resigning, offers, claims and taking moves back. */
class ChessGameTests {

	/** Knights out and back, which brings the starting position round again after every four moves. */
	private static final String[] KNIGHT_SHUFFLE = { "g1f3", "g8f6", "f3g1", "f6g8" };

	// --- Checkmate and stalemate ---------------------------------------------------------------------

	@Test
	void foolsMateEndsTheGameByCheckmate() {
		ChessGame game = play(ChessGame.start(), "f2f3", "e7e5", "g2g4", "d8h4");

		assertThat(game.isOver()).isTrue();
		assertThat(game.result()).contains(Result.win(Color.BLACK, Termination.CHECKMATE));
		assertThat(game.sans()).containsExactly("f3", "e5", "g4", "Qh4#");
		assertThat(game.position().inCheck()).isTrue();
		assertThat(game.position().legalMoves()).isEmpty();
	}

	@Test
	void scholarsMateIsAWinForWhite() {
		ChessGame game = play(ChessGame.start(), "e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7");

		assertThat(game.result()).contains(Result.win(Color.WHITE, Termination.CHECKMATE));
		assertThat(game.sans()).last().isEqualTo("Qxf7#");
		assertThat(game.result().orElseThrow().score()).isEqualTo("1-0");
	}

	@Test
	void aCheckIsNotTheEnd() {
		ChessGame game = play(ChessGame.start(), "e2e4", "f7f6", "d1h5");

		assertThat(game.position().inCheck()).isTrue();
		assertThat(game.isOver()).isFalse();
		assertThat(game.sans()).last().isEqualTo("Qh5+");
		assertThat(game.position().legalMoves()).extracting(Move::uci).containsExactly("g7g6");
	}

	@Test
	void noLegalMoveWithoutCheckIsStalemate() {
		ChessGame game = play(ChessGame.from(Position.fromFen("7k/8/6K1/8/8/8/8/5Q2 w - - 0 1")), "f1f7");

		assertThat(game.result()).contains(Result.draw(Termination.STALEMATE));
		assertThat(game.result().orElseThrow().score()).isEqualTo("1/2-1/2");
	}

	// --- Draws the game makes by itself ---------------------------------------------------------------

	@Test
	void takingTheLastPieceThatCouldMateIsADraw() {
		ChessGame game = play(ChessGame.from(Position.fromFen("4k3/8/8/8/8/8/3q4/4K3 w - - 0 1")), "e1d2");

		assertThat(game.result()).contains(Result.draw(Termination.INSUFFICIENT_MATERIAL));
	}

	@Test
	void theFifthTimeAPositionOccursTheGameIsDrawn() {
		ChessGame game = ChessGame.start();
		for (int round = 0; round < 4; round++) {
			assertThat(game.isOver()).isFalse();
			game = play(game, KNIGHT_SHUFFLE);
		}

		assertThat(game.repetitions()).isEqualTo(5);
		assertThat(game.result()).contains(Result.draw(Termination.FIVEFOLD_REPETITION));
	}

	@Test
	void seventyFiveMovesWithoutACaptureOrPawnMoveIsADraw() {
		ChessGame game = play(ChessGame.from(Position.fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 149 80")), "a1a2");

		assertThat(game.result()).contains(Result.draw(Termination.SEVENTY_FIVE_MOVE_RULE));
	}

	@Test
	void checkmateOnTheSeventyFifthMoveStillWins() {
		ChessGame game = play(ChessGame.from(Position.fromFen("k7/8/1K6/8/8/8/8/7R w - - 149 80")), "h1h8");

		assertThat(game.result()).contains(Result.win(Color.WHITE, Termination.CHECKMATE));
	}

	// --- Draws a player claims ------------------------------------------------------------------------

	@Test
	void aThreefoldRepetitionLetsTheSideToMoveClaimADraw() {
		ChessGame twice = play(ChessGame.start(), KNIGHT_SHUFFLE);
		assertThat(twice.repetitions()).isEqualTo(2);
		assertThat(twice.claimableDraw()).isEmpty();
		assertThatThrownBy(() -> twice.claimDraw(Color.WHITE)).isInstanceOf(RuleException.class)
			.extracting((ex) -> ((RuleException) ex).rejection())
			.isEqualTo(Rejection.DRAW_NOT_CLAIMABLE);

		ChessGame thrice = play(twice, KNIGHT_SHUFFLE);
		assertThat(thrice.isOver()).isFalse();
		assertThat(thrice.claimableDraw()).contains(Termination.THREEFOLD_REPETITION);
		assertRejected(() -> thrice.claimDraw(Color.BLACK), Rejection.NOT_YOUR_TURN);

		ChessGame claimed = thrice.claimDraw(Color.WHITE);
		assertThat(claimed.result()).contains(Result.draw(Termination.THREEFOLD_REPETITION));
	}

	@Test
	void repetitionCountsThePositionNotTheMovesThatLedToIt() {
		// After 1.e4 e5 the en passant square cannot be used, so 2.Nf3 Nf6 3.Ng1 Ng8 repeats it.
		ChessGame game = play(ChessGame.start(), "e2e4", "e7e5");
		game = play(game, KNIGHT_SHUFFLE);
		assertThat(game.repetitions()).isEqualTo(2);
		game = play(game, KNIGHT_SHUFFLE);
		assertThat(game.claimableDraw()).contains(Termination.THREEFOLD_REPETITION);
	}

	@Test
	void fiftyMovesWithoutACaptureOrPawnMoveLetTheSideToMoveClaimADraw() {
		ChessGame before = ChessGame.from(Position.fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 98 60"));
		assertThat(play(before, "a1a2").claimableDraw()).isEmpty();

		ChessGame game = play(before, "a1a2", "e8e7");
		assertThat(game.position().halfmoveClock()).isEqualTo(100);
		assertThat(game.isOver()).isFalse();
		assertThat(game.claimableDraw()).contains(Termination.FIFTY_MOVE_RULE);
		assertThat(game.claimDraw(Color.WHITE).result()).contains(Result.draw(Termination.FIFTY_MOVE_RULE));
	}

	@Test
	void aPawnMoveOrCaptureStartsTheFiftyMovesAgain() {
		ChessGame game = play(ChessGame.from(Position.fromFen("4k3/8/8/8/8/8/4P3/R3K3 w - - 99 60")), "e2e3");

		assertThat(game.position().halfmoveClock()).isZero();
		assertThat(game.claimableDraw()).isEmpty();
	}

	// --- Resigning and agreeing ----------------------------------------------------------------------

	@Test
	void eitherSideMayResign() {
		ChessGame game = play(ChessGame.start(), "e2e4");

		assertThat(game.resign(Color.WHITE).result()).contains(Result.win(Color.BLACK, Termination.RESIGNATION));
		assertThat(game.resign(Color.BLACK).result()).contains(Result.win(Color.WHITE, Termination.RESIGNATION));
	}

	@Test
	void aDrawOfferCanBeAcceptedOrDeclinedByTheOtherSide() {
		ChessGame offered = ChessGame.start().offerDraw(Color.WHITE);
		assertThat(offered.drawOffer()).isEqualTo(Color.WHITE);
		assertRejected(() -> offered.acceptDraw(Color.WHITE), Rejection.NO_DRAW_OFFER);
		assertRejected(() -> offered.offerDraw(Color.WHITE), Rejection.DRAW_ALREADY_OFFERED);

		assertThat(offered.acceptDraw(Color.BLACK).result()).contains(Result.draw(Termination.AGREEMENT));
		assertThat(offered.declineDraw(Color.BLACK).drawOffer()).isNull();
		assertThat(offered.declineDraw(Color.BLACK).isOver()).isFalse();
		// Offering back is agreeing.
		assertThat(offered.offerDraw(Color.BLACK).result()).contains(Result.draw(Termination.AGREEMENT));
		assertRejected(() -> ChessGame.start().acceptDraw(Color.BLACK), Rejection.NO_DRAW_OFFER);
	}

	@Test
	void aDrawOfferStandsUntilTheOtherSideMoves() {
		ChessGame offered = ChessGame.start().offerDraw(Color.WHITE);

		ChessGame afterOwnMove = play(offered, "e2e4");
		assertThat(afterOwnMove.drawOffer()).isEqualTo(Color.WHITE);

		ChessGame answeredByMoving = play(afterOwnMove, "e7e5");
		assertThat(answeredByMoving.drawOffer()).isNull();
		assertRejected(() -> answeredByMoving.acceptDraw(Color.BLACK), Rejection.NO_DRAW_OFFER);
	}

	// --- Nothing after the end ------------------------------------------------------------------------

	@Test
	void aFinishedGameRefusesEveryAction() {
		ChessGame mated = play(ChessGame.start(), "f2f3", "e7e5", "g2g4", "d8h4");
		ChessGame resigned = ChessGame.start().resign(Color.WHITE);
		ChessGame agreed = ChessGame.start().offerDraw(Color.WHITE).acceptDraw(Color.BLACK);

		for (ChessGame over : List.of(mated, resigned, agreed)) {
			assertRejected(() -> over.play(Move.parse("e2e4")), Rejection.GAME_OVER);
			assertRejected(() -> over.play(Move.parse("a2a3")), Rejection.GAME_OVER);
			assertRejected(() -> over.resign(Color.BLACK), Rejection.GAME_OVER);
			assertRejected(() -> over.offerDraw(Color.BLACK), Rejection.GAME_OVER);
			assertRejected(() -> over.claimDraw(over.position().turn()), Rejection.GAME_OVER);
			assertRejected(over::takeBack, Rejection.GAME_OVER);
		}
	}

	@Test
	void anIllegalMoveIsRefusedAndChangesNothing() {
		ChessGame game = play(ChessGame.start(), "e2e4");

		assertRejected(() -> game.play(Move.parse("e4e5")), Rejection.ILLEGAL_MOVE);
		assertRejected(() -> game.play(Move.parse("d2d4")), Rejection.ILLEGAL_MOVE);
		assertThat(game.moves()).extracting(Move::uci).containsExactly("e2e4");
	}

	// --- Taking back ---------------------------------------------------------------------------------

	@Test
	void takingBackReturnsToThePositionBefore() {
		ChessGame game = play(ChessGame.start(), "e2e4", "e7e5").offerDraw(Color.WHITE);

		ChessGame back = game.takeBack();

		assertThat(back.position()).isEqualTo(play(ChessGame.start(), "e2e4").position());
		assertThat(back.moves()).extracting(Move::uci).containsExactly("e2e4");
		assertThat(back.sans()).containsExactly("e4");
		assertThat(back.drawOffer()).isNull();
		assertThat(back.takeBack().moves()).isEmpty();
	}

	@Test
	void thereIsNothingToTakeBackAtTheStart() {
		assertRejected(() -> ChessGame.start().takeBack(), Rejection.NOTHING_TO_TAKE_BACK);
	}

	// --- Restoring a recorded game -------------------------------------------------------------------

	@Test
	void aRecordedGameIsRestoredWithItsResult() {
		List<Move> moves = moves("e2e4", "e7e5");
		Result resigned = Result.win(Color.WHITE, Termination.RESIGNATION);

		ChessGame restored = ChessGame.restore(Position.initial(), moves, null, resigned);

		assertThat(restored.result()).contains(resigned);
		assertThat(ChessGame.restore(Position.initial(), moves, Color.BLACK, null).drawOffer()).isEqualTo(Color.BLACK);
		assertThat(ChessGame.restore(Position.initial(), moves("f2f3", "e7e5", "g2g4", "d8h4"), null,
				Result.win(Color.BLACK, Termination.CHECKMATE))
			.isOver()).isTrue();
	}

	@Test
	void aRecordThatDoesNotHoldTogetherIsRefused() {
		Position start = Position.initial();

		assertThatIllegalStateException().isThrownBy(() -> ChessGame.restore(start, moves("e2e4", "e2e4"), null, null));
		assertThatIllegalStateException().isThrownBy(
				() -> ChessGame.restore(start, moves("e2e4"), null, Result.win(Color.WHITE, Termination.CHECKMATE)));
		assertThatIllegalStateException().isThrownBy(
				() -> ChessGame.restore(start, moves("e2e4"), null, Result.draw(Termination.THREEFOLD_REPETITION)));
		assertThatIllegalStateException()
			.isThrownBy(() -> ChessGame.restore(start, moves("f2f3", "e7e5", "g2g4", "d8h4"), null, null));
	}

	private static ChessGame play(ChessGame game, String... moves) {
		ChessGame current = game;
		for (String move : moves) {
			current = current.play(Move.parse(move));
		}
		return current;
	}

	private static List<Move> moves(String... uci) {
		return Arrays.stream(uci).map(Move::parse).toList();
	}

	private static void assertRejected(Runnable action, Rejection rejection) {
		assertThatThrownBy(action::run).isInstanceOf(RuleException.class)
			.extracting((ex) -> ((RuleException) ex).rejection())
			.isEqualTo(rejection);
	}

}
