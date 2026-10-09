package com.cyan.arcade.sudoku.ai;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import com.cyan.arcade.sudoku.engine.Explanations;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.LogicSolver;
import com.cyan.arcade.sudoku.engine.LogicSolver.State;
import com.cyan.arcade.sudoku.engine.Solver;
import com.cyan.arcade.sudoku.engine.Step;
import com.cyan.arcade.sudoku.engine.Step.Elimination;
import com.cyan.arcade.sudoku.engine.SudokuGame;
import com.cyan.arcade.sudoku.engine.SudokuGame.MistakeRule;
import com.cyan.arcade.sudoku.engine.Technique;

/**
 * The Sudoku AI: solves a puzzle with one of the {@link Strategy strategies} and returns every move
 * it made, for the board to play back. Speed is the player's business: the moves depend only on the
 * puzzle and the strategy.
 *
 * <p>Before anything is returned, the moves are played through a real {@link SudokuGame} of the
 * puzzle: the logical strategies by the solution rule, with not one mistake allowed; the search by
 * the conflict rule (its trial digits may be wrong, but never break the rules); and every strategy
 * must end on the solved board. A solution that fails that is never handed out.
 */
public final class SudokuAi {

	/** Search moves kept for playback; past this only the final placements are shown. */
	static final int MAX_SEARCH_EVENTS = 3000;

	private SudokuAi() {
	}

	public enum Kind {

		/** A digit placed: by logic, or by the search as a forced move. */
		PLACE,

		/** Candidates removed by logic. */
		ELIMINATE,

		/** The search tries a digit in a cell that has several. */
		GUESS,

		/** The search backs out of a dead end, clearing these cells. */
		BACKTRACK

	}

	/**
	 * One move.
	 * @param cell the cell placed or guessed; -1 for an elimination or a backtrack
	 * @param cleared for a backtrack, the cells cleared
	 * @param technique for a logical move, its technique; otherwise {@code null}
	 * @param text a one-line reason
	 * @param lesson for teaching, the longer explanation; otherwise empty
	 * @param highlight cells the move is about (a pattern, a house), for the board to show
	 */
	public record Move(Kind kind, int cell, int digit, List<Elimination> eliminations, List<Integer> cleared,
			Technique technique, String text, List<String> lesson, List<Integer> highlight) {

		public Move {
			eliminations = List.copyOf(eliminations);
			cleared = List.copyOf(cleared);
			lesson = List.copyOf(lesson);
			highlight = List.copyOf(highlight);
		}

	}

	/**
	 * @param trimmed whether the search made too many moves to show them all, so only its final
	 * placements are
	 * @param techniques how often each technique was used (logical strategies)
	 * @param searched placements logic could not make, settled by search instead
	 */
	public record Solution(Strategy strategy, String givens, String solution, List<Move> moves, int guesses,
			int backtracks, Map<Technique, Integer> techniques, int searched, boolean trimmed) {

		public Solution {
			moves = List.copyOf(moves);
			techniques = Map.copyOf(techniques);
		}

	}

	/**
	 * @param givens a puzzle with exactly one solution
	 * @throws IllegalArgumentException when it has none, or more than one
	 */
	public static Solution solve(Strategy strategy, int[] givens) {
		if (!Solver.hasUniqueSolution(givens)) {
			throw new IllegalArgumentException("The AI solves puzzles with exactly one solution");
		}
		int[] solution = Solver.solve(givens).orElseThrow();
		Solution solved = switch (strategy) {
			case STEP_BY_STEP -> logical(strategy, givens, solution, false);
			case TEACHING -> logical(strategy, givens, solution, true);
			case FAST -> new Search(givens, solution).run();
		};
		verify(solved, givens, solution);
		return solved;
	}

	// --- Logic -------------------------------------------------------------------------------------

	private static Solution logical(Strategy strategy, int[] givens, int[] solution, boolean teach) {
		State state = new State(givens);
		List<Move> moves = new ArrayList<>();
		Map<Technique, Integer> techniques = new EnumMap<>(Technique.class);
		int searched = 0;
		while (!state.isSolved()) {
			if (teach) {
				Optional<Step> step = LogicSolver.next(state);
				if (step.isPresent()) {
					moves.add(teachingMove(step.get(), state));
					techniques.merge(step.get().technique(), 1, Integer::sum);
					state.apply(step.get());
					continue;
				}
			}
			else {
				List<Step> chain = LogicSolver.toNextPlacement(state);
				if (!chain.isEmpty()) {
					Step placement = chain.getLast();
					List<Step> before = chain.subList(0, chain.size() - 1);
					before.forEach((step) -> techniques.merge(step.technique(), 1, Integer::sum));
					techniques.merge(placement.technique(), 1, Integer::sum);
					chain.forEach(state::apply);
					moves.add(new Move(Kind.PLACE, placement.cell(), placement.digit(), List.of(), List.of(),
							placement.technique(), stepByStepText(before, placement), List.of(), highlight(placement)));
					continue;
				}
			}
			// Logic is stuck: the cell with the fewest candidates gets the digit the search proves it has.
			int cell = fewestCandidates(state);
			int digit = solution[cell];
			String text = "None of my techniques applies here, so a search settles it: %s is %d (%d candidates)."
				.formatted(Grid.cellName(cell), digit, Grid.count(state.candidates(cell)));
			moves.add(new Move(Kind.PLACE, cell, digit, List.of(), List.of(), null, text,
					teach ? List.of(text, "This is beyond the techniques taught here (singles, intersections, "
							+ "subsets, X-Wing, Y-Wing, Swordfish), so it is not explained step by step.") : List.of(),
					List.of(cell)));
			state.apply(new Step(Technique.NAKED_SINGLE, cell, digit, List.of(), List.of(), List.of(cell), Grid.bit(digit)));
			searched++;
		}
		return new Solution(strategy, Grid.format(givens), Grid.format(solution), moves, 0, 0, techniques, searched, false);
	}

	private static Move teachingMove(Step step, State before) {
		List<String> lesson = Explanations.teach(step, before);
		if (step.isPlacement()) {
			return new Move(Kind.PLACE, step.cell(), step.digit(), List.of(), List.of(), step.technique(),
					Explanations.labelled(step), lesson, highlight(step));
		}
		return new Move(Kind.ELIMINATE, -1, 0, step.eliminations(), List.of(), step.technique(), Explanations.labelled(step),
				lesson, highlight(step));
	}

	private static String stepByStepText(List<Step> before, Step placement) {
		String reason = Explanations.labelled(placement);
		if (before.isEmpty()) {
			return reason;
		}
		String used = before.stream()
			.map((step) -> step.technique().label())
			.distinct()
			.collect(Collectors.joining(", "));
		return "After %d elimination%s (%s). %s".formatted(before.size(), (before.size() == 1) ? "" : "s", used, reason);
	}

	/** The cells of the houses a step reasons about, and its pattern. */
	private static List<Integer> highlight(Step step) {
		List<Integer> cells = new ArrayList<>(step.pattern());
		for (int house : step.houses()) {
			for (int cell : Grid.house(house)) {
				if (!cells.contains(cell)) {
					cells.add(cell);
				}
			}
		}
		return cells;
	}

	private static int fewestCandidates(State state) {
		int best = -1;
		int fewest = 10;
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			int count = Grid.count(state.candidates(cell));
			if (state.value(cell) == 0 && count < fewest) {
				best = cell;
				fewest = count;
			}
		}
		return best;
	}

	// --- Search ------------------------------------------------------------------------------------

	/** Propagation and depth-first search, recording what it does. */
	private static final class Search {

		private final int[] givens;

		private final int[] solution;

		private final int[] values;

		private final List<Move> moves = new ArrayList<>();

		private int guesses;

		private int backtracks;

		private boolean trimmed;

		Search(int[] givens, int[] solution) {
			this.givens = givens;
			this.solution = solution;
			this.values = givens.clone();
		}

		Solution run() {
			if (!search() || !Grid.isSolved(this.values)) {
				throw new IllegalStateException("The search found no solution");
			}
			List<Move> shown = this.moves;
			if (this.trimmed) {
				shown = new ArrayList<>();
				for (int cell = 0; cell < Grid.CELLS; cell++) {
					if (this.givens[cell] == 0) {
						shown.add(new Move(Kind.PLACE, cell, this.values[cell], List.of(), List.of(), null,
								"Final placement (the search took too many moves to show).", List.of(), List.of(cell)));
					}
				}
			}
			return new Solution(Strategy.FAST, Grid.format(this.givens), Grid.format(this.solution), shown, this.guesses,
					this.backtracks, Map.of(), 0, this.trimmed);
		}

		/** Solves from here, or leaves the board as it found it and answers false. */
		private boolean search() {
			List<Integer> placed = new ArrayList<>();
			if (!propagate(placed)) {
				undo(placed);
				return false;
			}
			int cell = -1;
			int mask = 0;
			for (int candidate = 0; candidate < Grid.CELLS; candidate++) {
				if (this.values[candidate] != 0) {
					continue;
				}
				int open = Grid.candidates(this.values, candidate);
				if (cell < 0 || Grid.count(open) < Grid.count(mask)) {
					cell = candidate;
					mask = open;
				}
			}
			if (cell < 0) {
				return true;
			}
			int options = Grid.count(mask);
			for (int digit : Grid.digits(mask)) {
				this.guesses++;
				this.values[cell] = digit;
				record(new Move(Kind.GUESS, cell, digit, List.of(), List.of(), null,
						"Trying %d in %s (%d options).".formatted(digit, Grid.cellName(cell), options), List.of(),
						List.of(cell)));
				int mark = this.moves.size();
				if (search()) {
					return true;
				}
				this.values[cell] = 0;
				this.backtracks++;
				List<Integer> cleared = new ArrayList<>(List.of(cell));
				if (!this.trimmed) {
					// Everything placed since the guess was undone by the failed search; the guess goes too.
					for (Move move : this.moves.subList(mark, this.moves.size())) {
						if (move.kind() == Kind.PLACE && !cleared.contains(move.cell())) {
							cleared.add(move.cell());
						}
					}
				}
				record(new Move(Kind.BACKTRACK, -1, 0, List.of(), cleared.stream().sorted().toList(), null,
						"%d in %s leads to a dead end: backing out.".formatted(digit, Grid.cellName(cell)), List.of(),
						cleared));
			}
			undo(placed);
			return false;
		}

		/**
		 * Places every naked and hidden single until none is left.
		 * @return false on a contradiction: a cell with no candidate, or a digit with no place in a house
		 */
		private boolean propagate(List<Integer> placed) {
			boolean progress = true;
			while (progress) {
				progress = false;
				for (int cell = 0; cell < Grid.CELLS; cell++) {
					if (this.values[cell] != 0) {
						continue;
					}
					int open = Grid.candidates(this.values, cell);
					if (open == 0) {
						return false;
					}
					if (Grid.count(open) == 1) {
						place(cell, Grid.lowestDigit(open), "%s has one candidate left: %d.", placed);
						progress = true;
					}
				}
				for (int house = 0; house < 27 && !progress; house++) {
					int[] cells = Grid.house(house);
					for (int digit = 1; digit <= 9; digit++) {
						int spot = -1;
						int count = 0;
						boolean present = false;
						for (int cell : cells) {
							if (this.values[cell] == digit) {
								present = true;
							}
							else if (this.values[cell] == 0 && (Grid.candidates(this.values, cell) & Grid.bit(digit)) != 0) {
								spot = cell;
								count++;
							}
						}
						if (present) {
							continue;
						}
						if (count == 0) {
							return false;
						}
						if (count == 1) {
							place(spot, digit, "%s is the only place for %d in " + Grid.houseName(house) + ".", placed);
							progress = true;
						}
					}
				}
			}
			return true;
		}

		private void place(int cell, int digit, String reason, List<Integer> placed) {
			this.values[cell] = digit;
			placed.add(cell);
			record(new Move(Kind.PLACE, cell, digit, List.of(), List.of(), null, reason.formatted(Grid.cellName(cell), digit),
					List.of(), List.of(cell)));
		}

		private void undo(List<Integer> placed) {
			placed.forEach((cell) -> this.values[cell] = 0);
		}

		private void record(Move move) {
			if (this.moves.size() >= MAX_SEARCH_EVENTS) {
				this.trimmed = true;
				return;
			}
			this.moves.add(move);
		}

	}

	// --- Checking ----------------------------------------------------------------------------------

	/** Plays the moves through a real game: no broken rule, no wrong digit by logic, a solved board. */
	private static void verify(Solution solved, int[] givens, int[] solution) {
		boolean search = solved.strategy() == Strategy.FAST;
		SudokuGame game = SudokuGame.start(givens, solution, search ? MistakeRule.CONFLICT : MistakeRule.SOLUTION, 0,
				Integer.MAX_VALUE);
		for (Move move : solved.moves()) {
			switch (move.kind()) {
				case PLACE, GUESS -> {
					if (game.isLocked(move.cell()) || game.values()[move.cell()] != 0) {
						throw new IllegalStateException("The AI wrote over a filled cell");
					}
					game = game.place(move.cell(), move.digit());
				}
				case BACKTRACK -> {
					for (int cell : move.cleared()) {
						game = game.place(cell, 0);
					}
				}
				case ELIMINATE -> {
					for (Elimination elimination : move.eliminations()) {
						if (solution[elimination.cell()] == elimination.digit()) {
							throw new IllegalStateException("The AI eliminated a solution digit");
						}
					}
				}
			}
			if (game.mistakes() > 0) {
				throw new IllegalStateException("The AI made a move the rules do not allow");
			}
		}
		if (game.status() != SudokuGame.Status.SOLVED) {
			throw new IllegalStateException("The AI did not finish the puzzle");
		}
	}

}
