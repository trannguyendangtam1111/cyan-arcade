package com.cyan.arcade.chess.analysis;

import com.cyan.arcade.chess.engine.Color;

/**
 * The game review's move labels, by one explicit policy.
 *
 * <p>A move is judged by how much of the mover's winning chances it gave away: the chances after the
 * engine's best move (from the analysis of the position before) minus the chances after the move
 * played (from the analysis of the position after), both from the mover's side, in percentage points
 * of {@link Evaluation#winPercentFor}. Working in win chances rather than centipawns keeps a pawn lost
 * in a long-won position from counting like a pawn lost in a level one, and handles mates: a mate is
 * 100 % or 0 %.
 *
 * <ol>
 * <li><b>Forced</b>: the only legal move.
 * <li><b>Unrated</b>: either analysis was too shallow or only a bound ({@code sufficient} false).
 * Nothing is claimed about the move.
 * <li><b>Best</b>: the engine's own first choice.
 * <li>Otherwise by the loss: <b>Excellent</b> up to 2 points, <b>Good</b> up to 5, <b>Inaccuracy</b>
 * up to 10, <b>Mistake</b> up to 20, <b>Blunder</b> beyond. These are the defaults; the limits are
 * configurable ({@link Thresholds}, {@code app.chess.classification}).
 * </ol>
 * A move that is not the engine's choice but loses nothing (the later, deeper analysis can even think
 * it better) is Excellent, not a mistake.
 *
 * <p>There is no Book label (no opening book is installed) and no Brilliant or Great label: telling a
 * sound sacrifice or the one saving move apart needs more than a loss in winning chances, so this
 * policy does not claim it.
 */
public final class MoveClassifier {

	public enum MoveClass {

		BEST, EXCELLENT, GOOD, INACCURACY, MISTAKE, BLUNDER, FORCED, UNRATED

	}

	public static final double EXCELLENT = 2;

	public static final double GOOD = 5;

	public static final double INACCURACY = 10;

	public static final double MISTAKE = 20;

	/**
	 * The most winning chances (percentage points) a move may give away and still be Excellent, Good,
	 * an Inaccuracy or a Mistake; beyond the last it is a Blunder.
	 */
	public record Thresholds(double excellent, double good, double inaccuracy, double mistake) {

		public static final Thresholds DEFAULT = new Thresholds(EXCELLENT, GOOD, INACCURACY, MISTAKE);

		public Thresholds {
			if (excellent < 0 || good < excellent || inaccuracy < good || mistake < inaccuracy || mistake > 100) {
				throw new IllegalArgumentException(
						"Classification limits must rise: 0 <= excellent <= good <= inaccuracy <= mistake <= 100");
			}
		}

	}

	private MoveClassifier() {
	}

	/**
	 * @param mover the side that played the move
	 * @param onlyMove whether it was the only legal move
	 * @param playedBest whether it was the engine's best move
	 * @param best the evaluation of the position before, that is after the best move
	 * @param after the evaluation of the position after the move played
	 * @param sufficient whether both analyses are deep and exact enough to judge by
	 */
	public static Judgement classify(Color mover, boolean onlyMove, boolean playedBest, Evaluation best,
			Evaluation after, boolean sufficient) {
		return classify(mover, onlyMove, playedBest, best, after, sufficient, Thresholds.DEFAULT);
	}

	/** As {@link #classify(Color, boolean, boolean, Evaluation, Evaluation, boolean)}, with given limits. */
	public static Judgement classify(Color mover, boolean onlyMove, boolean playedBest, Evaluation best,
			Evaluation after, boolean sufficient, Thresholds limits) {
		Double loss = (best != null && after != null)
				? Math.max(0, best.winPercentFor(mover) - after.winPercentFor(mover)) : null;
		if (onlyMove) {
			return new Judgement(MoveClass.FORCED, loss);
		}
		if (!sufficient || loss == null) {
			return new Judgement(MoveClass.UNRATED, loss);
		}
		if (playedBest) {
			return new Judgement(MoveClass.BEST, loss);
		}
		MoveClass label;
		if (loss <= limits.excellent()) {
			label = MoveClass.EXCELLENT;
		}
		else if (loss <= limits.good()) {
			label = MoveClass.GOOD;
		}
		else if (loss <= limits.inaccuracy()) {
			label = MoveClass.INACCURACY;
		}
		else if (loss <= limits.mistake()) {
			label = MoveClass.MISTAKE;
		}
		else {
			label = MoveClass.BLUNDER;
		}
		return new Judgement(label, loss);
	}

	/**
	 * @param loss the mover's lost winning chances in percentage points, or {@code null} when unknown
	 */
	public record Judgement(MoveClass label, Double loss) {
	}

}
