package com.cyan.arcade.gamerules;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.tuple;

/**
 * The server's Minesweeper boards and mine placement, against the engine's. The vectors are written by
 * the engine itself ({@code frontend/src/games/minesweeper/engine/minesweeperVectors.json}, checked by
 * {@code minesweeperBoards.test.ts}), so passing here means the same seed and first cell give the same
 * mines, and the same 3BV, on both sides.
 */
class MinesweeperLayoutTests {

	private static final Path VECTORS = Path.of("..", "frontend", "src", "games", "minesweeper", "engine",
			"minesweeperVectors.json");

	private static JsonNode vectors() throws IOException {
		assertThat(VECTORS).as("the engine's vectors, read from the repository's frontend").exists();
		return JsonMapper.builder().build().readTree(Files.readString(VECTORS));
	}

	private static int[] ints(JsonNode array) {
		int[] values = new int[array.size()];
		for (int i = 0; i < values.length; i++) {
			values[i] = array.get(i).asInt();
		}
		return values;
	}

	// --- The boards ----------------------------------------------------------------------------------

	@Test
	void theStandardBoardsAreTheEnginesBeginnerIntermediateAndExpert() {
		assertThat(MinesweeperBoard.BEGINNER).isEqualTo(new MinesweeperBoard(9, 9, 10));
		assertThat(MinesweeperBoard.INTERMEDIATE).isEqualTo(new MinesweeperBoard(16, 16, 40));
		assertThat(MinesweeperBoard.EXPERT).isEqualTo(new MinesweeperBoard(16, 30, 99));
		assertThat(List.of(MinesweeperBoard.BEGINNER, MinesweeperBoard.INTERMEDIATE, MinesweeperBoard.EXPERT))
			.extracting(MinesweeperBoard::cells, MinesweeperBoard::safeCells)
			.containsExactly(tuple(81, 71), tuple(256, 216),
					tuple(480, 381));
	}

	@Test
	void aBoardNeedsCellsAndRoomForTheFirstReveal() {
		assertThatIllegalArgumentException().isThrownBy(() -> new MinesweeperBoard(0, 9, 10));
		assertThatIllegalArgumentException().isThrownBy(() -> new MinesweeperBoard(9, 9, 0));
		assertThatIllegalArgumentException().isThrownBy(() -> new MinesweeperBoard(3, 3, 9));
	}

	@Test
	void neighboursAreTheEightAroundACellInTheEnginesOrder() {
		MinesweeperBoard expert = MinesweeperBoard.EXPERT;
		assertThat(expert.neighbours(0)).containsExactly(1, 30, 31);
		assertThat(expert.neighbours(29)).containsExactly(28, 58, 59);
		assertThat(expert.neighbours(479)).containsExactly(448, 449, 478);
		assertThat(expert.neighbours(5)).hasSize(5);
		assertThat(expert.neighbours(31)).containsExactly(0, 1, 2, 30, 32, 60, 61, 62);
	}

	// --- The shared vectors --------------------------------------------------------------------------

	@Test
	void theGeneratorDrawsTheEnginesNumbers() throws IOException {
		for (JsonNode vector : vectors().get("random")) {
			MinesweeperLayout.SeededRandom random = new MinesweeperLayout.SeededRandom(vector.get("seed").asLong());
			List<Long> drawn = new ArrayList<>();
			for (int i = 0; i < vector.get("outputs").size(); i++) {
				drawn.add(random.nextBits());
			}
			List<Long> expected = new ArrayList<>();
			vector.get("outputs").forEach((output) -> expected.add(output.asLong()));
			assertThat(drawn).as("seed %s", vector.get("seed")).isEqualTo(expected);
		}
	}

	@Test
	void theMinesGoWhereTheEngineLaysThem() throws IOException {
		Set<String> boards = new HashSet<>();
		int checked = 0;
		for (JsonNode vector : vectors().get("boards")) {
			MinesweeperBoard board = new MinesweeperBoard(vector.get("rows").asInt(), vector.get("columns").asInt(),
					vector.get("mines").asInt());
			long seed = vector.get("seed").asLong();
			int firstCell = vector.get("firstCell").asInt();
			int[] mines = ints(vector.get("mineCells"));
			String name = vector.get("board").asString();
			boards.add(name);
			switch (name) {
				case "beginner" -> assertThat(board).isEqualTo(MinesweeperBoard.BEGINNER);
				case "intermediate" -> assertThat(board).isEqualTo(MinesweeperBoard.INTERMEDIATE);
				case "expert" -> assertThat(board).isEqualTo(MinesweeperBoard.EXPERT);
				default -> assertThat(name).isEqualTo("small");
			}

			MinesweeperLayout laid = MinesweeperLayout.lay(board, seed, firstCell);
			assertThat(laid.mineCells()).as("%s, seed %s, first cell %s", name, seed, firstCell).containsExactly(mines);
			assertThat(laid.threeBV()).as("3BV of %s, seed %s", name, seed).isEqualTo(vector.get("threeBV").asInt());
			// The seed as a signed 32-bit number, as timed modes will send it, lays the same mines.
			assertThat(vector.get("signedSeed").asInt()).isEqualTo((int) seed);
			assertThat(MinesweeperLayout.lay(board, vector.get("signedSeed").asInt(), firstCell).mineCells())
				.containsExactly(mines);
			// The generator ends where the engine's did: one draw a mine, from the same seed.
			MinesweeperLayout.SeededRandom random = new MinesweeperLayout.SeededRandom(seed);
			IntStream.range(0, board.mines()).forEach((pick) -> random.nextBits());
			assertThat(random.seed()).isEqualTo(vector.get("seedAfter").asInt());
			checked++;
		}
		assertThat(boards).containsExactlyInAnyOrder("beginner", "intermediate", "expert", "small");
		assertThat(checked).isEqualTo(20);
	}

	// --- Placement -----------------------------------------------------------------------------------

	@Test
	void theFirstCellAndItsNeighboursAreKeptClearOnEveryStandardBoard() {
		for (MinesweeperBoard board : List.of(MinesweeperBoard.BEGINNER, MinesweeperBoard.INTERMEDIATE,
				MinesweeperBoard.EXPERT)) {
			int[] firsts = { 0, board.columns() - 1, board.cells() - board.columns(), board.cells() - 1,
					board.cells() / 2 };
			for (long seed = 1; seed <= 30; seed++) {
				for (int first : firsts) {
					MinesweeperLayout laid = MinesweeperLayout.lay(board, seed, first);
					assertThat(laid.mineCells()).hasSize(board.mines());
					assertThat(laid.isMine(first)).isFalse();
					assertThat(laid.adjacent(first)).isZero();
					for (int neighbour : board.neighbours(first)) {
						assertThat(laid.isMine(neighbour)).isFalse();
					}
				}
			}
		}
	}

	@Test
	void theSameSeedAndFirstCellAlwaysLayTheSameMines() {
		MinesweeperLayout once = MinesweeperLayout.lay(MinesweeperBoard.EXPERT, 31337, 250);
		assertThat(MinesweeperLayout.lay(MinesweeperBoard.EXPERT, 31337, 250).mineCells())
			.containsExactly(once.mineCells());
		assertThat(MinesweeperLayout.lay(MinesweeperBoard.EXPERT, 31338, 250).mineCells())
			.isNotEqualTo(once.mineCells());
		// Another first cell far enough away keeps other cells clear, so the shuffle lays other mines. (A
		// neighbouring first cell may lay the same ones: its clear area is much the same.)
		assertThat(MinesweeperLayout.lay(MinesweeperBoard.EXPERT, 31337, 0).mineCells()).isNotEqualTo(once.mineCells());
	}

	@Test
	void aFirstCellOffTheBoardLaysNothing() {
		assertThatIllegalArgumentException()
			.isThrownBy(() -> MinesweeperLayout.lay(MinesweeperBoard.BEGINNER, 1, 81));
		assertThatIllegalArgumentException()
			.isThrownBy(() -> MinesweeperLayout.lay(MinesweeperBoard.BEGINNER, 1, -1));
	}

	// --- 3BV -----------------------------------------------------------------------------------------

	@Test
	void threeBvCountsTheFixedBoardsAsTheEngineDoes() {
		// The same fixed boards as minesweeperBoards.test.ts.
		assertThat(MinesweeperLayout.withMines(new MinesweeperBoard(3, 3, 1), 0).threeBV()).isEqualTo(1);
		assertThat(MinesweeperLayout.withMines(new MinesweeperBoard(1, 5, 1), 2).threeBV()).isEqualTo(2);
		assertThat(MinesweeperLayout.withMines(new MinesweeperBoard(1, 3, 1), 1).threeBV()).isEqualTo(2);
		assertThat(MinesweeperLayout.withMines(new MinesweeperBoard(3, 5, 2), 2, 12).threeBV()).isEqualTo(3);
		assertThat(MinesweeperLayout.withMines(new MinesweeperBoard(3, 3, 8), 0, 1, 2, 3, 5, 6, 7, 8).threeBV())
			.isEqualTo(1);
	}

	@Test
	void aFixedBoardHasExactlyItsMines() {
		assertThatIllegalArgumentException()
			.isThrownBy(() -> MinesweeperLayout.withMines(MinesweeperBoard.BEGINNER, 1, 2, 3));
		assertThatIllegalArgumentException()
			.isThrownBy(() -> MinesweeperLayout.withMines(new MinesweeperBoard(1, 3, 1), 3));
		assertThatIllegalArgumentException()
			.isThrownBy(() -> MinesweeperLayout.withMines(new MinesweeperBoard(1, 5, 2), 1, 1));
	}

	@Test
	void threeBvIsAtMostTheSafeCellsAndAtLeastOne() {
		for (MinesweeperBoard board : List.of(MinesweeperBoard.BEGINNER, MinesweeperBoard.INTERMEDIATE,
				MinesweeperBoard.EXPERT)) {
			for (long seed = 1; seed <= 50; seed++) {
				int threeBv = MinesweeperLayout.lay(board, seed, 0).threeBV();
				assertThat(threeBv).isBetween(1, board.safeCells());
			}
		}
	}

}
