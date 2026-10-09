package com.cyan.arcade.sudoku.engine;

import com.cyan.arcade.sudoku.engine.Hints.Advice;
import com.cyan.arcade.sudoku.engine.Hints.HintUnavailableException;
import com.cyan.arcade.sudoku.engine.SudokuGame.HintType;
import com.cyan.arcade.sudoku.engine.SudokuGame.MistakeRule;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/** What hints say: one deduction at a time, never the whole solution. */
class HintsTests {

	private static final Puzzle PUZZLE = Generator.generate(Difficulty.HARD, 5);

	private static SudokuGame game() {
		return SudokuGame.start(PUZZLE.givenValues(), PUZZLE.solutionValues(), MistakeRule.SOLUTION, 3);
	}

	@Test
	void aRevealWithoutAChosenCellPicksTheCellLogicSolvesNext() {
		Advice advice = Hints.advise(game(), HintType.REVEAL, null);
		Step next = LogicSolver.toNextPlacement(new LogicSolver.State(PUZZLE.givenValues())).getLast();
		assertThat(advice.cell()).isEqualTo(next.cell());
		assertThat(advice.digit()).isEqualTo(PUZZLE.solutionValues()[advice.cell()]);
		assertThat(advice.technique()).isEqualTo(next.technique());
	}

	@Test
	void aRevealOfAChosenCellGivesItsDigitAndNothingElse() {
		int cell = firstEmpty();
		Advice advice = Hints.advise(game(), HintType.REVEAL, cell);
		assertThat(advice.cell()).isEqualTo(cell);
		assertThat(advice.digit()).isEqualTo(PUZZLE.solutionValues()[cell]);
		SudokuGame after = game().hint(HintType.REVEAL, cell);
		// Exactly one more digit on the board.
		assertThat(Grid.filled(after.values())).isEqualTo(PUZZLE.clueCount() + 1);
	}

	@Test
	void aRevealOfAClueOrARightCellIsRefusedAndCostsNothing() {
		int clue = PUZZLE.givens().indexOf(PUZZLE.givens().chars().filter((ch) -> ch != '0').findFirst().orElseThrow());
		assertThatExceptionOfType(HintUnavailableException.class).isThrownBy(() -> Hints.advise(game(), HintType.REVEAL, clue))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(HintUnavailableException.Reason.CELL_LOCKED));
		int cell = firstEmpty();
		SudokuGame right = game().place(cell, PUZZLE.solutionValues()[cell]);
		assertThatExceptionOfType(HintUnavailableException.class).isThrownBy(() -> Hints.advise(right, HintType.REVEAL, cell))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(HintUnavailableException.Reason.CELL_ALREADY_RIGHT));
		assertThat(right.hints()).isZero();
	}

	@Test
	void aFindPointsAtACellWithoutItsDigit() {
		Advice advice = Hints.advise(game(), HintType.FIND, null);
		assertThat(advice.digit()).isZero();
		assertThat(advice.technique()).isNotNull();
		assertThat(PUZZLE.givenValues()[advice.cell()]).isZero();
		assertThat(advice.explanation()).singleElement().asString().contains(Grid.cellName(advice.cell()));
	}

	@Test
	void anExplanationWalksToTheNextDigit() {
		Advice advice = Hints.advise(game(), HintType.EXPLAIN, null);
		assertThat(advice.steps()).isNotEmpty();
		assertThat(advice.steps().getLast().isPlacement()).isTrue();
		assertThat(advice.steps().subList(0, advice.steps().size() - 1)).noneMatch(Step::isPlacement);
		assertThat(advice.explanation()).hasSameSizeAs(advice.steps());
		assertThat(advice.digit()).isEqualTo(PUZZLE.solutionValues()[advice.cell()]);
	}

	@Test
	void hintsReasonFromRightDigitsOnly() {
		// A wrong digit where logic would go next does not fool the hint: it is still about that cell.
		Advice clean = Hints.advise(game(), HintType.FIND, null);
		int wrong = (PUZZLE.solutionValues()[clean.cell()] % 9) + 1;
		Advice withMistake = Hints.advise(game().place(clean.cell(), wrong), HintType.FIND, null);
		assertThat(withMistake.cell()).isEqualTo(clean.cell());
	}

	@Test
	void noHintAfterThreeOrOnceTheGameIsOver() {
		SudokuGame used = game().hint(HintType.FIND, 0).hint(HintType.FIND, 0).hint(HintType.FIND, 0);
		assertThatExceptionOfType(HintUnavailableException.class).isThrownBy(() -> Hints.advise(used, HintType.REVEAL, null))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(HintUnavailableException.Reason.NO_HINTS_LEFT));
		int cell = firstEmpty();
		int wrong = (PUZZLE.solutionValues()[cell] % 9) + 1;
		SudokuGame failed = game().place(cell, wrong).place(cell, 0).place(cell, wrong).place(cell, 0).place(cell, wrong);
		assertThatExceptionOfType(HintUnavailableException.class).isThrownBy(() -> Hints.advise(failed, HintType.FIND, null))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(HintUnavailableException.Reason.GAME_OVER));
	}

	private static int firstEmpty() {
		return PUZZLE.givens().indexOf('0');
	}

}
