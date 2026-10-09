package com.cyan.arcade.sudoku.engine;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * One game of Sudoku as the server plays it: the clues, the solution, the digits the player has
 * entered, every action in order, mistakes and hints. Immutable: each action gives a new game, and
 * {@link #replay} rebuilds a game from its actions, which is how a recorded run is checked.
 *
 * <p>Clues and digits revealed by a hint are locked. Pencil marks are not part of the game: they
 * are the player's own notes and never change the board or the score.
 */
public final class SudokuGame {

	/** Hints per game, of any kind. */
	public static final int MAX_HINTS = 3;

	/** Mistakes that end a ranked game. */
	public static final int RANKED_MISTAKE_LIMIT = 3;

	/** Far more than any game needs; keeps a stored run from growing without end. */
	public static final int MAX_ACTIONS = 1500;

	public enum Status {

		PLAYING, SOLVED, FAILED;

		public boolean isOver() {
			return this != PLAYING;
		}

	}

	/** What counts as a mistake. */
	public enum MistakeRule {

		/** A digit that is not the solution's. The rule for every ranked game. */
		SOLUTION,

		/** A digit that repeats one in its row, column or box. Relaxed games only. */
		CONFLICT

	}

	public enum HintType {

		/** Fills a cell with its solution digit, which is then locked. */
		REVEAL,

		/** Points out a cell that logic can solve next, without its digit. */
		FIND,

		/** Explains the next deduction, step by step. */
		EXPLAIN

	}

	/** Something the player did, in the form a run records it. */
	public sealed interface Action permits Move, Hint {

		String encode();

		/** Reads an action back from {@link #encode()}: {@code M12=5}, {@code M12=0}, {@code R40}, {@code F7}, {@code E7}. */
		static Action decode(String text) {
			char kind = text.charAt(0);
			if (kind == 'M') {
				int equals = text.indexOf('=');
				return new Move(Integer.parseInt(text.substring(1, equals)), Integer.parseInt(text.substring(equals + 1)));
			}
			HintType type = switch (kind) {
				case 'R' -> HintType.REVEAL;
				case 'F' -> HintType.FIND;
				case 'E' -> HintType.EXPLAIN;
				default -> throw new IllegalArgumentException("Unknown action " + text);
			};
			return new Hint(type, Integer.parseInt(text.substring(1)));
		}

	}

	/** A digit entered in a cell, or 0 to clear it. */
	public record Move(int cell, int digit) implements Action {

		@Override
		public String encode() {
			return "M" + this.cell + "=" + this.digit;
		}

	}

	/** A hint taken, with the cell it was about. */
	public record Hint(HintType type, int cell) implements Action {

		@Override
		public String encode() {
			return type.name().charAt(0) + String.valueOf(this.cell);
		}

	}

	/** Why an action was refused. A refused action changes nothing and is not recorded. */
	public static final class ActionRejectedException extends RuntimeException {

		public enum Reason {

			GAME_OVER, LOCKED_CELL, OUT_OF_RANGE, NO_HINTS_LEFT, CELL_ALREADY_RIGHT, TOO_MANY_ACTIONS

		}

		private final Reason reason;

		ActionRejectedException(Reason reason) {
			super(reason.name());
			this.reason = reason;
		}

		public Reason reason() {
			return this.reason;
		}

	}

	private final int[] givens;

	private final int[] solution;

	private final int[] values;

	private final boolean[] revealed;

	private final MistakeRule rule;

	private final int mistakeLimit;

	private final int maxActions;

	private final int mistakes;

	private final int hints;

	private final List<Action> actions;

	private final Status status;

	private SudokuGame(int[] givens, int[] solution, int[] values, boolean[] revealed, MistakeRule rule,
			int mistakeLimit, int maxActions, int mistakes, int hints, List<Action> actions, Status status) {
		this.givens = givens;
		this.solution = solution;
		this.values = values;
		this.revealed = revealed;
		this.rule = rule;
		this.mistakeLimit = mistakeLimit;
		this.maxActions = maxActions;
		this.mistakes = mistakes;
		this.hints = hints;
		this.actions = actions;
		this.status = status;
	}

	/**
	 * A new game.
	 * @param mistakeLimit mistakes that end the game, or 0 for no limit
	 * @throws IllegalArgumentException when the solution is not a solved board agreeing with the clues
	 */
	public static SudokuGame start(int[] givens, int[] solution, MistakeRule rule, int mistakeLimit) {
		return start(givens, solution, rule, mistakeLimit, MAX_ACTIONS);
	}

	/**
	 * A new game that may take more than {@link #MAX_ACTIONS} actions: for checking a long search
	 * move by move, never for a player's run.
	 */
	public static SudokuGame start(int[] givens, int[] solution, MistakeRule rule, int mistakeLimit, int maxActions) {
		if (givens.length != Grid.CELLS || !Grid.isSolved(solution)) {
			throw new IllegalArgumentException("Not a puzzle and its solution");
		}
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (givens[cell] != 0 && givens[cell] != solution[cell]) {
				throw new IllegalArgumentException("The clues do not agree with the solution");
			}
		}
		return new SudokuGame(givens.clone(), solution.clone(), givens.clone(), new boolean[Grid.CELLS], rule,
				mistakeLimit, maxActions, 0, 0, List.of(), Status.PLAYING);
	}

	/**
	 * Plays the actions again from the start, each checked as it was when played.
	 * @throws ActionRejectedException when one of them could not have been played
	 */
	public static SudokuGame replay(int[] givens, int[] solution, MistakeRule rule, int mistakeLimit,
			List<Action> actions) {
		SudokuGame game = start(givens, solution, rule, mistakeLimit);
		for (Action action : actions) {
			game = switch (action) {
				case Move move -> game.place(move.cell(), move.digit());
				case Hint hint -> game.hint(hint.type(), hint.cell());
			};
		}
		return game;
	}

	/**
	 * Enters a digit in a cell, or clears it with 0. Entering the digit a cell already holds changes
	 * nothing and is not recorded.
	 */
	public SudokuGame place(int cell, int digit) {
		requirePlaying();
		if (cell < 0 || cell >= Grid.CELLS || digit < 0 || digit > 9) {
			throw new ActionRejectedException(ActionRejectedException.Reason.OUT_OF_RANGE);
		}
		if (isLocked(cell)) {
			throw new ActionRejectedException(ActionRejectedException.Reason.LOCKED_CELL);
		}
		if (this.values[cell] == digit) {
			return this;
		}
		boolean mistake = digit != 0 && isMistake(cell, digit);
		int[] next = this.values.clone();
		next[cell] = digit;
		int nextMistakes = this.mistakes + (mistake ? 1 : 0);
		return advance(next, this.revealed, nextMistakes, this.hints, new Move(cell, digit));
	}

	/**
	 * Takes a hint about a cell. A reveal fills it with its solution digit and locks it; the other
	 * kinds only record which cell they pointed at.
	 */
	public SudokuGame hint(HintType type, int cell) {
		requirePlaying();
		if (this.hints >= MAX_HINTS) {
			throw new ActionRejectedException(ActionRejectedException.Reason.NO_HINTS_LEFT);
		}
		if (cell < 0 || cell >= Grid.CELLS) {
			throw new ActionRejectedException(ActionRejectedException.Reason.OUT_OF_RANGE);
		}
		if (type != HintType.REVEAL) {
			return advance(this.values, this.revealed, this.mistakes, this.hints + 1, new Hint(type, cell));
		}
		if (isLocked(cell)) {
			throw new ActionRejectedException(ActionRejectedException.Reason.LOCKED_CELL);
		}
		if (this.values[cell] == this.solution[cell]) {
			throw new ActionRejectedException(ActionRejectedException.Reason.CELL_ALREADY_RIGHT);
		}
		int[] next = this.values.clone();
		next[cell] = this.solution[cell];
		boolean[] locked = this.revealed.clone();
		locked[cell] = true;
		return advance(next, locked, this.mistakes, this.hints + 1, new Hint(type, cell));
	}

	private SudokuGame advance(int[] values, boolean[] revealed, int mistakes, int hints, Action action) {
		if (this.actions.size() >= this.maxActions) {
			throw new ActionRejectedException(ActionRejectedException.Reason.TOO_MANY_ACTIONS);
		}
		List<Action> played = new ArrayList<>(this.actions);
		played.add(action);
		Status next = Status.PLAYING;
		if (Arrays.equals(values, this.solution)) {
			next = Status.SOLVED;
		}
		else if (this.mistakeLimit > 0 && mistakes >= this.mistakeLimit) {
			next = Status.FAILED;
		}
		return new SudokuGame(this.givens, this.solution, values, revealed, this.rule, this.mistakeLimit,
				this.maxActions, mistakes, hints, List.copyOf(played), next);
	}

	private boolean isMistake(int cell, int digit) {
		return switch (this.rule) {
			case SOLUTION -> digit != this.solution[cell];
			case CONFLICT -> Grid.conflictsWith(this.values, cell, digit);
		};
	}

	private void requirePlaying() {
		if (this.status.isOver()) {
			throw new ActionRejectedException(ActionRejectedException.Reason.GAME_OVER);
		}
	}

	/** A clue, or a digit revealed by a hint: neither can be changed. */
	public boolean isLocked(int cell) {
		return this.givens[cell] != 0 || this.revealed[cell];
	}

	/**
	 * Cells holding a digit that is not the solution's, for a game played by the solution rule. A
	 * relaxed game does not say: its player only sees conflicts, as the rule they play by.
	 */
	public Set<Integer> wrongCells() {
		Set<Integer> wrong = new TreeSet<>();
		if (this.rule == MistakeRule.SOLUTION) {
			for (int cell = 0; cell < Grid.CELLS; cell++) {
				if (this.values[cell] != 0 && this.values[cell] != this.solution[cell]) {
					wrong.add(cell);
				}
			}
		}
		return wrong;
	}

	/** Cells revealed by a hint. */
	public Set<Integer> revealedCells() {
		Set<Integer> cells = new TreeSet<>();
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (this.revealed[cell]) {
				cells.add(cell);
			}
		}
		return cells;
	}

	/** The board with only the digits that are right: what logic may build on. */
	public int[] rightValues() {
		int[] right = new int[Grid.CELLS];
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			right[cell] = (this.values[cell] == this.solution[cell]) ? this.values[cell] : 0;
		}
		return right;
	}

	public int[] givens() {
		return this.givens.clone();
	}

	public int[] solution() {
		return this.solution.clone();
	}

	public int[] values() {
		return this.values.clone();
	}

	public MistakeRule rule() {
		return this.rule;
	}

	public int mistakeLimit() {
		return this.mistakeLimit;
	}

	public int mistakes() {
		return this.mistakes;
	}

	public int hints() {
		return this.hints;
	}

	public int hintsLeft() {
		return MAX_HINTS - this.hints;
	}

	public List<Action> actions() {
		return this.actions;
	}

	public Status status() {
		return this.status;
	}

}
