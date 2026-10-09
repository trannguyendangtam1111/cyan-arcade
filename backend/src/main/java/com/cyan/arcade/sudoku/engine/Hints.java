package com.cyan.arcade.sudoku.engine;

import java.util.List;

import com.cyan.arcade.sudoku.engine.LogicSolver.State;
import com.cyan.arcade.sudoku.engine.SudokuGame.HintType;

/**
 * Works out what a hint says. Hints reason from the digits that are right only, so a wrong entry
 * never leads one astray, and they give one deduction at a time: never the whole solution.
 *
 * <ul>
 * <li>{@link HintType#REVEAL}: the solution digit of the chosen cell, or, with none chosen, of the
 * cell logic would solve next.</li>
 * <li>{@link HintType#FIND}: the cell logic can solve next and the technique, without the digit.</li>
 * <li>{@link HintType#EXPLAIN}: the deductions that lead to the next digit, in words.</li>
 * </ul>
 */
public final class Hints {

	private Hints() {
	}

	/**
	 * A hint's content.
	 * @param cell the cell it is about
	 * @param digit the digit, for a reveal or an explanation; 0 for a find
	 * @param technique the technique that solves the cell, or {@code null} for a reveal no logic found
	 * @param steps for an explanation, the deductions in order; otherwise empty
	 */
	public record Advice(HintType type, int cell, int digit, Technique technique, List<Step> steps,
			List<String> explanation) {

		public Advice {
			steps = List.copyOf(steps);
			explanation = List.copyOf(explanation);
		}

	}

	/** Why a hint cannot be given. Nothing is used up. */
	public static final class HintUnavailableException extends RuntimeException {

		public enum Reason {

			GAME_OVER, NO_HINTS_LEFT, CELL_LOCKED, CELL_ALREADY_RIGHT, NO_LOGICAL_STEP

		}

		private final Reason reason;

		HintUnavailableException(Reason reason) {
			super(reason.name());
			this.reason = reason;
		}

		public Reason reason() {
			return this.reason;
		}

	}

	/**
	 * @param selected the cell the player has chosen, or {@code null}; only a reveal uses it
	 */
	public static Advice advise(SudokuGame game, HintType type, Integer selected) {
		if (game.status().isOver()) {
			throw new HintUnavailableException(HintUnavailableException.Reason.GAME_OVER);
		}
		if (game.hintsLeft() <= 0) {
			throw new HintUnavailableException(HintUnavailableException.Reason.NO_HINTS_LEFT);
		}
		int[] solution = game.solution();
		List<Step> chain = LogicSolver.toNextPlacement(new State(game.rightValues()));
		Step next = chain.isEmpty() ? null : chain.getLast();
		return switch (type) {
			case REVEAL -> {
				int cell = (selected != null) ? selected : (next != null) ? next.cell() : firstUnsolved(game);
				if (game.isLocked(cell)) {
					throw new HintUnavailableException(HintUnavailableException.Reason.CELL_LOCKED);
				}
				if (game.values()[cell] == solution[cell]) {
					throw new HintUnavailableException(HintUnavailableException.Reason.CELL_ALREADY_RIGHT);
				}
				yield new Advice(type, cell, solution[cell], (next != null && next.cell() == cell) ? next.technique() : null,
						List.of(), List.of("%s is %d.".formatted(Grid.cellName(cell), solution[cell])));
			}
			case FIND -> {
				Step step = requireStep(next);
				yield new Advice(type, step.cell(), 0, step.technique(), List.of(),
						List.of("%s can be solved now with a %s.".formatted(Grid.cellName(step.cell()),
								step.technique().label().toLowerCase())));
			}
			case EXPLAIN -> {
				Step step = requireStep(next);
				yield new Advice(type, step.cell(), step.digit(), step.technique(), chain,
						chain.stream().map(Explanations::labelled).toList());
			}
		};
	}

	private static Step requireStep(Step step) {
		if (step == null) {
			throw new HintUnavailableException(HintUnavailableException.Reason.NO_LOGICAL_STEP);
		}
		return step;
	}

	/** The empty or wrong cell with the fewest candidates: where to reveal when logic finds nothing. */
	private static int firstUnsolved(SudokuGame game) {
		int[] right = game.rightValues();
		int best = -1;
		int fewest = 10;
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (right[cell] == 0 && !game.isLocked(cell)) {
				int count = Grid.count(Grid.candidates(right, cell));
				if (count < fewest) {
					best = cell;
					fewest = count;
				}
			}
		}
		if (best < 0) {
			throw new HintUnavailableException(HintUnavailableException.Reason.GAME_OVER);
		}
		return best;
	}

}
