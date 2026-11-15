package com.cyan.arcade.chess;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import com.cyan.arcade.chess.ChessMatch.Mode;
import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessMatch.Status;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ChessPgnTests {

	private static final Instant NOW = Instant.parse("2026-11-09T23:40:00Z");

	private ChessMatch match(String moves) {
		List<Move> played = moves.isBlank() ? List.of() : Arrays.stream(moves.split(" ")).map(Move::parse).toList();
		return ChessMatch.start(new Owner(1L, null), Mode.LOCAL, NOW)
			.after(ChessGame.replay(Position.initial(), played), List.of(), NOW);
	}

	@Test
	void sevenTagRosterAndAnEmptyUnfinishedGame() {
		assertThat(ChessPgn.export(match(""))).isEqualTo("""
				[Event "Cyan Arcade local match"]
				[Site "Cyan Arcade"]
				[Date "2026.11.09"]
				[Round "-"]
				[White "Local White"]
				[Black "Local Black"]
				[Result "*"]

				*
				""");
	}

	@Test
	void checkmateSanAndBlackWinAgreeWithTheResultTag() {
		assertThat(ChessPgn.export(match("f2f3 e7e5 g2g4 d8h4")))
			.contains("[Result \"0-1\"]").endsWith("1. f3 e5 2. g4 Qh4# 0-1\n");
	}

	@Test
	void castlingUsesSanRatherThanUci() {
		assertThat(ChessPgn.export(match("e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1 f8c5 d2d3 e8g8")))
			.endsWith("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O Bc5 5. d3 O-O *\n");
	}

	@Test
	void enPassantIsACaptureInSan() {
		assertThat(ChessPgn.export(match("e2e4 a7a6 e4e5 d7d5 e5d6")))
			.endsWith("1. e4 a6 2. e5 d5 3. exd6 *\n");
	}

	@Test
	void promotionAndCaptureArePreserved() {
		assertThat(ChessPgn.export(match("a2a4 h7h5 a4a5 h5h4 a5a6 h4h3 a6b7 h3g2 b7a8q")))
			.contains("bxa8=Q").endsWith("*\n");
	}

	@Test
	void resignationAndAgreedDrawUseStandardResultTokens() {
		ChessMatch played = match("e2e4");
		assertThat(ChessPgn.export(played.after(played.game().resign(Color.BLACK), List.of(), NOW)))
			.contains("[Result \"1-0\"]").endsWith("1. e4 1-0\n");
		assertThat(ChessPgn.export(played.after(played.game().offerDraw(Color.BLACK).acceptDraw(Color.WHITE), List.of(), NOW)))
			.contains("[Result \"1/2-1/2\"]").endsWith("1. e4 1/2-1/2\n");
	}

	@Test
	void absentLegacyEngineMetadataAndDateDoNotInventAColourOrStrength() {
		ChessMatch original = match("e2e4");
		ChessMatch legacy = new ChessMatch(original.id(), Mode.AI, Status.ABANDONED, original.moves(), List.of(),
				null, null, null, 1, 1L, null, null, NOW, NOW, null, null, 0, null, null);
		assertThat(ChessPgn.export(legacy)).contains("[Date \"????.??.??\"]", "[White \"?\"]", "[Black \"?\"]")
			.endsWith("1. e4 *\n");
	}

	@Test
	void engineSeatsAndVariationPrefixAreExportedWithoutSearches() {
		ChessMatch ai = ChessMatch.againstEngine(new Owner(1L, null), Color.WHITE,
				com.cyan.arcade.chess.analysis.Difficulty.CLUB, NOW);
		assertThat(ChessPgn.export(ai)).contains("[White \"Stockfish (Club)\"]", "[Black \"Player\"]");
		ChessMatch variation = ChessMatch.variation(new Owner(1L, null), match("e2e4 e7e5 g1f3"), 2, NOW);
		assertThat(ChessPgn.export(variation)).contains("[Event \"Cyan Arcade variation\"]")
			.endsWith("1. e4 e5 *\n");
	}

}
