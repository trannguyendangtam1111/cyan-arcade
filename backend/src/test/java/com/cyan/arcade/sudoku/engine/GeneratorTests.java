package com.cyan.arcade.sudoku.engine;

import java.util.Arrays;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Puzzle generation: valid, unique, reproducible and of the asked difficulty. */
class GeneratorTests {

	/** Seeds tried for every difficulty. Generation is deterministic, so these are fixed fixtures. */
	private static final long[] SEEDS = { 1, 2, 3, 42, 2026, 123456789L, -7L, Long.MAX_VALUE };

	@ParameterizedTest
	@EnumSource(Difficulty.class)
	void everySolutionIsAValidCompletedBoard(Difficulty difficulty) {
		for (long seed : SEEDS) {
			int[] solution = Generator.generate(difficulty, seed).solutionValues();
			for (int house = 0; house < 27; house++) {
				int[] digits = Arrays.stream(Grid.house(house)).map((cell) -> solution[cell]).sorted().toArray();
				assertThat(digits).as("%s of seed %d", Grid.houseName(house), seed)
					.containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9);
			}
		}
	}

	@ParameterizedTest
	@EnumSource(Difficulty.class)
	void everyPuzzleHasExactlyOneSolutionAndItIsTheStoredOne(Difficulty difficulty) {
		for (long seed : SEEDS) {
			Puzzle puzzle = Generator.generate(difficulty, seed);
			int[] givens = puzzle.givenValues();
			assertThat(Solver.countSolutions(givens, 2)).isEqualTo(1);
			assertThat(Solver.solve(givens)).hasValueSatisfying((solved) -> assertThat(solved).isEqualTo(puzzle.solutionValues()));
			// Every clue is the solution's digit in that cell.
			for (int cell = 0; cell < Grid.CELLS; cell++) {
				if (givens[cell] != 0) {
					assertThat(givens[cell]).isEqualTo(puzzle.solutionValues()[cell]);
				}
			}
		}
	}

	@ParameterizedTest
	@EnumSource(Difficulty.class)
	void theDifficultyIsWhatLogicNeedsToSolveThePuzzle(Difficulty difficulty) {
		for (long seed : SEEDS) {
			Puzzle puzzle = Generator.generate(difficulty, seed);
			LogicSolver.Grade grade = LogicSolver.grade(puzzle.givenValues());
			assertThat(grade.solved()).isTrue();
			assertThat(grade.difficulty()).contains(difficulty);
			assertThat(puzzle.difficulty()).isEqualTo(difficulty);
			assertThat(puzzle.hardest()).isEqualTo(grade.hardest());
			assertThat(puzzle.clueCount()).isGreaterThanOrEqualTo(difficulty.minGivens());
			// Clues sit symmetrically through the centre.
			int[] givens = puzzle.givenValues();
			for (int cell = 0; cell < Grid.CELLS; cell++) {
				assertThat(givens[cell] == 0).isEqualTo(givens[80 - cell] == 0);
			}
		}
	}

	@Test
	void theSameSeedGivesTheSamePuzzleAndAnotherSeedAnother() {
		Puzzle first = Generator.generate(Difficulty.HARD, 2026);
		Puzzle again = Generator.generate(Difficulty.HARD, 2026);
		assertThat(again).isEqualTo(first);
		assertThat(Generator.generate(Difficulty.HARD, 2027).givens()).isNotEqualTo(first.givens());
	}

	@Test
	void fixedSeedsArePinned() {
		// If these change, Generator.VERSION must change too: the same seeds would make other puzzles.
		assertThat(Generator.VERSION).isEqualTo(1);
		assertThat(Generator.generate(Difficulty.MEDIUM, 42).givens()).isEqualTo(
				"000620000080000059000000102000013508157000934803590000509000000740000020000065000");
		assertThat(Generator.generate(Difficulty.EXPERT, 7).givens()).isEqualTo(
				"820000406940003008500000010010049000300070004000380020070000003100700082209000071");
	}

	@Test
	void difficultiesGrowHarderByTechniqueNotOnlyByClues() {
		// Easy needs only full houses and hidden singles; Hard always something beyond singles.
		for (long seed : SEEDS) {
			Technique easiest = Generator.generate(Difficulty.EASY, seed).hardest();
			Technique hard = Generator.generate(Difficulty.HARD, seed).hardest();
			Technique expert = Generator.generate(Difficulty.EXPERT, seed).hardest();
			assertThat(easiest.tier()).isEqualTo(Difficulty.EASY);
			assertThat(hard.tier()).isEqualTo(Difficulty.HARD);
			assertThat(expert.tier()).isEqualTo(Difficulty.EXPERT);
		}
	}

}
