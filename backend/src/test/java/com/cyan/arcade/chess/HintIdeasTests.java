package com.cyan.arcade.chess;

import java.util.List;

import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.stockfish.EngineScore;
import com.cyan.arcade.chess.stockfish.SearchResult;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What a hint says its move does: only what the rules show of the move and what the engine's own
 * score says, never a guess at a plan.
 */
class HintIdeasTests {

	@Test
	void aQuietMoveIsGivenNoIdea() {
		assertThat(ideas(Position.initial(), "e2e4", EngineScore.centipawns(20))).isEmpty();
	}

	@Test
	void capturesNameThePieceTakenIncludingEnPassant() {
		assertThat(ideas("4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1", "d1d5")).containsExactly("It captures a rook.");
		assertThat(ideas("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5d6")).containsExactly("It captures a pawn en passant.");
	}

	@Test
	void checksPromotionsAndCastlingAreSaidAsTheyAre() {
		assertThat(ideas("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1a8")).containsExactly("It gives check.");
		assertThat(ideas("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7a8q"))
			.containsExactly("It promotes the pawn to a queen.", "It gives check.");
		assertThat(ideas("4k3/8/8/8/8/8/8/4K2R w K - 0 1", "e1g1")).containsExactly("It castles.");
	}

	@Test
	void aMateIsSaidOnlyWhenTheBoardOrTheEngineShowsIt() {
		assertThat(ideas("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "a1a8")).containsExactly("It is checkmate.");
		assertThat(ideas(Position.initial(), "g1f3", EngineScore.mate(3))).containsExactly("Stockfish finds a forced mate in 3.");
		// Being mated is no idea of the move's.
		assertThat(ideas(Position.initial(), "g1f3", EngineScore.mate(-3))).isEmpty();
	}

	private static List<String> ideas(String fen, String uci) {
		return ideas(Position.fromFen(fen), uci, EngineScore.centipawns(0));
	}

	private static List<String> ideas(Position position, String uci, EngineScore score) {
		SearchResult result = new SearchResult(uci, null, List.of(new SearchResult.Line(1, 12, 12, score, List.of(uci), 1000L)),
				12, false, 5L);
		return ChessAiService.ideasOf(position, Move.parse(uci), result);
	}

}
