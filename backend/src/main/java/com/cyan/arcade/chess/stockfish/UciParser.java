package com.cyan.arcade.chess.stockfish;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Reads the two kinds of UCI output a search produces: {@code info} lines (depth, score, principal
 * variation…) and the final {@code bestmove}. Anything it does not understand gives {@code null}
 * rather than an exception: an engine's chatter ({@code info string …}, {@code currmove} updates) is
 * not an error, and a malformed line must not take a search down.
 */
public final class UciParser {

	/** A move in UCI notation: from, to and an optional promotion piece. */
	private static final Pattern MOVE = Pattern.compile("[a-h][1-8][a-h][1-8][qrbn]?");

	private UciParser() {
	}

	/**
	 * One {@code info} line with a score.
	 *
	 * @param multipv which line of a multi-line search, from 1
	 * @param pv the principal variation in UCI, possibly empty
	 */
	public record Info(int depth, int seldepth, int multipv, EngineScore score, long nodes, long timeMs,
			List<String> pv) {
	}

	/** @param move the best move in UCI, or {@code null} when there is none (a finished position) */
	public record BestMove(String move, String ponder) {
	}

	public static boolean isMove(String token) {
		return token != null && MOVE.matcher(token).matches();
	}

	/** @return the line's search information, or {@code null} for a line without depth and score */
	public static Info parseInfo(String line) {
		if (line == null || !line.startsWith("info ") || line.startsWith("info string")) {
			return null;
		}
		String[] tokens = line.trim().split("\\s+");
		Integer depth = null;
		int seldepth = 0;
		int multipv = 1;
		long nodes = 0;
		long time = 0;
		EngineScore score = null;
		List<String> pv = List.of();
		try {
			for (int index = 1; index < tokens.length; index++) {
				switch (tokens[index]) {
					case "depth" -> depth = Integer.parseInt(tokens[++index]);
					case "seldepth" -> seldepth = Integer.parseInt(tokens[++index]);
					case "multipv" -> multipv = Integer.parseInt(tokens[++index]);
					case "nodes" -> nodes = Long.parseLong(tokens[++index]);
					case "time" -> time = Long.parseLong(tokens[++index]);
					case "score" -> {
						String kind = tokens[++index];
						int value = Integer.parseInt(tokens[++index]);
						EngineScore.Bound bound = EngineScore.Bound.EXACT;
						if (index + 1 < tokens.length && tokens[index + 1].equals("lowerbound")) {
							bound = EngineScore.Bound.LOWER;
							index++;
						}
						else if (index + 1 < tokens.length && tokens[index + 1].equals("upperbound")) {
							bound = EngineScore.Bound.UPPER;
							index++;
						}
						score = switch (kind) {
							case "cp" -> new EngineScore(EngineScore.Kind.CENTIPAWNS, value, bound);
							case "mate" -> new EngineScore(EngineScore.Kind.MATE, value, bound);
							default -> null;
						};
					}
					case "pv" -> {
						List<String> moves = new ArrayList<>();
						for (index++; index < tokens.length && isMove(tokens[index]); index++) {
							moves.add(tokens[index]);
						}
						pv = List.copyOf(moves);
						index--;
					}
					default -> {
						// Fields this application does not use (nps, hashfull, wdl, currmove…).
					}
				}
			}
		}
		catch (RuntimeException ex) {
			// A truncated or garbled line: ignore it, the next one will do.
			return null;
		}
		if (depth == null || score == null || multipv < 1) {
			return null;
		}
		return new Info(depth, seldepth, multipv, score, nodes, time, pv);
	}

	/** @return the best move, or {@code null} for a line that is not a well-formed {@code bestmove} */
	public static BestMove parseBestMove(String line) {
		if (line == null || !line.startsWith("bestmove")) {
			return null;
		}
		String[] tokens = line.trim().split("\\s+");
		if (tokens.length < 2) {
			return null;
		}
		String move = tokens[1];
		if (move.equals("(none)") || move.equals("0000")) {
			return new BestMove(null, null);
		}
		if (!isMove(move)) {
			return null;
		}
		String ponder = (tokens.length >= 4 && tokens[2].equals("ponder") && isMove(tokens[3])) ? tokens[3] : null;
		return new BestMove(move, ponder);
	}

}
