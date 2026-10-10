package com.cyan.arcade.chess.analysis;

import java.util.ArrayList;
import java.util.List;

import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.engine.San;
import com.cyan.arcade.chess.stockfish.SearchRequest;

/**
 * Between the game as the rules keep it and the engine: the position a search is about, and the
 * engine's moves turned back into checked moves and standard notation.
 */
public final class EnginePositions {

	private EnginePositions() {
	}

	/**
	 * The search for the position after {@code ply} moves of a game. The engine is given the position
	 * of the last capture or pawn move and the moves since, which is all that repetition and the
	 * fifty-move rule depend on, and which makes the same position give the same request (a stable
	 * cache key) however the game reached it.
	 */
	public static SearchRequest request(ChessGame game, int ply, SearchRequest.Limits limits, int multiPv,
			SearchRequest.Strength strength) {
		Position position = game.positions().get(ply);
		int from = Math.max(0, ply - position.halfmoveClock());
		String fen = (from == 0) ? null : withoutMoveNumber(game.positions().get(from).toFen());
		List<String> moves = game.moves().subList(from, ply).stream().map(Move::uci).toList();
		return new SearchRequest(fen, moves, limits, multiPv, strength);
	}

	/** The move numbers do not change a position; they are left out so they do not split the cache. */
	private static String withoutMoveNumber(String fen) {
		return fen.substring(0, fen.lastIndexOf(' ')) + " 1";
	}

	/** @return the engine's move if it is legal in the position, else {@code null} */
	public static Move legal(Position position, String uci) {
		if (uci == null) {
			return null;
		}
		try {
			Move move = Move.parse(uci);
			return position.isLegal(move) ? move : null;
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}

	/**
	 * A principal variation in standard notation, played through the rules; it stops at the first
	 * move that is not legal (an engine never sends one, but nothing here takes that on trust).
	 */
	public static List<String> sanLine(Position start, List<String> pv, int maxMoves) {
		List<String> line = new ArrayList<>();
		Position position = start;
		for (String uci : pv) {
			if (line.size() >= maxMoves) {
				break;
			}
			Move move = legal(position, uci);
			if (move == null) {
				break;
			}
			line.add(San.of(position, move));
			position = position.play(move);
		}
		return line;
	}

}
