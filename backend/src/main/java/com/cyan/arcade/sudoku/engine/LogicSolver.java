package com.cyan.arcade.sudoku.engine;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import com.cyan.arcade.sudoku.engine.Step.Elimination;

/**
 * Solves the way a person does: one deduction at a time, always the simplest technique that makes
 * progress (see {@link Technique}). It never guesses, so when it is stuck it says so instead of
 * searching. Used to grade puzzles, to give hints and to teach.
 */
public final class LogicSolver {

	/** Boxes first: that is where people look for hidden singles first. */
	private static final int[] HIDDEN_SINGLE_ORDER = { 18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3, 4, 5, 6, 7, 8,
			9, 10, 11, 12, 13, 14, 15, 16, 17 };

	private static final List<Function<State, Optional<Step>>> TECHNIQUES = List.of(LogicSolver::fullHouse,
			LogicSolver::hiddenSingle, LogicSolver::nakedSingle, LogicSolver::lockedCandidates,
			(state) -> nakedSubset(state, 2, Technique.NAKED_PAIR), (state) -> hiddenSubset(state, 2, Technique.HIDDEN_PAIR),
			(state) -> nakedSubset(state, 3, Technique.NAKED_TRIPLE),
			(state) -> hiddenSubset(state, 3, Technique.HIDDEN_TRIPLE), (state) -> fish(state, 2, Technique.X_WING),
			LogicSolver::yWing, (state) -> fish(state, 3, Technique.SWORDFISH));

	/** More steps than any board needs: a guard, never reached by a real solve. */
	private static final int MAX_STEPS = 2000;

	private LogicSolver() {
	}

	/** A board being solved: its digits and the candidates still open in each empty cell. */
	public static final class State {

		private final int[] values;

		private final int[] candidates;

		/** Starts from the digits alone: every candidate their houses allow. */
		public State(int[] values) {
			this.values = values.clone();
			this.candidates = Grid.candidates(this.values);
		}

		private State(int[] values, int[] candidates) {
			this.values = values;
			this.candidates = candidates;
		}

		public State copy() {
			return new State(this.values.clone(), this.candidates.clone());
		}

		public int value(int cell) {
			return this.values[cell];
		}

		public int candidates(int cell) {
			return this.candidates[cell];
		}

		public int[] values() {
			return this.values.clone();
		}

		public boolean isSolved() {
			for (int value : this.values) {
				if (value == 0) {
					return false;
				}
			}
			return true;
		}

		/** Makes the deduction: places the digit and clears it from the peers, or removes the candidates. */
		public void apply(Step step) {
			if (step.isPlacement()) {
				this.values[step.cell()] = step.digit();
				this.candidates[step.cell()] = 0;
				int clear = ~Grid.bit(step.digit());
				for (int peer : Grid.PEERS[step.cell()]) {
					this.candidates[peer] &= clear;
				}
			}
			for (Elimination elimination : step.eliminations()) {
				this.candidates[elimination.cell()] &= ~Grid.bit(elimination.digit());
			}
		}

		private boolean has(int cell, int digit) {
			return this.values[cell] == 0 && (this.candidates[cell] & Grid.bit(digit)) != 0;
		}

		private int placed(int house) {
			int mask = 0;
			for (int cell : Grid.HOUSES[house]) {
				mask |= Grid.bit(this.values[cell]);
			}
			return mask & Grid.ALL;
		}

	}

	/**
	 * What solving a puzzle by logic took.
	 * @param solved whether logic alone finished it
	 * @param hardest the hardest technique used; {@code null} when none was needed
	 * @param uses how often each technique was used
	 */
	public record Grade(boolean solved, Technique hardest, Map<Technique, Integer> uses, int steps) {

		public Grade {
			uses = Map.copyOf(uses);
		}

		/** The puzzle's difficulty, or empty when logic alone cannot solve it. */
		public Optional<Difficulty> difficulty() {
			if (!this.solved) {
				return Optional.empty();
			}
			return Optional.of((this.hardest != null) ? this.hardest.tier() : Difficulty.EASY);
		}

	}

	/** The simplest deduction there is to make, or empty when logic is stuck (or the board is full). */
	public static Optional<Step> next(State state) {
		for (Function<State, Optional<Step>> technique : TECHNIQUES) {
			Optional<Step> step = technique.apply(state);
			if (step.isPresent()) {
				return step;
			}
		}
		return Optional.empty();
	}

	/**
	 * The deductions that lead to the next placed digit: any eliminations needed first, then the
	 * placement. The state is left as it was.
	 * @return empty when logic is stuck before placing anything
	 */
	public static List<Step> toNextPlacement(State state) {
		State work = state.copy();
		List<Step> chain = new ArrayList<>();
		for (int guard = 0; guard < MAX_STEPS; guard++) {
			Optional<Step> step = next(work);
			if (step.isEmpty()) {
				return List.of();
			}
			chain.add(step.get());
			if (step.get().isPlacement()) {
				return chain;
			}
			work.apply(step.get());
		}
		return List.of();
	}

	/** Every deduction from the puzzle until it is solved or logic is stuck. */
	public static List<Step> path(int[] puzzle) {
		State state = new State(puzzle);
		List<Step> steps = new ArrayList<>();
		for (int guard = 0; guard < MAX_STEPS && !state.isSolved(); guard++) {
			Optional<Step> step = next(state);
			if (step.isEmpty()) {
				break;
			}
			steps.add(step.get());
			state.apply(step.get());
		}
		return steps;
	}

	public static Grade grade(int[] puzzle) {
		State state = new State(puzzle);
		Map<Technique, Integer> uses = new EnumMap<>(Technique.class);
		Technique hardest = null;
		int steps = 0;
		while (steps < MAX_STEPS && !state.isSolved()) {
			Optional<Step> step = next(state);
			if (step.isEmpty()) {
				break;
			}
			Technique technique = step.get().technique();
			uses.merge(technique, 1, Integer::sum);
			if (hardest == null || technique.compareTo(hardest) > 0) {
				hardest = technique;
			}
			state.apply(step.get());
			steps++;
		}
		return new Grade(state.isSolved(), hardest, uses, steps);
	}

	// --- Singles -----------------------------------------------------------------------------------

	private static Optional<Step> fullHouse(State state) {
		for (int house = 0; house < 27; house++) {
			int empty = -1;
			int count = 0;
			for (int cell : Grid.HOUSES[house]) {
				if (state.values[cell] == 0) {
					empty = cell;
					count++;
				}
			}
			int missing = Grid.ALL & ~state.placed(house);
			if (count == 1 && Grid.count(missing) == 1 && (state.candidates[empty] & missing) != 0) {
				return Optional.of(Step.placement(Technique.FULL_HOUSE, empty, Grid.lowestDigit(missing), List.of(house)));
			}
		}
		return Optional.empty();
	}

	private static Optional<Step> hiddenSingle(State state) {
		for (int house : HIDDEN_SINGLE_ORDER) {
			int placed = state.placed(house);
			for (int digit = 1; digit <= 9; digit++) {
				if ((placed & Grid.bit(digit)) != 0) {
					continue;
				}
				int only = -1;
				int count = 0;
				for (int cell : Grid.HOUSES[house]) {
					if (state.has(cell, digit)) {
						only = cell;
						count++;
					}
				}
				if (count == 1) {
					return Optional.of(Step.placement(Technique.HIDDEN_SINGLE, only, digit, List.of(house)));
				}
			}
		}
		return Optional.empty();
	}

	private static Optional<Step> nakedSingle(State state) {
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (state.values[cell] == 0 && Grid.count(state.candidates[cell]) == 1) {
				int[] houses = Grid.HOUSES_OF[cell];
				return Optional.of(Step.placement(Technique.NAKED_SINGLE, cell, Grid.lowestDigit(state.candidates[cell]),
						List.of(houses[0], houses[1], houses[2])));
			}
		}
		return Optional.empty();
	}

	// --- Intersections -----------------------------------------------------------------------------

	/** Pointing (a box's digit on one line) and claiming (a line's digit in one box). */
	private static Optional<Step> lockedCandidates(State state) {
		for (int box = 18; box < 27; box++) {
			for (int digit = 1; digit <= 9; digit++) {
				List<Integer> cells = cellsWith(state, box, digit);
				if (cells.size() < 2) {
					continue;
				}
				for (int line : sharedLines(cells)) {
					Optional<Step> step = locked(state, box, line, digit, cells);
					if (step.isPresent()) {
						return step;
					}
				}
			}
		}
		for (int line = 0; line < 18; line++) {
			for (int digit = 1; digit <= 9; digit++) {
				List<Integer> cells = cellsWith(state, line, digit);
				if (cells.size() < 2) {
					continue;
				}
				int box = 18 + Grid.box(cells.getFirst());
				if (cells.stream().allMatch((cell) -> 18 + Grid.box(cell) == box)) {
					Optional<Step> step = locked(state, line, box, digit, cells);
					if (step.isPresent()) {
						return step;
					}
				}
			}
		}
		return Optional.empty();
	}

	/** The line (row or column house) all these cells share, if any. */
	private static List<Integer> sharedLines(List<Integer> cells) {
		List<Integer> lines = new ArrayList<>();
		int row = Grid.row(cells.getFirst());
		int col = Grid.col(cells.getFirst());
		if (cells.stream().allMatch((cell) -> Grid.row(cell) == row)) {
			lines.add(row);
		}
		if (cells.stream().allMatch((cell) -> Grid.col(cell) == col)) {
			lines.add(9 + col);
		}
		return lines;
	}

	private static Optional<Step> locked(State state, int from, int to, int digit, List<Integer> cells) {
		List<Elimination> eliminations = new ArrayList<>();
		for (int cell : Grid.HOUSES[to]) {
			if (!cells.contains(cell) && state.has(cell, digit)) {
				eliminations.add(new Elimination(cell, digit));
			}
		}
		if (eliminations.isEmpty()) {
			return Optional.empty();
		}
		return Optional.of(new Step(Technique.LOCKED_CANDIDATES, -1, 0, eliminations, List.of(from, to), cells,
				Grid.bit(digit)));
	}

	// --- Subsets -----------------------------------------------------------------------------------

	/** N cells of a house that together hold only N digits: those digits go nowhere else in the house. */
	private static Optional<Step> nakedSubset(State state, int size, Technique technique) {
		for (int house = 0; house < 27; house++) {
			List<Integer> open = new ArrayList<>();
			for (int cell : Grid.HOUSES[house]) {
				int count = Grid.count(state.candidates[cell]);
				if (state.values[cell] == 0 && count >= 2 && count <= size) {
					open.add(cell);
				}
			}
			for (int[] combo : combinations(open.size(), size)) {
				int union = 0;
				List<Integer> cells = new ArrayList<>();
				for (int index : combo) {
					cells.add(open.get(index));
					union |= state.candidates[open.get(index)];
				}
				if (Grid.count(union) != size) {
					continue;
				}
				List<Elimination> eliminations = new ArrayList<>();
				for (int cell : Grid.HOUSES[house]) {
					if (state.values[cell] != 0 || cells.contains(cell)) {
						continue;
					}
					for (int digit : Grid.digits(state.candidates[cell] & union)) {
						eliminations.add(new Elimination(cell, digit));
					}
				}
				if (!eliminations.isEmpty()) {
					return Optional.of(new Step(technique, -1, 0, eliminations, List.of(house), cells, union));
				}
			}
		}
		return Optional.empty();
	}

	/** N digits of a house that fit only in the same N cells: those cells hold nothing else. */
	private static Optional<Step> hiddenSubset(State state, int size, Technique technique) {
		for (int house = 0; house < 27; house++) {
			int[] cellsOfHouse = Grid.HOUSES[house];
			List<Integer> digits = new ArrayList<>();
			List<Integer> positions = new ArrayList<>();
			for (int digit = 1; digit <= 9; digit++) {
				int where = 0;
				for (int index = 0; index < 9; index++) {
					if (state.has(cellsOfHouse[index], digit)) {
						where |= 1 << index;
					}
				}
				int count = Integer.bitCount(where);
				if (count >= 2 && count <= size) {
					digits.add(digit);
					positions.add(where);
				}
			}
			for (int[] combo : combinations(digits.size(), size)) {
				int where = 0;
				int digitMask = 0;
				for (int index : combo) {
					where |= positions.get(index);
					digitMask |= Grid.bit(digits.get(index));
				}
				if (Integer.bitCount(where) != size) {
					continue;
				}
				List<Integer> cells = new ArrayList<>();
				List<Elimination> eliminations = new ArrayList<>();
				for (int index = 0; index < 9; index++) {
					if ((where & (1 << index)) == 0) {
						continue;
					}
					int cell = cellsOfHouse[index];
					cells.add(cell);
					for (int digit : Grid.digits(state.candidates[cell] & ~digitMask)) {
						eliminations.add(new Elimination(cell, digit));
					}
				}
				if (!eliminations.isEmpty()) {
					return Optional.of(new Step(technique, -1, 0, eliminations, List.of(house), cells, digitMask));
				}
			}
		}
		return Optional.empty();
	}

	// --- Fish and wings ----------------------------------------------------------------------------

	/**
	 * X-Wing (size 2) and Swordfish (size 3): in N rows a digit fits only in the same N columns (or
	 * the other way round), so it is placed in those columns within those rows and nowhere else in them.
	 */
	private static Optional<Step> fish(State state, int size, Technique technique) {
		for (int digit = 1; digit <= 9; digit++) {
			for (boolean byRows : new boolean[] { true, false }) {
				List<Integer> lines = new ArrayList<>();
				List<Integer> spots = new ArrayList<>();
				for (int line = 0; line < 9; line++) {
					int where = 0;
					for (int cross = 0; cross < 9; cross++) {
						if (state.has(byRows ? line * 9 + cross : cross * 9 + line, digit)) {
							where |= 1 << cross;
						}
					}
					int count = Integer.bitCount(where);
					if (count >= 2 && count <= size) {
						lines.add(line);
						spots.add(where);
					}
				}
				for (int[] combo : combinations(lines.size(), size)) {
					int cover = 0;
					List<Integer> base = new ArrayList<>();
					for (int index : combo) {
						cover |= spots.get(index);
						base.add(lines.get(index));
					}
					if (Integer.bitCount(cover) != size) {
						continue;
					}
					List<Elimination> eliminations = new ArrayList<>();
					List<Integer> pattern = new ArrayList<>();
					List<Integer> houses = new ArrayList<>();
					for (int line : base) {
						houses.add(byRows ? line : 9 + line);
					}
					for (int cross = 0; cross < 9; cross++) {
						if ((cover & (1 << cross)) == 0) {
							continue;
						}
						houses.add(byRows ? 9 + cross : cross);
						for (int line = 0; line < 9; line++) {
							int cell = byRows ? line * 9 + cross : cross * 9 + line;
							if (!state.has(cell, digit)) {
								continue;
							}
							if (base.contains(line)) {
								pattern.add(cell);
							}
							else {
								eliminations.add(new Elimination(cell, digit));
							}
						}
					}
					if (!eliminations.isEmpty()) {
						return Optional.of(new Step(technique, -1, 0, eliminations, houses, pattern.stream().sorted().toList(),
								Grid.bit(digit)));
					}
				}
			}
		}
		return Optional.empty();
	}

	/**
	 * A pivot that is X or Y, seeing one pincer that is X or Z and another that is Y or Z: one of the
	 * pincers is Z whatever the pivot is, so Z goes from every cell that sees both.
	 */
	private static Optional<Step> yWing(State state) {
		for (int pivot = 0; pivot < Grid.CELLS; pivot++) {
			int pivotMask = state.candidates[pivot];
			if (state.values[pivot] != 0 || Grid.count(pivotMask) != 2) {
				continue;
			}
			for (int first : Grid.PEERS[pivot]) {
				int firstMask = state.candidates[first];
				if (state.values[first] != 0 || Grid.count(firstMask) != 2 || Grid.count(firstMask & pivotMask) != 1) {
					continue;
				}
				int z = firstMask & ~pivotMask;
				int secondMask = (pivotMask & ~firstMask) | z;
				for (int second : Grid.PEERS[pivot]) {
					if (second == first || state.values[second] != 0 || state.candidates[second] != secondMask) {
						continue;
					}
					int digit = Grid.lowestDigit(z);
					List<Elimination> eliminations = new ArrayList<>();
					for (int cell = 0; cell < Grid.CELLS; cell++) {
						if (cell != pivot && cell != first && cell != second && Grid.sees(cell, first)
								&& Grid.sees(cell, second) && state.has(cell, digit)) {
							eliminations.add(new Elimination(cell, digit));
						}
					}
					if (!eliminations.isEmpty()) {
						return Optional.of(new Step(Technique.Y_WING, -1, 0, eliminations, List.of(),
								List.of(pivot, first, second), pivotMask | z));
					}
				}
			}
		}
		return Optional.empty();
	}

	// --- Helpers -----------------------------------------------------------------------------------

	private static List<Integer> cellsWith(State state, int house, int digit) {
		List<Integer> cells = new ArrayList<>();
		for (int cell : Grid.HOUSES[house]) {
			if (state.has(cell, digit)) {
				cells.add(cell);
			}
		}
		return cells;
	}

	/** Every way to choose {@code size} of {@code count} indexes, in order. */
	private static List<int[]> combinations(int count, int size) {
		List<int[]> combos = new ArrayList<>();
		if (size > count) {
			return combos;
		}
		int[] combo = new int[size];
		for (int index = 0; index < size; index++) {
			combo[index] = index;
		}
		while (true) {
			combos.add(combo.clone());
			int index = size - 1;
			while (index >= 0 && combo[index] == count - size + index) {
				index--;
			}
			if (index < 0) {
				return combos;
			}
			combo[index]++;
			for (int next = index + 1; next < size; next++) {
				combo[next] = combo[next - 1] + 1;
			}
		}
	}

}
