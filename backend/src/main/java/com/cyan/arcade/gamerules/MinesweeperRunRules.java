package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.score.ModeSpec;
import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Minesweeper ({@code frontend/src/games/minesweeper/engine}). Classic is played on one board:
 * {@link MinesweeperBoard#BEGINNER}, 9 × 9 with 10 mines, so 71 safe cells. The first reveal is never
 * a mine. Every reveal that does anything uncovers at least one safe cell, except the one that hits a
 * mine and ends the game. Flags score nothing and are at most one per mine. The score is
 *
 * <pre>
 * 10 × safe cells revealed, plus, for a cleared board, 500 + (600 − seconds, at least 0)
 * </pre>
 *
 * so a run's details fix its score exactly. The seconds are the player's clock: for a cleared
 * board they earn points, so they must agree with the time the server measured (give or take the
 * requests travelling). Reveals are clicks: at most {@value #CLICKS_PER_SECOND} a second.
 *
 * <p><b>Beginner</b>, <b>Intermediate</b> and <b>Expert</b> are races to clear a board of their own
 * ({@link MinesweeperBoard}), ranked by game time, lowest first. The clock starts with the first
 * reveal and never pauses; the score is the game time in milliseconds ({@code gameMs}), at most
 * {@value #TIMED_LIMIT_MS}. Only a cleared board is submitted and accepted, so every accepted run
 * completed the mode. A run also reports the seed its game was created with and the cell of its first
 * reveal, from which these rules lay the same mines again ({@link MinesweeperLayout}) and count the
 * board's 3BV: the fewest reveals that clear it, so a win took at least that many moves.
 *
 * <p>That is all the replay proves: that the board exists and could be cleared in the moves
 * reported. No reveal is replayed, so it does not prove the player solved it; and the seed is the
 * client's choice.
 */
@Component
class MinesweeperRunRules implements RunRules {

	/** The board Classic is played on. */
	static final MinesweeperBoard CLASSIC_BOARD = MinesweeperBoard.BEGINNER;

	static final int ROWS = CLASSIC_BOARD.rows();

	static final int COLUMNS = CLASSIC_BOARD.columns();

	static final int MINES = CLASSIC_BOARD.mines();

	static final int SAFE_CELLS = CLASSIC_BOARD.safeCells();

	static final int POINTS_PER_CELL = 10;

	static final int WIN_BONUS = 500;

	/** A cleared board earns a point for every second under this. */
	static final int TIME_BONUS_SECONDS = 600;

	static final int CLICKS_PER_SECOND = 10;

	/** The best score there can be: every cell, the win, and the whole time bonus. */
	static final int MAX_SCORE = SAFE_CELLS * POINTS_PER_CELL + WIN_BONUS + TIME_BONUS_SECONDS;

	/** How far the player's clock may lag the server's, for the requests that start and end the run. */
	private static final long CLOCK_TOLERANCE_SECONDS = LATENCY_ALLOWANCE.toSeconds() + 1;

	/** The longest a timed game may take: the 999 seconds of the classic counter, in milliseconds. */
	static final int TIMED_LIMIT_MS = 999_999;

	static final String BEGINNER = "beginner";

	static final String INTERMEDIATE = "intermediate";

	static final String EXPERT = "expert";

	/** Ranked by game time, lowest first; no submitted time may exceed the limit. */
	static final ModeSpec BEGINNER_MODE = timedMode(BEGINNER, "Beginner");

	static final ModeSpec INTERMEDIATE_MODE = timedMode(INTERMEDIATE, "Intermediate");

	static final ModeSpec EXPERT_MODE = timedMode(EXPERT, "Expert");

	/** What a timed run reports: Classic's numbers with the game time for the seconds, and the seed and first cell. */
	static final Set<String> TIMED_DETAILS = Set.of("rows", "columns", "mines", "seed", "firstCell", "revealedCells",
			"flagsUsed", "won", "moves", "gameMs");

	/** The board each mode is played on. */
	private static final Map<String, MinesweeperBoard> BOARDS_BY_MODE = Map.of(ModeSpec.CLASSIC.id(), CLASSIC_BOARD,
			BEGINNER, MinesweeperBoard.BEGINNER, INTERMEDIATE, MinesweeperBoard.INTERMEDIATE, EXPERT,
			MinesweeperBoard.EXPERT);

	private static ModeSpec timedMode(String id, String name) {
		return new ModeSpec(id, name, true, ModeSpec.Order.ASC, ModeSpec.Unit.MILLISECONDS, TIMED_LIMIT_MS);
	}

	/** Whether the mode is one of the timed races (anything but Classic that has a board). */
	static boolean isTimed(String mode) {
		return !ModeSpec.CLASSIC.id().equals(mode) && BOARDS_BY_MODE.containsKey(mode);
	}

	@Override
	public String gameSlug() {
		return "minesweeper";
	}

	@Override
	public List<ModeSpec> modes() {
		return List.of(ModeSpec.CLASSIC, BEGINNER_MODE, INTERMEDIATE_MODE, EXPERT_MODE);
	}

	@Override
	public Set<String> details() {
		return Set.of("rows", "columns", "mines", "revealedCells", "flagsUsed", "won", "moves", "seconds");
	}

	@Override
	public Set<String> details(String mode) {
		return isTimed(mode) ? TIMED_DETAILS : details();
	}

	/** The board a mode is played on, or empty for a mode these rules have no board for. */
	static Optional<MinesweeperBoard> boardFor(String mode) {
		return Optional.ofNullable(BOARDS_BY_MODE.get(mode));
	}

	/** What a run with these numbers scores, by the game's own rule. */
	static int scoreFor(int revealedCells, boolean won, int seconds) {
		int score = revealedCells * POINTS_PER_CELL;
		return won ? score + WIN_BONUS + Math.max(0, TIME_BONUS_SECONDS - seconds) : score;
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		MinesweeperBoard board = boardFor(ModeSpec.CLASSIC.id()).orElseThrow();
		if (!board.isNamedBy(details)) {
			return Optional.of("not the game's board");
		}
		Optional<String> result = resultProblemWith(board, details);
		if (result.isPresent()) {
			return result;
		}
		int revealed = details.get("revealedCells");
		int moves = details.get("moves");
		int seconds = details.get("seconds");
		boolean won = details.get("won") == 1;
		if (score != scoreFor(revealed, won, seconds)) {
			return Optional.of("details do not match the score");
		}
		long serverSeconds = elapsed.toSeconds();
		if (seconds > serverSeconds + CLOCK_TOLERANCE_SECONDS
				|| (won && seconds < serverSeconds - CLOCK_TOLERANCE_SECONDS)) {
			return Optional.of("time does not match the server's");
		}
		if (moves > RunRules.mostActionsIn(elapsed, 1000.0 / CLICKS_PER_SECOND)) {
			return Optional.of("more clicks than the time allows");
		}
		return Optional.empty();
	}

	/** Classic by Classic's rules, each timed mode by the race rules on its own board; any other mode is refused. */
	@Override
	public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (isTimed(mode)) {
			return timedProblemWith(BOARDS_BY_MODE.get(mode), score, details, elapsed);
		}
		return RunRules.super.problemWith(mode, sessionId, score, details, elapsed);
	}

	/** A timed run is accepted only as a cleared board, so every accepted one completed its mode. */
	@Override
	public boolean completes(String mode, Map<String, Integer> details) {
		if (isTimed(mode)) {
			return details.get("won") == 1;
		}
		return RunRules.super.completes(mode, details);
	}

	/**
	 * A cleared board in a timed mode: the mode's board, every safe cell uncovered, a score that is the
	 * game time, a game time the server's clock agrees with, and between the board's 3BV and its safe
	 * cells in moves, at no more than {@value #CLICKS_PER_SECOND} a second.
	 */
	static Optional<String> timedProblemWith(MinesweeperBoard board, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (!board.isNamedBy(details)) {
			return Optional.of("not the mode's board");
		}
		int gameMs = details.get("gameMs");
		if (gameMs <= 0 || gameMs > TIMED_LIMIT_MS) {
			return Optional.of("game time outside the mode's limit");
		}
		// What is ranked is the game time, exactly as the run reports it.
		if (score != gameMs) {
			return Optional.of("score is not the game time");
		}
		// Only a cleared board is a finished race: a loss or a timeout is never submitted.
		if (details.get("won") != 1 || details.get("revealedCells") != board.safeCells()) {
			return Optional.of("not a cleared board");
		}
		Optional<String> result = resultProblemWith(board, details);
		if (result.isPresent()) {
			return result;
		}
		int firstCell = details.get("firstCell");
		if (firstCell < 0 || firstCell >= board.cells()) {
			return Optional.of("first cell is not on the board");
		}
		// The clock never pauses: game time and the session's time differ only by the requests travelling.
		Duration game = Duration.ofMillis(gameMs);
		if (game.compareTo(elapsed.plus(LATENCY_ALLOWANCE)) > 0
				|| game.compareTo(elapsed.minus(LATENCY_ALLOWANCE)) < 0) {
			return Optional.of("time does not match the server's");
		}
		int moves = details.get("moves");
		if (moves > RunRules.mostActionsIn(elapsed, 1000.0 / CLICKS_PER_SECOND)
				|| moves > RunRules.mostActionsIn(game, 1000.0 / CLICKS_PER_SECOND)) {
			return Optional.of("more clicks than the time allows");
		}
		// Every reveal that counts uncovers a safe cell, and no board clears in fewer than its 3BV.
		int threeBV = MinesweeperLayout.lay(board, details.get("seed"), firstCell).threeBV();
		if (moves < threeBV) {
			return Optional.of("fewer moves than the board's 3BV");
		}
		if (moves > board.safeCells()) {
			return Optional.of("more moves than safe cells");
		}
		return Optional.empty();
	}

	/**
	 * Whether a game on this board can have ended with these cells revealed, flags placed and moves
	 * made, whatever the mode: a win uncovers every safe cell and a loss fewer, flags are at most one
	 * per mine and only on covered cells, and every reveal uncovers a safe cell except a losing one
	 * (the first is always safe).
	 * @param details the run's {@code revealedCells}, {@code flagsUsed}, {@code won} and {@code moves}
	 */
	static Optional<String> resultProblemWith(MinesweeperBoard board, Map<String, Integer> details) {
		int revealed = details.get("revealedCells");
		int flags = details.get("flagsUsed");
		int wonFlag = details.get("won");
		int moves = details.get("moves");
		boolean won = wonFlag == 1;
		if (wonFlag > 1 || revealed > board.safeCells() || won != (revealed == board.safeCells())
				|| flags > board.mines() || flags > board.cells() - revealed) {
			return Optional.of("not a Minesweeper result");
		}
		if (won ? moves < 1 || moves > revealed : moves < 2 || moves - 1 > revealed) {
			return Optional.of("moves do not match the cells revealed");
		}
		return Optional.empty();
	}

}
