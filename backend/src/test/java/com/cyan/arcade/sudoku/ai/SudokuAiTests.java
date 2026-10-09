package com.cyan.arcade.sudoku.ai;

import java.util.ArrayList;
import java.util.List;

import com.cyan.arcade.sudoku.ai.SudokuAi.Kind;
import com.cyan.arcade.sudoku.ai.SudokuAi.Move;
import com.cyan.arcade.sudoku.ai.SudokuAi.Solution;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.cyan.arcade.sudoku.engine.Technique;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** The AI's three strategies: correct, different from each other, and the same every time. */
class SudokuAiTests {

	/** Needs search: no technique the engine knows cracks it. */
	private static final String SEARCH_ONLY = "800000000003600000070090200050007000000045700000100030001000068008500010090000400";

	@ParameterizedTest
	@EnumSource(Strategy.class)
	void everyStrategySolvesEveryDifficulty(Strategy strategy) {
		for (Difficulty difficulty : Difficulty.values()) {
			Puzzle puzzle = Generator.generate(difficulty, 3);
			Solution solution = SudokuAi.solve(strategy, puzzle.givenValues());
			assertThat(solution.solution()).isEqualTo(puzzle.solution());
			assertThat(playBack(puzzle.givenValues(), solution.moves())).isEqualTo(puzzle.solutionValues());
		}
	}

	@Test
	void theLogicalStrategiesNeverPlaceAWrongDigit() {
		Puzzle puzzle = Generator.generate(Difficulty.EXPERT, 8);
		int[] answer = puzzle.solutionValues();
		for (Strategy strategy : List.of(Strategy.STEP_BY_STEP, Strategy.TEACHING)) {
			for (Move move : SudokuAi.solve(strategy, puzzle.givenValues()).moves()) {
				if (move.kind() == Kind.PLACE) {
					assertThat(move.digit()).isEqualTo(answer[move.cell()]);
				}
				move.eliminations().forEach((elimination) -> assertThat(answer[elimination.cell()]).isNotEqualTo(elimination.digit()));
				assertThat(move.kind()).isIn(Kind.PLACE, Kind.ELIMINATE);
			}
		}
	}

	@Test
	void theStrategiesBehaveDifferently() {
		Puzzle puzzle = Generator.generate(Difficulty.EXPERT, 8);
		Solution stepByStep = SudokuAi.solve(Strategy.STEP_BY_STEP, puzzle.givenValues());
		Solution teaching = SudokuAi.solve(Strategy.TEACHING, puzzle.givenValues());
		Solution fast = SudokuAi.solve(Strategy.FAST, puzzle.givenValues());

		// Step by step: placements only, one per empty cell, each with a reason; eliminations folded in.
		int empty = Grid.CELLS - puzzle.clueCount();
		assertThat(stepByStep.moves()).hasSize(empty).allMatch((move) -> move.kind() == Kind.PLACE && !move.text().isBlank());
		assertThat(stepByStep.moves()).anyMatch((move) -> move.text().startsWith("After "));
		assertThat(stepByStep.moves()).allMatch((move) -> move.lesson().isEmpty());

		// Teaching: the eliminations are moves of their own, with lessons that spell out the houses.
		assertThat(teaching.moves()).anyMatch((move) -> move.kind() == Kind.ELIMINATE);
		assertThat(teaching.moves()).allMatch((move) -> move.lesson().size() >= 2);
		assertThat(teaching.moves().stream().filter((move) -> move.kind() == Kind.PLACE).findFirst().orElseThrow().lesson())
			.anyMatch((line) -> line.startsWith("Row ") && line.contains("column") && line.contains("box"));
		assertThat(teaching.techniques()).containsKey(puzzle.hardest());

		// Fast: propagation and search, no techniques, no lessons.
		assertThat(fast.techniques()).isEmpty();
		assertThat(fast.moves()).allMatch((move) -> move.technique() == null && move.lesson().isEmpty());
	}

	@Test
	void theSearchGuessesAndBacksOutWhereLogicIsStuck() {
		int[] puzzle = Grid.parse(SEARCH_ONLY);
		Solution fast = SudokuAi.solve(Strategy.FAST, puzzle);
		assertThat(fast.guesses()).isPositive();
		assertThat(fast.backtracks()).isPositive();
		assertThat(fast.moves()).anyMatch((move) -> move.kind() == Kind.GUESS)
			.anyMatch((move) -> move.kind() == Kind.BACKTRACK && !move.cleared().isEmpty());
		assertThat(playBack(puzzle, fast.moves())).isEqualTo(Grid.parse(fast.solution()));

		// The logical strategies say so plainly when they have to fall back on search.
		Solution stepByStep = SudokuAi.solve(Strategy.STEP_BY_STEP, puzzle);
		assertThat(stepByStep.searched()).isPositive();
		assertThat(stepByStep.moves()).anyMatch((move) -> move.technique() == null && move.text().contains("search"));
	}

	@Test
	void theSamePuzzleAndStrategyAlwaysGiveTheSameMoves() {
		Puzzle puzzle = Generator.generate(Difficulty.HARD, 21);
		for (Strategy strategy : Strategy.values()) {
			assertThat(SudokuAi.solve(strategy, puzzle.givenValues())).isEqualTo(SudokuAi.solve(strategy, puzzle.givenValues()));
		}
	}

	@Test
	void onlyPuzzlesWithOneSolutionAreSolved() {
		assertThatIllegalArgumentException().isThrownBy(() -> SudokuAi.solve(Strategy.FAST, new int[Grid.CELLS]));
	}

	@Test
	void techniquesAreCounted() {
		Puzzle puzzle = Generator.generate(Difficulty.MEDIUM, 4);
		Solution solution = SudokuAi.solve(Strategy.STEP_BY_STEP, puzzle.givenValues());
		assertThat(solution.techniques()).containsKey(Technique.NAKED_SINGLE)
			.doesNotContainKeys(Technique.X_WING, Technique.Y_WING, Technique.SWORDFISH);
	}

	/** The board after the moves, as the browser plays them back. */
	private static int[] playBack(int[] givens, List<Move> moves) {
		int[] board = givens.clone();
		List<Integer> placed = new ArrayList<>();
		for (Move move : moves) {
			switch (move.kind()) {
				case PLACE, GUESS -> {
					assertThat(board[move.cell()]).isZero();
					assertThat(Grid.conflictsWith(board, move.cell(), move.digit())).isFalse();
					board[move.cell()] = move.digit();
					placed.add(move.cell());
				}
				case BACKTRACK -> move.cleared().forEach((cell) -> board[cell] = 0);
				case ELIMINATE -> {
				}
			}
		}
		assertThat(placed).isNotEmpty();
		return board;
	}

}
