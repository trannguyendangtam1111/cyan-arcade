package com.cyan.arcade.chess.stockfish;

import java.util.List;

/**
 * What a search found.
 *
 * @param bestMove the move in UCI, or {@code null} when the position has none (mate or stalemate)
 * @param lines the principal variations, best first, each as of its deepest exact report
 * @param depth the deepest iteration the engine reported
 * @param interrupted whether the search had to be stopped (a timeout or the caller giving up) before
 * reaching its own limit: its numbers are then provisional
 */
public record SearchResult(String bestMove, String ponder, List<Line> lines, int depth, boolean interrupted,
		long elapsedMs) {

	public SearchResult {
		lines = List.copyOf(lines);
	}

	/** One principal variation. */
	public record Line(int multipv, int depth, int seldepth, EngineScore score, List<String> pv, long nodes) {

		public Line {
			pv = List.copyOf(pv);
		}

	}

	/** The best line, or {@code null} when the engine reported none. */
	public Line best() {
		return this.lines.isEmpty() ? null : this.lines.get(0);
	}

}
