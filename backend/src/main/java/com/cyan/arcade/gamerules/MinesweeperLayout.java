package com.cyan.arcade.gamerules;

import java.util.Arrays;
import java.util.stream.IntStream;

/**
 * Where a board's mines are, laid exactly as the engine lays them ({@code layMines} in
 * {@code frontend/src/games/minesweeper/engine/minesweeperEngine.ts}): from the seed the game was
 * created with and the cell of its first reveal. The same seed and first cell give the same mines on
 * both sides, which {@code minesweeperVectors.json} pins for the engine and for these rules alike.
 *
 * <p>The first cell and its neighbours are kept clear, so the game opens on an empty area; on a board
 * too small for that, only the first cell is. The mines are a seeded partial shuffle of the cells
 * allowed, drawn with the engine's generator ({@link SeededRandom}).
 *
 * <p>Immutable.
 */
final class MinesweeperLayout {

	private final MinesweeperBoard board;

	private final boolean[] mines;

	private MinesweeperLayout(MinesweeperBoard board, boolean[] mines) {
		this.board = board;
		this.mines = mines;
	}

	/**
	 * Lays the board's mines as the engine does for a game created with this seed and first revealed
	 * at this cell.
	 * @param seed the game's seed; only its low 32 bits count, as in the engine, so a seed sent as a
	 * signed 32-bit number lays the same mines as the unsigned one it came from
	 * @param firstCell the cell of the first reveal
	 */
	static MinesweeperLayout lay(MinesweeperBoard board, long seed, int firstCell) {
		int cells = board.cells();
		if (firstCell < 0 || firstCell >= cells) {
			throw new IllegalArgumentException("Cell " + firstCell + " is not on a " + board + " board");
		}
		boolean[] keepClear = new boolean[cells];
		keepClear[firstCell] = true;
		int[] around = board.neighbours(firstCell);
		for (int neighbour : around) {
			keepClear[neighbour] = true;
		}
		boolean roomAround = cells - (around.length + 1) >= board.mines();
		int[] allowed = IntStream.range(0, cells)
			.filter((index) -> roomAround ? !keepClear[index] : index != firstCell)
			.toArray();
		SeededRandom random = new SeededRandom(seed);
		for (int pick = 0; pick < board.mines(); pick++) {
			int chosen = pick + random.nextInt(allowed.length - pick);
			int swapped = allowed[pick];
			allowed[pick] = allowed[chosen];
			allowed[chosen] = swapped;
		}
		boolean[] mines = new boolean[cells];
		for (int pick = 0; pick < board.mines(); pick++) {
			mines[allowed[pick]] = true;
		}
		return new MinesweeperLayout(board, mines);
	}

	/** A board with its mines on the given cells, for fixed boards. */
	static MinesweeperLayout withMines(MinesweeperBoard board, int... mineCells) {
		boolean[] mines = new boolean[board.cells()];
		for (int cell : mineCells) {
			if (cell < 0 || cell >= mines.length || mines[cell]) {
				throw new IllegalArgumentException("Mine cell " + cell + " is off the board or given twice");
			}
			mines[cell] = true;
		}
		if (mineCells.length != board.mines()) {
			throw new IllegalArgumentException("A " + board + " board has " + board.mines() + " mines, not "
					+ mineCells.length);
		}
		return new MinesweeperLayout(board, mines);
	}

	MinesweeperBoard board() {
		return this.board;
	}

	boolean isMine(int cell) {
		return this.mines[cell];
	}

	/** The mines' cells, lowest first. */
	int[] mineCells() {
		return IntStream.range(0, this.mines.length).filter((cell) -> this.mines[cell]).toArray();
	}

	/** How many of the cell's neighbours are mines. */
	int adjacent(int cell) {
		return (int) Arrays.stream(this.board.neighbours(cell)).filter((other) -> this.mines[other]).count();
	}

	/**
	 * The board's 3BV: the fewest reveals that clear it without chording, as the engine's
	 * {@code threeBV} counts them. Each opening (a connected area of cells with no mine around them,
	 * with the numbers on its edge) takes one reveal, and every numbered cell on no opening's edge one
	 * more. A cleared board took at least this many reveals.
	 */
	int threeBV() {
		int cells = this.board.cells();
		int[] adjacent = IntStream.range(0, cells).map(this::adjacent).toArray();
		boolean[] counted = new boolean[cells];
		int clicks = 0;
		int[] stack = new int[cells];
		for (int start = 0; start < cells; start++) {
			if (this.mines[start] || adjacent[start] != 0 || counted[start]) {
				continue;
			}
			clicks++;
			counted[start] = true;
			int size = 0;
			stack[size++] = start;
			while (size > 0) {
				int next = stack[--size];
				for (int other : this.board.neighbours(next)) {
					if (counted[other] || this.mines[other]) {
						continue;
					}
					counted[other] = true;
					if (adjacent[other] == 0) {
						stack[size++] = other;
					}
				}
			}
		}
		for (int cell = 0; cell < cells; cell++) {
			if (!this.mines[cell] && !counted[cell]) {
				clicks++;
			}
		}
		return clicks;
	}

	/**
	 * The engine's seeded generator, mulberry32 ({@code frontend/src/games/shared/random.ts}), step for
	 * step: JavaScript's 32-bit integer operations ({@code | 0}, {@code Math.imul}, {@code >>>}) are
	 * Java's {@code int} arithmetic, which wraps the same way.
	 */
	static final class SeededRandom {

		private int seed;

		SeededRandom(long seed) {
			this.seed = (int) seed;
		}

		/** The next number, uniform in [0, 2^32): the engine's {@code nextRandom} value times 2^32. */
		long nextBits() {
			this.seed += 0x6D2B79F5;
			int t = this.seed;
			t = (t ^ (t >>> 15)) * (t | 1);
			t ^= t + (t ^ (t >>> 7)) * (t | 61);
			return Integer.toUnsignedLong(t ^ (t >>> 14));
		}

		/** A uniform integer in [0, bound), as the engine's {@code randomInt}. */
		int nextInt(int bound) {
			return (int) Math.floor(nextBits() / 4294967296.0 * bound);
		}

		/** The seed the next number is drawn from, as the engine's state keeps it. */
		int seed() {
			return this.seed;
		}

	}

}
