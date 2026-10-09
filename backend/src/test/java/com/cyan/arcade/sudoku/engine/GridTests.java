package com.cyan.arcade.sudoku.engine;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** The board, its houses, conflicts and candidates. */
class GridTests {

	/** A solved board, used across the engine tests. */
	static final String SOLVED = """
			534678912
			672195348
			198342567
			859761423
			426853791
			713924856
			961537284
			287419635
			345286179""";

	/** That board with clues removed: a well-known puzzle with exactly one solution. */
	static final String PUZZLE = """
			530070000
			600195000
			098000060
			800060003
			400803001
			700020006
			060000280
			000419005
			000080079""";

	@Test
	void aSolvedBoardIsValid() {
		assertThat(Grid.isSolved(Grid.parse(SOLVED))).isTrue();
		assertThat(Grid.conflicts(Grid.parse(SOLVED))).isEmpty();
	}

	@Test
	void aRepeatInARowIsInvalid() {
		int[] board = Grid.parse(SOLVED);
		// Two 5s in row 1.
		board[1] = 5;
		assertThat(Grid.isSolved(board)).isFalse();
		assertThat(Grid.conflicts(board)).contains(0, 1);
	}

	@Test
	void aRepeatInAColumnIsInvalid() {
		int[] board = new int[Grid.CELLS];
		board[Grid.CELLS - 9] = 7;
		board[4 * 9] = 7;
		assertThat(Grid.conflicts(board)).containsExactly(36, 72);
		assertThat(Grid.isConsistent(board)).isFalse();
	}

	@Test
	void aRepeatInABoxIsInvalid() {
		int[] board = new int[Grid.CELLS];
		board[0] = 4;
		board[20] = 4;
		assertThat(Grid.conflicts(board)).containsExactly(0, 20);
		// Different rows and columns: only the box sees it.
		assertThat(Grid.row(0)).isNotEqualTo(Grid.row(20));
		assertThat(Grid.col(0)).isNotEqualTo(Grid.col(20));
	}

	@Test
	void emptyCellsNeverConflictAndAnUnfinishedBoardIsNotSolved() {
		int[] board = Grid.parse(PUZZLE);
		assertThat(Grid.conflicts(board)).isEmpty();
		assertThat(Grid.isConsistent(board)).isTrue();
		assertThat(Grid.isSolved(board)).isFalse();
	}

	@Test
	void candidatesAreTheDigitsNoHouseHasYet() {
		int[] board = Grid.parse(PUZZLE);
		// r1c3: row 1 has 5, 3, 7; column 3 has 8; box 1 has 5, 3, 6, 9, 8.
		assertThat(Grid.digits(Grid.candidates(board, 2))).containsExactly(1, 2, 4);
		assertThat(Grid.candidates(board, 0)).isZero();
		assertThat(Grid.conflictsWith(board, 2, 5)).isTrue();
		assertThat(Grid.conflictsWith(board, 2, 4)).isFalse();
	}

	@Test
	void housesAndPeers() {
		assertThat(Grid.house(0)).containsExactly(0, 1, 2, 3, 4, 5, 6, 7, 8);
		assertThat(Grid.house(9)).containsExactly(0, 9, 18, 27, 36, 45, 54, 63, 72);
		assertThat(Grid.house(18)).containsExactly(0, 1, 2, 9, 10, 11, 18, 19, 20);
		assertThat(Grid.peers(40)).hasSize(20).doesNotContain(40);
		assertThat(Grid.cellName(40)).isEqualTo("r5c5");
		assertThat(Grid.houseName(26)).isEqualTo("box 9");
	}

	@Test
	void boardsAreReadAndWrittenAs81Characters() {
		assertThat(Grid.format(Grid.parse(PUZZLE))).isEqualTo(PUZZLE.replace("\n", ""));
		assertThat(Grid.parse(PUZZLE.replace('0', '.'))).isEqualTo(Grid.parse(PUZZLE));
		assertThatIllegalArgumentException().isThrownBy(() -> Grid.parse("123"));
		assertThatIllegalArgumentException().isThrownBy(() -> Grid.parse("x".repeat(81)));
	}

}
