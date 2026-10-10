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
 * up to 10, <b>Mistake</b> up to 20, <b>Blunder</b> beyond.
 * </ol>
 * A move that is not the engine's choice but loses nothing (the later, deeper analysis can even think
 * it better) is Excellent, not a mistake.
 */
public final class MoveClassifier {

	public enum MoveClass {

		BEST, EXCELLENT, GOOD, INACCURACY, MISTAKE, BLUNDER, FORCED, UNRATED

	}

	public static final double EXCELLENT = 2;

	public static final double GOOD = 5;

	public static final double INACCURACY = 10;

	public static final double MISTAKE = 20;

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
		if (loss <= EXCELLENT) {
			label = MoveClass.EXCELLENT;
		}
		else if (loss <= GOOD) {
			label = MoveClass.GOOD;
		}
		else if (loss <= INACCURACY) {
			label = MoveClass.INACCURACY;
		}
		else if (loss <= MISTAKE) {
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
