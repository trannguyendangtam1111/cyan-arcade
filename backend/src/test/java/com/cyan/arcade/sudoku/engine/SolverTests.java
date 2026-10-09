package com.cyan.arcade.sudoku.engine;

import java.util.List;
import java.util.Optional;

import com.cyan.arcade.sudoku.engine.LogicSolver.State;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The exhaustive search (uniqueness) and the logic solver (techniques, grading). */
class SolverTests {

	@Test
	void aProperPuzzleHasExactlyOneSolution() {
		int[] puzzle = Grid.parse(GridTests.PUZZLE);
		assertThat(Solver.countSolutions(puzzle, 2)).isEqualTo(1);
		assertThat(Solver.hasUniqueSolution(puzzle)).isTrue();
		assertThat(Solver.solve(puzzle)).hasValueSatisfying((solution) -> assertThat(Grid.format(solution))
			.isEqualTo(GridTests.SOLVED.replace("\n", "")));
	}

	@Test
	void tooFewCluesAreNotUniqueAndBrokenCluesHaveNoSolution() {
		int[] empty = new int[Grid.CELLS];
		assertThat(Solver.countSolutions(empty, 2)).isEqualTo(2);
		assertThat(Solver.hasUniqueSolution(empty)).isFalse();

		int[] broken = Grid.parse(GridTests.PUZZLE);
		broken[2] = 5;
		assertThat(Solver.countSolutions(broken, 2)).isZero();
		assertThat(Solver.solve(broken)).isEmpty();
	}

	@Test
	void randomSolutionsAreValidAndFollowTheSeed() {
		int[] first = Solver.randomSolution(new Rng(9));
		assertThat(Grid.isSolved(first)).isTrue();
		assertThat(Solver.randomSolution(new Rng(9))).isEqualTo(first);
		assertThat(Solver.randomSolution(new Rng(10))).isNotEqualTo(first);
	}

	@Test
	void theCandidatesOfACellAreItsOpenDigits() {
		State state = new State(Grid.parse(GridTests.PUZZLE));
		assertThat(Grid.digits(state.candidates(2))).containsExactly(1, 2, 4);
	}

	@Test
	void logicTakesTheSimplestDeductionFirst() {
		// Two empty cells in row 1: singles finish them, nothing harder is looked at.
		int[] board = Grid.parse(GridTests.SOLVED);
		board[0] = 0;
		board[1] = 0;
		Optional<Step> step = LogicSolver.next(new State(board));
		assertThat(step).hasValueSatisfying((found) -> {
			assertThat(found.isPlacement()).isTrue();
			assertThat(found.technique()).isIn(Technique.FULL_HOUSE, Technique.HIDDEN_SINGLE);
		});
	}

	@Test
	void logicFinishesANearlySolvedBoardOneCellAtATime() {
		int[] board = Grid.parse(GridTests.SOLVED);
		int[] cleared = { 40, 0, 8, 72, 80 };
		for (int cell : cleared) {
			board[cell] = 0;
		}
		List<Step> path = LogicSolver.path(board);
		assertThat(path).hasSize(cleared.length).allMatch(Step::isPlacement);
		State state = new State(board);
		path.forEach(state::apply);
		assertThat(state.isSolved()).isTrue();
		assertThat(state.values()).isEqualTo(Grid.parse(GridTests.SOLVED));
	}

	@Test
	void gradingTheSamePuzzleAlwaysGivesTheSameGrade() {
		int[] puzzle = Grid.parse(GridTests.PUZZLE);
		LogicSolver.Grade first = LogicSolver.grade(puzzle);
		assertThat(LogicSolver.grade(puzzle)).isEqualTo(first);
		assertThat(first.solved()).isTrue();
		assertThat(first.difficulty()).isPresent();
	}

	@Test
	void logicStopsWhereItHasNoTechniqueRatherThanGuessing() {
		// A notoriously hard puzzle: it needs search, which logic alone does not do.
		int[] hardest = Grid.parse("800000000003600000070090200050007000000045700000100030001000068008500010090000400");
		LogicSolver.Grade grade = LogicSolver.grade(hardest);
		assertThat(grade.solved()).isFalse();
		assertThat(grade.difficulty()).isEmpty();
		assertThat(Solver.hasUniqueSolution(hardest)).isTrue();
	}

	@Test
	void everyDeductionAgreesWithTheSolution() {
		for (Difficulty difficulty : Difficulty.values()) {
			Puzzle puzzle = Generator.generate(difficulty, 11);
			int[] solution = puzzle.solutionValues();
			for (Step step : LogicSolver.path(puzzle.givenValues())) {
				if (step.isPlacement()) {
					assertThat(step.digit()).isEqualTo(solution[step.cell()]);
				}
				step.eliminations().forEach((elimination) -> assertThat(solution[elimination.cell()])
					.isNotEqualTo(elimination.digit()));
				assertThat(Explanations.labelled(step)).startsWith(step.technique().label()).doesNotContain("%");
			}
		}
	}

}
