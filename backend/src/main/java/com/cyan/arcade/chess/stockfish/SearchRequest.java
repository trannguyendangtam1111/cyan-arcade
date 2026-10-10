package com.cyan.arcade.chess.stockfish;

import java.util.List;

/**
 * One search: the position (a starting FEN and the moves played from it, so the engine sees the
 * history that repetition depends on), how long to search, how many lines, and how strong to play.
 *
 * @param startFen the FEN to start from, or {@code null} for the standard starting position
 * @param moves UCI moves played from there
 * @param multiPv lines to report, best first
 */
public record SearchRequest(String startFen, List<String> moves, Limits limits, int multiPv, Strength strength) {

	public SearchRequest {
		moves = List.copyOf(moves);
		for (String move : moves) {
			if (!UciParser.isMove(move)) {
				throw new IllegalArgumentException("Not a UCI move: " + move);
			}
		}
		if (startFen != null && !startFen.matches("[1-8pnbrqkPNBRQK/]+ [wb] [KQkq-]+ [a-h1-8-]+ \\d+ \\d+")) {
			throw new IllegalArgumentException("Not a FEN: " + startFen);
		}
		if (multiPv < 1 || multiPv > 5) {
			throw new IllegalArgumentException("MultiPV must be 1 to 5");
		}
	}

	/**
	 * When to stop: at a depth, after a time, after a number of nodes, whichever comes first. At least
	 * one must be set.
	 */
	public record Limits(Integer depth, Integer movetimeMs, Long nodes) {

		public Limits {
			if (depth == null && movetimeMs == null && nodes == null) {
				throw new IllegalArgumentException("A search needs a limit");
			}
			if ((depth != null && depth < 1) || (movetimeMs != null && movetimeMs < 1) || (nodes != null && nodes < 1)) {
				throw new IllegalArgumentException("Search limits must be positive");
			}
		}

		String goCommand() {
			StringBuilder go = new StringBuilder("go");
			if (depth != null) {
				go.append(" depth ").append(depth);
			}
			if (movetimeMs != null) {
				go.append(" movetime ").append(movetimeMs);
			}
			if (nodes != null) {
				go.append(" nodes ").append(nodes);
			}
			return go.toString();
		}

	}

	/**
	 * How strong to play, with Stockfish's own options. Full strength is skill 20 with no Elo limit.
	 *
	 * @param skillLevel {@code Skill Level}, 0 to 20
	 * @param elo {@code UCI_Elo} with {@code UCI_LimitStrength} on, or {@code null} for no limit
	 */
	public record Strength(int skillLevel, Integer elo) {

		public static final Strength FULL = new Strength(20, null);

		public Strength {
			if (skillLevel < 0 || skillLevel > 20) {
				throw new IllegalArgumentException("Skill Level is 0 to 20");
			}
		}

	}

	/** The {@code position} command for this search. */
	public String positionCommand() {
		StringBuilder command = new StringBuilder("position ");
		command.append((this.startFen != null) ? "fen " + this.startFen : "startpos");
		if (!this.moves.isEmpty()) {
			command.append(" moves ").append(String.join(" ", this.moves));
		}
		return command.toString();
	}

	/** Everything but the position that changes a search's answer, for cache keys. */
	public String settingsFingerprint() {
		return this.limits.goCommand() + "|multipv " + this.multiPv + "|skill " + this.strength.skillLevel() + "|elo "
				+ this.strength.elo();
	}

}
