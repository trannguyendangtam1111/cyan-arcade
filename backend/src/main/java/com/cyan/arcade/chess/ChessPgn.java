package com.cyan.arcade.chess;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import com.cyan.arcade.chess.ChessMatch.Mode;
import com.cyan.arcade.chess.ChessMatch.Status;
import com.cyan.arcade.chess.engine.Color;

/** PGN from the same authoritative replay/SAN used by the board; never starts an AI search. */
final class ChessPgn {

	private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy.MM.dd").withZone(ZoneOffset.UTC);

	private ChessPgn() {
	}

	static String result(Status status, String winner, String termination) {
		if (status != Status.FINISHED || termination == null) {
			return "*";
		}
		return (winner == null) ? "1/2-1/2" : (winner.equals("WHITE") ? "1-0" : "0-1");
	}

	static String export(ChessMatch match) {
		String result = result(match.status(), name(match.winner()), name(match.termination()));
		String white = "Local White";
		String black = "Local Black";
		if (match.mode() == Mode.AI) {
			// Old/incomplete metadata must not invent the owner's colour or engine strength.
			white = "?";
			black = "?";
			if (match.engineSide() != null) {
				String engine = "Stockfish" + ((match.difficulty() != null) ? " (" + match.difficulty().label() + ")" : "");
				white = (match.engineSide() == Color.WHITE) ? engine : "Player";
				black = (match.engineSide() == Color.BLACK) ? engine : "Player";
			}
		}
		String event = switch (match.mode()) {
			case LOCAL -> "Cyan Arcade local match";
			case AI -> "Cyan Arcade Stockfish match";
			case ANALYSIS -> "Cyan Arcade variation";
		};
		StringBuilder pgn = new StringBuilder();
		tag(pgn, "Event", event);
		tag(pgn, "Site", "Cyan Arcade");
		tag(pgn, "Date", (match.createdAt() != null) ? DATE.format(match.createdAt()) : "????.??.??");
		tag(pgn, "Round", "-");
		tag(pgn, "White", white);
		tag(pgn, "Black", black);
		tag(pgn, "Result", result);
		pgn.append('\n');
		List<String> sans = match.game().sans();
		List<String> tokens = new ArrayList<>();
		for (int ply = 0; ply < sans.size(); ply++) {
			if (ply % 2 == 0) {
				tokens.add((ply / 2 + 1) + ".");
			}
			tokens.add(sans.get(ply));
		}
		tokens.add(result);
		int column = 0;
		for (String token : tokens) {
			if (column > 0 && column + token.length() + 1 > 80) {
				pgn.append('\n');
				column = 0;
			}
			if (column > 0) {
				pgn.append(' ');
				column++;
			}
			pgn.append(token);
			column += token.length();
		}
		return pgn.append('\n').toString();
	}

	private static void tag(StringBuilder pgn, String key, String value) {
		pgn.append('[').append(key).append(" \"").append(value.replace("\\", "\\\\").replace("\"", "\\\""))
			.append("\"]\n");
	}

	private static String name(Enum<?> value) {
		return (value != null) ? value.name() : null;
	}

}
