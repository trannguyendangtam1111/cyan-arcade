package com.cyan.arcade.sudoku.engine;

import java.util.List;

import com.cyan.arcade.sudoku.engine.SudokuGame.ActionRejectedException;
import com.cyan.arcade.sudoku.engine.SudokuGame.ActionRejectedException.Reason;
import com.cyan.arcade.sudoku.engine.SudokuGame.HintType;
import com.cyan.arcade.sudoku.engine.SudokuGame.MistakeRule;
import com.cyan.arcade.sudoku.engine.SudokuGame.Status;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** A game as the server plays it: moves, mistakes, hints, the end, and replaying it. */
class SudokuGameTests {

	private static final int[] GIVENS = Grid.parse(GridTests.PUZZLE);

	private static final int[] SOLUTION = Grid.parse(GridTests.SOLVED);

	/** r1c3: empty, its digit is 4. */
	private static final int CELL = 2;

	private static SudokuGame ranked() {
		return SudokuGame.start(GIVENS, SOLUTION, MistakeRule.SOLUTION, SudokuGame.RANKED_MISTAKE_LIMIT);
	}

	@Test
	void aMoveEntersADigitAndARightOneIsNoMistake() {
		SudokuGame game = ranked().place(CELL, 4);
		assertThat(game.values()[CELL]).isEqualTo(4);
		assertThat(game.mistakes()).isZero();
		assertThat(game.wrongCells()).isEmpty();
		assertThat(game.actions()).extracting(SudokuGame.Action::encode).containsExactly("M2=4");
		assertThat(game.status()).isEqualTo(Status.PLAYING);
	}

	@Test
	void underTheSolutionRuleAWrongDigitIsAMistakeEvenWithoutAConflict() {
		// 1 does not repeat anything around r1c3, but the solution has 4 there.
		assertThat(Grid.conflictsWith(GIVENS, CELL, 1)).isFalse();
		SudokuGame game = ranked().place(CELL, 1);
		assertThat(game.mistakes()).isEqualTo(1);
		assertThat(game.wrongCells()).containsExactly(CELL);
	}

	@Test
	void underTheConflictRuleOnlyARepeatIsAMistake() {
		SudokuGame relaxed = SudokuGame.start(GIVENS, SOLUTION, MistakeRule.CONFLICT, 0);
		assertThat(relaxed.place(CELL, 1).mistakes()).isZero();
		// 5 is already in row 1.
		assertThat(relaxed.place(CELL, 5).mistakes()).isEqualTo(1);
		// A relaxed game does not say which digits are wrong.
		assertThat(relaxed.place(CELL, 1).wrongCells()).isEmpty();
	}

	@Test
	void cluesCannotBeChangedOrCleared() {
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> ranked().place(0, 9))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Reason.LOCKED_CELL));
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> ranked().place(0, 0));
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> ranked().place(81, 1))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Reason.OUT_OF_RANGE));
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> ranked().place(CELL, 10));
	}

	@Test
	void erasingClearsADigitAndCostsNothing() {
		SudokuGame game = ranked().place(CELL, 1).place(CELL, 0);
		assertThat(game.values()[CELL]).isZero();
		assertThat(game.mistakes()).isEqualTo(1);
		assertThat(game.wrongCells()).isEmpty();
		// Entering what is already there changes nothing and is not recorded.
		assertThat(game.place(CELL, 0)).isSameAs(game);
	}

	@Test
	void theThirdMistakeEndsARankedGame() {
		SudokuGame game = ranked().place(CELL, 1).place(CELL, 2).place(CELL, 6);
		assertThat(game.mistakes()).isEqualTo(3);
		assertThat(game.status()).isEqualTo(Status.FAILED);
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> game.place(CELL, 4))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Reason.GAME_OVER));
	}

	@Test
	void theLastRightDigitSolvesTheGame() {
		SudokuGame game = ranked();
		int last = -1;
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (GIVENS[cell] == 0) {
				if (last >= 0) {
					game = game.place(last, SOLUTION[last]);
				}
				last = cell;
			}
		}
		assertThat(game.status()).isEqualTo(Status.PLAYING);
		game = game.place(last, SOLUTION[last]);
		assertThat(game.status()).isEqualTo(Status.SOLVED);
		assertThat(game.values()).isEqualTo(SOLUTION);
	}

	@Test
	void aRevealFillsAndLocksTheCellAndCountsAsAHint() {
		SudokuGame game = ranked().place(CELL, 1).hint(HintType.REVEAL, CELL);
		assertThat(game.values()[CELL]).isEqualTo(4);
		assertThat(game.isLocked(CELL)).isTrue();
		assertThat(game.revealedCells()).containsExactly(CELL);
		assertThat(game.hints()).isEqualTo(1);
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> game.place(CELL, 0));
		// Revealing a cell that is already right is refused.
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> ranked().place(CELL, 4).hint(HintType.REVEAL, CELL))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Reason.CELL_ALREADY_RIGHT));
	}

	@Test
	void threeHintsOfAnyKindAndNoMore() {
		SudokuGame game = ranked().hint(HintType.FIND, 3).hint(HintType.EXPLAIN, 3).hint(HintType.REVEAL, CELL);
		assertThat(game.hints()).isEqualTo(3);
		assertThat(game.hintsLeft()).isZero();
		assertThatExceptionOfType(ActionRejectedException.class).isThrownBy(() -> game.hint(HintType.FIND, 3))
			.satisfies((ex) -> assertThat(ex.reason()).isEqualTo(Reason.NO_HINTS_LEFT));
	}

	@Test
	void replayingTheActionsGivesTheSameGame() {
		SudokuGame game = ranked().place(CELL, 1).place(CELL, 0).hint(HintType.REVEAL, CELL).place(3, 6).place(3, 2);
		SudokuGame replayed = SudokuGame.replay(GIVENS, SOLUTION, MistakeRule.SOLUTION, 3, game.actions());
		assertThat(replayed.values()).isEqualTo(game.values());
		assertThat(replayed.mistakes()).isEqualTo(game.mistakes());
		assertThat(replayed.hints()).isEqualTo(game.hints());
		assertThat(replayed.status()).isEqualTo(game.status());
		List<SudokuGame.Action> decoded = game.actions().stream().map((action) -> SudokuGame.Action.decode(action.encode())).toList();
		assertThat(decoded).isEqualTo(game.actions());
	}

	@Test
	void aReplayThatBreaksTheRulesIsRefused() {
		List<SudokuGame.Action> forged = List.of(new SudokuGame.Move(0, 9));
		assertThatExceptionOfType(ActionRejectedException.class)
			.isThrownBy(() -> SudokuGame.replay(GIVENS, SOLUTION, MistakeRule.SOLUTION, 3, forged));
	}

	@Test
	void aGameNeedsASolutionThatAgreesWithItsClues() {
		int[] wrong = SOLUTION.clone();
		wrong[0] = SOLUTION[1];
		wrong[1] = SOLUTION[0];
		assertThatIllegalArgumentException().isThrownBy(() -> SudokuGame.start(GIVENS, wrong, MistakeRule.SOLUTION, 3));
	}

}
