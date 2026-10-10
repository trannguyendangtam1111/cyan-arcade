package com.cyan.arcade.chess.analysis;

import java.util.List;

import com.cyan.arcade.chess.analysis.MoveClassifier.MoveClass;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.stockfish.EngineScore;
import com.cyan.arcade.chess.stockfish.SearchRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Evaluations from White's side, the review's move labels, and positions as the engine gets them. */
class AnalysisTests {

	// --- Evaluations ----------------------------------------------------------------------------------

	@Test
	void engineScoresForTheSideToMoveBecomeWhitesScores() {
		assertThat(Evaluation.fromEngine(EngineScore.centipawns(35), Color.WHITE).centipawns()).isEqualTo(35);
		assertThat(Evaluation.fromEngine(EngineScore.centipawns(35), Color.BLACK).centipawns()).isEqualTo(-35);
		assertThat(Evaluation.fromEngine(EngineScore.centipawns(-120), Color.BLACK).display()).isEqualTo("+1.20");
		assertThat(Evaluation.fromEngine(EngineScore.centipawns(0), Color.BLACK).display()).isEqualTo("0.00");
	}

	@Test
	void matesAreMatesForTheRightSideAndNeverCentipawns() {
		// Black to move and mating in 2 is good for Black.
		Evaluation blackMates = Evaluation.fromEngine(EngineScore.mate(2), Color.BLACK);
		assertThat(blackMates.isMate()).isTrue();
		assertThat(blackMates.matingSide()).isEqualTo(Color.BLACK);
		assertThat(blackMates.mateIn()).isEqualTo(2);
		assertThat(blackMates.centipawns()).isZero();
		assertThat(blackMates.display()).isEqualTo("#-2");
		assertThat(blackMates.whiteWinPercent()).isZero();

		// Black to move and mated in 3: White mates.
		Evaluation whiteMates = Evaluation.fromEngine(EngineScore.mate(-3), Color.BLACK);
		assertThat(whiteMates.matingSide()).isEqualTo(Color.WHITE);
		assertThat(whiteMates.display()).isEqualTo("#3");
		assertThat(whiteMates.whiteWinPercent()).isEqualTo(100);

		// White to move and mated now.
		Evaluation mated = Evaluation.fromEngine(EngineScore.mate(0), Color.WHITE);
		assertThat(mated.matingSide()).isEqualTo(Color.BLACK);
		assertThat(mated.display()).isEqualTo("0-1");
		assertThat(Evaluation.finished(Color.WHITE).display()).isEqualTo("1-0");
		assertThat(Evaluation.finished(null).display()).isEqualTo("0.00");
	}

	@Test
	void winChancesFollowTheCurveAndAreCapped() {
		assertThat(Evaluation.centipawns(0, true).whiteWinPercent()).isEqualTo(50);
		assertThat(Evaluation.centipawns(100, true).whiteWinPercent()).isCloseTo(59.1, within(0.1));
		assertThat(Evaluation.centipawns(-100, true).winPercentFor(Color.BLACK)).isCloseTo(59.1, within(0.1));
		assertThat(Evaluation.centipawns(5000, true).whiteWinPercent())
			.isEqualTo(Evaluation.centipawns(1000, true).whiteWinPercent());
		assertThat(Evaluation.centipawns(5000, true).whiteWinPercent()).isLessThan(100);
		assertThat(Evaluation.centipawns(30, true).favoured()).isEqualTo(Color.WHITE);
		assertThat(Evaluation.centipawns(0, true).favoured()).isNull();
	}

	// --- Move labels ----------------------------------------------------------------------------------

	@ParameterizedTest(name = "{0} cp after {1} cp is {2}")
	@CsvSource({ "30, 25, EXCELLENT", "30, -20, GOOD", "30, -60, INACCURACY", "30, -150, MISTAKE", "30, -500, BLUNDER",
			// The same 300 centipawns: a blunder from a level position, an inaccuracy from a won one.
			"0, -300, BLUNDER", "900, 600, INACCURACY",
			// A deeper look can find the move played better than the engine's first choice: no loss.
			"30, 60, EXCELLENT" })
	void whiteMovesAreJudgedByLostWinningChances(int best, int after, MoveClass expected) {
		assertThat(MoveClassifier.classify(Color.WHITE, false, false, Evaluation.centipawns(best, true),
				Evaluation.centipawns(after, true), true).label()).isEqualTo(expected);
	}

	@Test
	void blackMovesAreJudgedFromBlacksSide() {
		// White-relative: -50 before (Black better), +200 after Black's move: Black threw it away.
		MoveClassifier.Judgement judgement = MoveClassifier.classify(Color.BLACK, false, false,
				Evaluation.centipawns(-50, true), Evaluation.centipawns(200, true), true);

		assertThat(judgement.label()).isEqualTo(MoveClass.BLUNDER);
		assertThat(judgement.loss()).isGreaterThan(20);
		// And a Black move that keeps Black's edge is fine.
		assertThat(MoveClassifier.classify(Color.BLACK, false, false, Evaluation.centipawns(-50, true),
				Evaluation.centipawns(-45, true), true).label()).isEqualTo(MoveClass.EXCELLENT);
	}

	@Test
	void theEnginesMoveIsBestAndTheOnlyMoveIsForced() {
		assertThat(MoveClassifier.classify(Color.WHITE, false, true, Evaluation.centipawns(30, true),
				Evaluation.centipawns(-400, true), true).label()).isEqualTo(MoveClass.BEST);
		assertThat(MoveClassifier.classify(Color.WHITE, true, false, Evaluation.centipawns(30, true),
				Evaluation.centipawns(-400, true), true).label()).isEqualTo(MoveClass.FORCED);
		assertThat(MoveClassifier.classify(Color.WHITE, true, false, null, null, false).label()).isEqualTo(MoveClass.FORCED);
	}

	@Test
	void matesCountAsCertainWinsAndLosses() {
		Evaluation whiteMates = Evaluation.mate(3, Color.WHITE, true);
		// Missing a mate but staying a queen up costs little.
		assertThat(MoveClassifier.classify(Color.WHITE, false, false, whiteMates, Evaluation.centipawns(900, true), true)
			.label()).isEqualTo(MoveClass.GOOD);
		// A slower mate is no loss.
		assertThat(MoveClassifier.classify(Color.WHITE, false, false, whiteMates, Evaluation.mate(5, Color.WHITE, true), true)
			.label()).isEqualTo(MoveClass.EXCELLENT);
		// Walking into a mate from a level position.
		assertThat(MoveClassifier.classify(Color.WHITE, false, false, Evaluation.centipawns(0, true),
				Evaluation.mate(2, Color.BLACK, true), true).label()).isEqualTo(MoveClass.BLUNDER);
		// Delivering mate when the engine wanted another one.
		assertThat(MoveClassifier.classify(Color.WHITE, false, false, whiteMates, Evaluation.finished(Color.WHITE), true)
			.label()).isEqualTo(MoveClass.EXCELLENT);
	}

	@Test
	void shallowOrBoundedAnalysisClaimsNothing() {
		MoveClassifier.Judgement judgement = MoveClassifier.classify(Color.WHITE, false, false, Evaluation.centipawns(30, true),
				Evaluation.centipawns(-500, true), false);
		assertThat(judgement.label()).isEqualTo(MoveClass.UNRATED);
		assertThat(MoveClassifier.classify(Color.WHITE, false, false, null, Evaluation.centipawns(0, true), true).label())
			.isEqualTo(MoveClass.UNRATED);
	}

	// --- Positions for the engine ---------------------------------------------------------------------

	@Test
	void theEngineGetsThePositionSinceTheLastIrreversibleMove() {
		ChessGame game = ChessGame.start();
		for (String uci : List.of("e2e4", "e7e5", "g1f3", "b8c6")) {
			game = game.play(Move.parse(uci));
		}
		SearchRequest.Limits limits = new SearchRequest.Limits(10, null, null);

		// After 1.e4 e5 2.Nf3 Nc6: e5 was the last pawn move; the knight moves follow it.
		SearchRequest request = EnginePositions.request(game, 4, limits, 1, SearchRequest.Strength.FULL);
		assertThat(request.positionCommand())
			.isEqualTo("position fen rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 1 moves g1f3 b8c6");
		assertThat(EnginePositions.request(game, 0, limits, 1, SearchRequest.Strength.FULL).positionCommand())
			.isEqualTo("position startpos");
		assertThat(EnginePositions.request(game, 1, limits, 1, SearchRequest.Strength.FULL).positionCommand())
			.isEqualTo("position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
	}

	@Test
	void theSamePositionGivesTheSameRequestWhateverTheMoveNumber() {
		ChessGame quick = ChessGame.start().play(Move.parse("e2e4")).play(Move.parse("e7e5"));
		ChessGame slow = ChessGame.start();
		for (String uci : List.of("g1f3", "g8f6", "f3g1", "f6g8", "e2e4", "e7e5")) {
			slow = slow.play(Move.parse(uci));
		}
		SearchRequest.Limits limits = new SearchRequest.Limits(10, null, null);
		assertThat(EnginePositions.request(slow, 6, limits, 1, SearchRequest.Strength.FULL))
			.isEqualTo(EnginePositions.request(quick, 2, limits, 1, SearchRequest.Strength.FULL));
	}

	@Test
	void engineLinesAreCheckedAndWrittenInStandardNotation() {
		Position position = Position.fromFen("k7/6P1/8/8/8/8/8/1R5K w - - 0 1");

		assertThat(EnginePositions.sanLine(position, List.of("g7g8q", "a8a7", "g8a2"), 10)).containsExactly("g8=Q+", "Ka7",
				"Qa2#");
		assertThat(EnginePositions.sanLine(position, List.of("g7g8q", "a8a7", "g8a2"), 2)).hasSize(2);
		assertThat(EnginePositions.sanLine(position, List.of("g7g8q", "h1h1", "g8a2"), 10)).containsExactly("g8=Q+");
		assertThat(EnginePositions.legal(position, "g7g8")).isNull();
		assertThat(EnginePositions.legal(position, "e2e4")).isNull();
		assertThat(EnginePositions.legal(position, "g7g8n")).isEqualTo(Move.parse("g7g8n"));
		assertThat(EnginePositions.legal(position, null)).isNull();
	}

	@Test
	void difficultiesUseTheEnginesOwnStrengthSettings() {
		assertThat(Difficulty.BEGINNER.strength()).isEqualTo(new SearchRequest.Strength(0, null));
		assertThat(Difficulty.CLUB.strength()).isEqualTo(new SearchRequest.Strength(20, 1600));
		assertThat(Difficulty.MAXIMUM.strength()).isEqualTo(SearchRequest.Strength.FULL);
		for (int index = 1; index < Difficulty.values().length; index++) {
			assertThat(Difficulty.values()[index].movetimeMs()).isGreaterThan(Difficulty.values()[index - 1].movetimeMs());
		}
	}

}
