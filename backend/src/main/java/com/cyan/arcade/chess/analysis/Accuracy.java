package com.cyan.arcade.chess.analysis;

import java.util.Collection;

/**
 * Accuracy, a summary of how close a side's moves came to the engine's, in percent.
 *
 * <p>Each move's accuracy comes from the winning chances it gave away ({@code loss}, in percentage
 * points, as {@link MoveClassifier} measures it): {@code 103.1668 * e^(-0.04354 * loss) - 3.1669},
 * kept within 0 to 100. That is the curve Lichess publishes for its move accuracy; Chess.com's
 * accuracy is its own and is not reproduced here. A side's accuracy is the plain average over its
 * judged moves: forced moves (no choice) and unrated ones (too shallow an analysis to judge) are left
 * out, so neither flatters nor spoils it.
 */
public final class Accuracy {

	static final double SCALE = 103.1668;

	static final double DECAY = 0.04354;

	static final double OFFSET = 3.1669;

	private Accuracy() {
	}

	/** One move's accuracy, 0 to 100, from the winning chances it lost. */
	public static double ofMove(double loss) {
		double raw = SCALE * Math.exp(-DECAY * Math.max(0, loss)) - OFFSET;
		return Math.max(0, Math.min(100, raw));
	}

	/**
	 * A side's accuracy over the losses of its judged moves, or {@code null} when it has none.
	 */
	public static Double ofMoves(Collection<Double> losses) {
		if (losses.isEmpty()) {
			return null;
		}
		double sum = 0;
		for (double loss : losses) {
			sum += ofMove(loss);
		}
		return sum / losses.size();
	}

}
