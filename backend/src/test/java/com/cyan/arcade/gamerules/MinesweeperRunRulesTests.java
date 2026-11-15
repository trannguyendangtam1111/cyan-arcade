package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Minesweeper's run rules, without the platform: Classic exactly as before the boards became
 * configurable, and the timed Beginner, Intermediate and Expert races, each on its own board.
 */
class MinesweeperRunRulesTests {

	private final MinesweeperRunRules rules = new MinesweeperRunRules();

	/** A Classic run's details on the given board. */
	static Map<String, Integer> details(MinesweeperBoard board, int revealed, int flags, boolean won, int moves,
			int seconds) {
		Map<String, Integer> details = new HashMap<>();
		details.put("rows", board.rows());
		details.put("columns", board.columns());
		details.put("mines", board.mines());
		details.put("revealedCells", revealed);
		details.put("flagsUsed", flags);
		details.put("won", won ? 1 : 0);
		details.put("moves", moves);
		details.put("seconds", seconds);
		return details;
	}

	private static Map<String, Integer> with(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	private Optional<String> judge(int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(ModeSpec.CLASSIC.id(), UUID.randomUUID(), score, details, elapsed);
	}

	// --- Classic, unchanged --------------------------------------------------------------------------

	@Test
	void classicIsStillPlayedOnItsNineByNineBoard() {
		assertThat(this.rules.modes()).first().isEqualTo(ModeSpec.CLASSIC);
		assertThat(MinesweeperRunRules.CLASSIC_BOARD).isEqualTo(MinesweeperBoard.BEGINNER);
		assertThat(MinesweeperRunRules.ROWS).isEqualTo(9);
		assertThat(MinesweeperRunRules.COLUMNS).isEqualTo(9);
		assertThat(MinesweeperRunRules.MINES).isEqualTo(10);
		assertThat(MinesweeperRunRules.SAFE_CELLS).isEqualTo(71);
		assertThat(MinesweeperRunRules.MAX_SCORE).isEqualTo(1810);
		assertThat(this.rules.details()).containsExactlyInAnyOrder("rows", "columns", "mines", "revealedCells",
				"flagsUsed", "won", "moves", "seconds");
		assertThat(this.rules.details(ModeSpec.CLASSIC.id())).isEqualTo(this.rules.details());
	}

	@Test
	void anHonestClassicWinAndLossAreAccepted() {
		// A clear in 90 s: 710 + 500 + 510.
		Map<String, Integer> win = details(MinesweeperBoard.BEGINNER, 71, 4, true, 20, 90);
		assertThat(judge(1720, win, Duration.ofSeconds(91))).isEmpty();
		// A loss on the third reveal after uncovering 15 cells.
		Map<String, Integer> loss = details(MinesweeperBoard.BEGINNER, 15, 0, false, 3, 12);
		assertThat(judge(150, loss, Duration.ofSeconds(12))).isEmpty();
	}

	@Test
	void classicRefusesTheLargerBoardsAsBefore() {
		for (MinesweeperBoard board : new MinesweeperBoard[] { MinesweeperBoard.INTERMEDIATE, MinesweeperBoard.EXPERT }) {
			Map<String, Integer> win = details(board, board.safeCells(), 0, true, 60, 200);
			int score = MinesweeperRunRules.scoreFor(board.safeCells(), true, 200);
			assertThat(judge(score, win, Duration.ofSeconds(200))).contains("not the game's board");
		}
		Map<String, Integer> sixteenMines = with(details(MinesweeperBoard.BEGINNER, 65, 0, true, 10, 30), "mines", 16);
		assertThat(judge(1720, sixteenMines, Duration.ofSeconds(30))).contains("not the game's board");
	}

	@Test
	void classicRefusesWhatItRefusedBefore() {
		Map<String, Integer> win = details(MinesweeperBoard.BEGINNER, 71, 0, true, 20, 90);
		Duration ninety = Duration.ofSeconds(90);
		assertThat(judge(1720, with(win, "revealedCells", 72), ninety)).contains("not a Minesweeper result");
		assertThat(judge(1720, with(win, "won", 2), ninety)).contains("not a Minesweeper result");
		assertThat(judge(1720, with(win, "flagsUsed", 11), ninety)).contains("not a Minesweeper result");
		assertThat(judge(1710, with(win, "won", 0), ninety)).contains("not a Minesweeper result");
		assertThat(judge(1720, with(win, "moves", 0), ninety)).contains("moves do not match the cells revealed");
		assertThat(judge(1720, with(win, "moves", 72), ninety)).contains("moves do not match the cells revealed");
		Map<String, Integer> loss = details(MinesweeperBoard.BEGINNER, 15, 0, false, 1, 12);
		assertThat(judge(150, loss, ninety)).contains("moves do not match the cells revealed");
		assertThat(judge(1721, win, ninety)).contains("details do not match the score");
		assertThat(judge(1720, win, Duration.ofSeconds(86))).contains("time does not match the server's");
		assertThat(judge(1720, win, Duration.ofSeconds(94))).contains("time does not match the server's");
		Map<String, Integer> fast = details(MinesweeperBoard.BEGINNER, 71, 0, true, 40, 1);
		assertThat(judge(MinesweeperRunRules.scoreFor(71, true, 1), fast, Duration.ofSeconds(1)))
			.contains("more clicks than the time allows");
	}

	// --- Timed modes --------------------------------------------------------------------------------

	private static final long SEED = 20_261_106L;

	/** A cleared board in a timed mode, laid from {@link #SEED} and first revealed at the given cell. */
	static Map<String, Integer> timedWin(MinesweeperBoard board, int firstCell, int moves, int flags, int gameMs) {
		Map<String, Integer> details = new HashMap<>();
		details.put("rows", board.rows());
		details.put("columns", board.columns());
		details.put("mines", board.mines());
		details.put("seed", (int) SEED);
		details.put("firstCell", firstCell);
		details.put("revealedCells", board.safeCells());
		details.put("flagsUsed", flags);
		details.put("won", 1);
		details.put("moves", moves);
		details.put("gameMs", gameMs);
		return details;
	}

	/** The board's 3BV, laid from {@link #SEED} around the first cell: the fewest moves that clear it. */
	static int threeBV(MinesweeperBoard board, int firstCell) {
		return MinesweeperLayout.lay(board, SEED, firstCell).threeBV();
	}

	private Optional<String> judge(String mode, int score, Map<String, Integer> details, Duration elapsed) {
		return this.rules.problemWith(mode, UUID.randomUUID(), score, details, elapsed);
	}

	@Test
	void classicAndThreeTimedModesAreDeclaredEachRankedFastestFirst() {
		assertThat(this.rules.modes()).containsExactly(ModeSpec.CLASSIC, MinesweeperRunRules.BEGINNER_MODE,
				MinesweeperRunRules.INTERMEDIATE_MODE, MinesweeperRunRules.EXPERT_MODE);
		for (ModeSpec mode : this.rules.modes().subList(1, 4)) {
			assertThat(mode.ranked()).isTrue();
			assertThat(mode.order()).isEqualTo(ModeSpec.Order.ASC);
			assertThat(mode.unit()).isEqualTo(ModeSpec.Unit.MILLISECONDS);
			assertThat(mode.maxScore()).isEqualTo(999_999);
			assertThat(this.rules.details(mode.id())).containsExactlyInAnyOrder("rows", "columns", "mines", "seed",
					"firstCell", "revealedCells", "flagsUsed", "won", "moves", "gameMs");
		}
		assertThat(this.rules.modes().stream().map(ModeSpec::name)).containsExactly("Classic", "Beginner",
				"Intermediate", "Expert");
	}

	@Test
	void eachModeIsPlayedOnItsOwnBoard() {
		assertThat(MinesweeperRunRules.boardFor(ModeSpec.CLASSIC.id())).contains(new MinesweeperBoard(9, 9, 10));
		assertThat(MinesweeperRunRules.boardFor("beginner")).contains(new MinesweeperBoard(9, 9, 10));
		assertThat(MinesweeperRunRules.boardFor("intermediate")).contains(new MinesweeperBoard(16, 16, 40));
		assertThat(MinesweeperRunRules.boardFor("expert")).contains(new MinesweeperBoard(16, 30, 99));
	}

	@Test
	void theDailyBoardAndUnknownModesAreRefused() {
		for (String mode : new String[] { "daily", "custom" }) {
			assertThat(MinesweeperRunRules.boardFor(mode)).isEmpty();
			Map<String, Integer> win = details(MinesweeperBoard.BEGINNER, 71, 0, true, 20, 90);
			assertThat(this.rules.problemWith(mode, UUID.randomUUID(), 1720, win, Duration.ofSeconds(90)))
				.hasValueSatisfying((reason) -> assertThat(reason).startsWith(RunRules.NO_RULES_FOR_MODE));
		}
	}

	@Test
	void anHonestClearIsAcceptedOnEveryTimedBoardAndCompletesTheMode() {
		Map<String, MinesweeperBoard> boards = Map.of("beginner", MinesweeperBoard.BEGINNER, "intermediate",
				MinesweeperBoard.INTERMEDIATE, "expert", MinesweeperBoard.EXPERT);
		boards.forEach((mode, board) -> {
			int first = board.cells() / 2;
			int fewest = threeBV(board, first);
			assertThat(fewest).as(mode).isBetween(1, board.safeCells());
			// In exactly the 3BV, with every mine flagged, and in every safe cell clicked one by one.
			Map<String, Integer> win = timedWin(board, first, fewest, board.mines(), 90_000);
			assertThat(judge(mode, 90_000, win, Duration.ofSeconds(90))).as(mode).isEmpty();
			assertThat(judge(mode, 90_000, with(win, "moves", board.safeCells()), Duration.ofSeconds(91))).as(mode)
				.isEmpty();
			assertThat(this.rules.completes(mode, win)).as(mode).isTrue();
		});
	}

	@Test
	void theGameTimeMustAgreeWithTheServersClockWithinTwoSeconds() {
		MinesweeperBoard board = MinesweeperBoard.INTERMEDIATE;
		Map<String, Integer> win = timedWin(board, 0, threeBV(board, 0), 0, 60_000);
		assertThat(judge("intermediate", 60_000, win, Duration.ofMillis(58_000))).isEmpty();
		assertThat(judge("intermediate", 60_000, win, Duration.ofMillis(62_000))).isEmpty();
		assertThat(judge("intermediate", 60_000, win, Duration.ofMillis(57_999)))
			.contains("time does not match the server's");
		assertThat(judge("intermediate", 60_000, win, Duration.ofMillis(62_001)))
			.contains("time does not match the server's");
	}

	@Test
	void impossibleTimedRunsAreRefused() {
		MinesweeperBoard board = MinesweeperBoard.BEGINNER;
		int fewest = threeBV(board, 40);
		Map<String, Integer> win = timedWin(board, 40, fewest, 3, 30_000);
		Duration thirty = Duration.ofSeconds(30);
		assertThat(judge("beginner", 30_000, win, thirty)).isEmpty();

		// The mode's board, and no other.
		assertThat(judge("beginner", 30_000, with(win, "mines", 11), thirty)).contains("not the mode's board");
		assertThat(judge("expert", 30_000, win, thirty)).contains("not the mode's board");
		assertThat(judge("beginner", 30_000, with(win, "columns", 16), thirty)).contains("not the mode's board");
		// The game time: above 0, at most 999 999 ms, and the score itself.
		assertThat(judge("beginner", 0, with(win, "gameMs", 0), Duration.ZERO))
			.contains("game time outside the mode's limit");
		assertThat(judge("beginner", 1_000_000, with(win, "gameMs", 1_000_000), Duration.ofSeconds(1000)))
			.contains("game time outside the mode's limit");
		assertThat(judge("beginner", 29_999, win, thirty)).contains("score is not the game time");
		assertThat(judge("beginner", 1220, win, thirty)).contains("score is not the game time");
		// A loss, or a "win" with cells left, is no finished race.
		Map<String, Integer> loss = with(with(win, "won", 0), "revealedCells", 40);
		assertThat(judge("beginner", 30_000, loss, thirty)).contains("not a cleared board");
		assertThat(judge("beginner", 30_000, with(win, "revealedCells", 70), thirty)).contains("not a cleared board");
		assertThat(judge("beginner", 30_000, with(win, "won", 2), thirty)).contains("not a cleared board");
		// Flags: at most one a mine.
		assertThat(judge("beginner", 30_000, with(win, "flagsUsed", 11), thirty)).contains("not a Minesweeper result");
		// The first cell is on the board.
		assertThat(judge("beginner", 30_000, with(win, "firstCell", 81), thirty))
			.contains("first cell is not on the board");
		// Moves: no fewer than the board's 3BV, no more than its safe cells, at most ten a second.
		assertThat(judge("beginner", 30_000, with(win, "moves", fewest - 1), thirty))
			.contains("fewer moves than the board's 3BV");
		assertThat(judge("beginner", 30_000, with(win, "moves", 72), thirty)).isPresent();
		Map<String, Integer> fast = with(with(win, "moves", 40), "gameMs", 1_000);
		assertThat(judge("beginner", 1_000, fast, Duration.ofSeconds(1))).contains("more clicks than the time allows");
	}

	@Test
	void theThreeBVIsTheBoardTheSeedAndFirstCellLay() {
		MinesweeperBoard board = MinesweeperBoard.EXPERT;
		int fewest = threeBV(board, 0);
		Map<String, Integer> win = timedWin(board, 0, fewest, 0, 120_000);
		assertThat(judge("expert", 120_000, win, Duration.ofSeconds(120))).isEmpty();
		// Another seed lays another board, with another 3BV: what was enough for one is judged by the other's.
		int other = MinesweeperLayout.lay(board, SEED + 1, 0).threeBV();
		Map<String, Integer> reseeded = with(win, "seed", (int) SEED + 1);
		if (other > fewest) {
			assertThat(judge("expert", 120_000, reseeded, Duration.ofSeconds(120)))
				.contains("fewer moves than the board's 3BV");
		}
		else {
			assertThat(judge("expert", 120_000, with(reseeded, "moves", other - 1), Duration.ofSeconds(120)))
				.contains("fewer moves than the board's 3BV");
		}
	}

	@Test
	void classicIsNotJudgedByTheTimedRulesNorTheTimedModesByClassics() {
		// A Classic win's details are not a timed run's: no seed, first cell or game time.
		Map<String, Integer> classicWin = details(MinesweeperBoard.BEGINNER, 71, 4, true, 20, 90);
		assertThat(judge(ModeSpec.CLASSIC.id(), 1720, classicWin, Duration.ofSeconds(91))).isEmpty();
		assertThat(this.rules.completes(ModeSpec.CLASSIC.id(), classicWin)).isTrue();
		assertThat(MinesweeperRunRules.isTimed(ModeSpec.CLASSIC.id())).isFalse();
		assertThat(MinesweeperRunRules.isTimed("beginner")).isTrue();
	}

	@Test
	void aResultIsJudgedAgainstItsOwnBoard() {
		MinesweeperBoard expert = MinesweeperBoard.EXPERT;
		Map<String, Integer> win = details(expert, 381, 99, true, 150, 120);
		assertThat(MinesweeperRunRules.resultProblemWith(expert, win)).isEmpty();
		assertThat(MinesweeperRunRules.resultProblemWith(expert, with(win, "revealedCells", 382)))
			.contains("not a Minesweeper result");
		assertThat(MinesweeperRunRules.resultProblemWith(expert, with(win, "flagsUsed", 100)))
			.contains("not a Minesweeper result");
		assertThat(MinesweeperRunRules.resultProblemWith(expert, with(win, "moves", 382)))
			.contains("moves do not match the cells revealed");
		// A loss on Intermediate: the board's own safe cells and mines bound it.
		MinesweeperBoard intermediate = MinesweeperBoard.INTERMEDIATE;
		Map<String, Integer> loss = details(intermediate, 215, 40, false, 50, 100);
		assertThat(MinesweeperRunRules.resultProblemWith(intermediate, loss)).isEmpty();
		assertThat(MinesweeperRunRules.resultProblemWith(intermediate, with(loss, "revealedCells", 216)))
			.contains("not a Minesweeper result");
		// The same win is no result on a smaller board.
		assertThat(MinesweeperRunRules.resultProblemWith(MinesweeperBoard.BEGINNER, win))
			.contains("not a Minesweeper result");
	}

}
