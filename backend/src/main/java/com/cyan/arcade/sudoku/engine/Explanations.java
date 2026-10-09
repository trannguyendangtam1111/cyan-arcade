package com.cyan.arcade.sudoku.engine;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.sudoku.engine.LogicSolver.State;
import com.cyan.arcade.sudoku.engine.Step.Elimination;

/**
 * Plain-language explanations of {@link Step}s: a short one for hints and the step-by-step solver,
 * and a longer one for teaching, which also spells out the row, column and box constraints.
 */
public final class Explanations {

	private Explanations() {
	}

	/** The technique's name, then {@link #brief}. */
	public static String labelled(Step step) {
		return step.technique().label() + ": " + brief(step);
	}

	/** One or two sentences: what the step does and why. */
	public static String brief(Step step) {
		String digits = digitList(step.digits(), " or ");
		return switch (step.technique()) {
			case FULL_HOUSE -> "%s is the last empty cell in %s, so it takes the missing %d."
				.formatted(Grid.cellName(step.cell()), Grid.houseName(step.houses().getFirst()), step.digit());
			case HIDDEN_SINGLE -> "In %s, %d fits only in %s."
				.formatted(Grid.houseName(step.houses().getFirst()), step.digit(), Grid.cellName(step.cell()));
			case NAKED_SINGLE -> "%s can only be %d: every other digit is already in its row, column or box."
				.formatted(Grid.cellName(step.cell()), step.digit());
			case LOCKED_CANDIDATES -> {
				int from = step.houses().get(0);
				int to = step.houses().get(1);
				String kind = (from >= 18) ? "pointing" : "claiming";
				yield "In %s, %s can only go where it meets %s (%s), so %s comes out of the rest of %s (%s)."
					.formatted(Grid.houseName(from), digits, Grid.houseName(to), kind, digits, Grid.houseName(to),
							cells(eliminatedCells(step)));
			}
			case NAKED_PAIR, NAKED_TRIPLE -> "%s can only hold %s between them, so no other cell in %s can (%s)."
				.formatted(cells(step.pattern()), digitList(step.digits(), ", "),
						Grid.houseName(step.houses().getFirst()), cells(eliminatedCells(step)));
			case HIDDEN_PAIR, HIDDEN_TRIPLE -> "In %s, %s fit only in %s, so those cells hold nothing else."
				.formatted(Grid.houseName(step.houses().getFirst()),
						digitList(step.digits(), ", "), cells(step.pattern()));
			case X_WING, SWORDFISH -> {
				int size = (step.technique() == Technique.X_WING) ? 2 : 3;
				List<Integer> base = step.houses().subList(0, size);
				List<Integer> cover = step.houses().subList(size, step.houses().size());
				yield "On %s: in %s, %s fits only in %s, so %s comes out of the rest of those lines (%s)."
					.formatted(digits, houses(base), digits, houses(cover), digits,
							cells(eliminatedCells(step)));
			}
			case Y_WING -> {
				int pivot = step.pattern().get(0);
				int z = step.eliminations().getFirst().digit();
				yield "Whatever %s is, one of %s and %s must be %d, so %d comes out of every cell that sees both (%s)."
					.formatted(Grid.cellName(pivot), Grid.cellName(step.pattern().get(1)),
							Grid.cellName(step.pattern().get(2)), z, z, cells(eliminatedCells(step)));
			}
		};
	}

	/**
	 * The step for someone learning: for a placement, which digits the cell's row, column and box rule
	 * out; for an elimination, the candidates it removes and why they cannot stay.
	 * @param before the board just before the step
	 */
	public static List<String> teach(Step step, State before) {
		List<String> lines = new ArrayList<>();
		lines.add(labelled(step));
		if (step.isPlacement()) {
			int cell = step.cell();
			int[] houses = { Grid.row(cell), 9 + Grid.col(cell), 18 + Grid.box(cell) };
			List<String> seen = new ArrayList<>();
			for (int house : houses) {
				Set<Integer> digits = new LinkedHashSet<>();
				for (int other : Grid.HOUSES[house]) {
					if (before.value(other) != 0) {
						digits.add(before.value(other));
					}
				}
				seen.add("%s has %s".formatted(Grid.houseName(house),
						digits.isEmpty() ? "nothing yet" : digits.stream().sorted().map(String::valueOf).collect(Collectors.joining(", "))));
			}
			lines.add(capitalise(String.join("; ", seen)) + ".");
			lines.add("Candidates left in %s: %s.".formatted(Grid.cellName(cell), digitList(before.candidates(cell), ", ")));
			if (step.technique() == Technique.HIDDEN_SINGLE) {
				lines.add("Every other empty cell of %s already sees a %d, so %s is the only place for it."
					.formatted(Grid.houseName(step.houses().getFirst()), step.digit(), Grid.cellName(cell)));
			}
		}
		else {
			lines.add("Removes " + step.eliminations()
				.stream()
				.map((elimination) -> elimination.digit() + " from " + Grid.cellName(elimination.cell()))
				.collect(Collectors.joining(", ")) + ".");
			lines.add("No digit is placed yet, but fewer candidates open up the next single.");
		}
		return lines;
	}

	private static List<Integer> eliminatedCells(Step step) {
		return step.eliminations().stream().map(Elimination::cell).distinct().sorted().toList();
	}

	private static String cells(List<Integer> cells) {
		return cells.stream().map(Grid::cellName).collect(Collectors.joining(", "));
	}

	private static String houses(List<Integer> houses) {
		return houses.stream().map(Grid::houseName).collect(Collectors.joining(" and "));
	}

	private static String digitList(int mask, String last) {
		int[] digits = Grid.digits(mask);
		if (digits.length <= 1) {
			return Arrays.stream(digits).mapToObj(String::valueOf).collect(Collectors.joining());
		}
		String head = Arrays.stream(digits, 0, digits.length - 1).mapToObj(String::valueOf).collect(Collectors.joining(", "));
		return head + (last.equals(", ") ? " and " : last) + digits[digits.length - 1];
	}

	private static String capitalise(String text) {
		return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
	}

}
