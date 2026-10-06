package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Minesweeper ({@code frontend/src/games/minesweeper/engine}), on its one board: 9 × 9 with 10
 * mines, so 71 safe cells. The first reveal is never a mine. Every reveal that does anything
 * uncovers at least one safe cell, except the one that hits a mine and ends the game. Flags score
 * nothing and are at most one per mine. The score is
 *
 * <pre>
 * 10 × safe cells revealed, plus, for a cleared board, 500 + (600 − seconds, at least 0)
 * </pre>
 *
 * so a run's details fix its score exactly. The seconds are the player's clock: for a cleared
 * board they earn points, so they must agree with the time the server measured (give or take the
 * requests travelling). Reveals are clicks: at most {@value #CLICKS_PER_SECOND} a second.
 */
@Component
class MinesweeperRunRules implements RunRules {

	static final int ROWS = 9;

	static final int COLUMNS = 9;

	static final int MINES = 10;

	static final int SAFE_CELLS = ROWS * COLUMNS - MINES;

	static final int POINTS_PER_CELL = 10;

	static final int WIN_BONUS = 500;

	/** A cleared board earns a point for every second under this. */
	static final int TIME_BONUS_SECONDS = 600;

	static final int CLICKS_PER_SECOND = 10;

	/** The best score there can be: every cell, the win, and the whole time bonus. */
	static final int MAX_SCORE = SAFE_CELLS * POINTS_PER_CELL + WIN_BONUS + TIME_BONUS_SECONDS;

	/** How far the player's clock may lag the server's, for the requests that start and end the run. */
	private static final long CLOCK_TOLERANCE_SECONDS = LATENCY_ALLOWANCE.toSeconds() + 1;

	@Override
	public String gameSlug() {
		return "minesweeper";
	}

	@Override
	public Set<String> details() {
		return Set.of("rows", "columns", "mines", "revealedCells", "flagsUsed", "won", "moves", "seconds");
	}

	/** What a run with these numbers scores, by the game's own rule. */
	static int scoreFor(int revealedCells, boolean won, int seconds) {
		int score = revealedCells * POINTS_PER_CELL;
		return won ? score + WIN_BONUS + Math.max(0, TIME_BONUS_SECONDS - seconds) : score;
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		if (details.get("rows") != ROWS || details.get("columns") != COLUMNS || details.get("mines") != MINES) {
			return Optional.of("not the game's board");
		}
		int revealed = details.get("revealedCells");
		int flags = details.get("flagsUsed");
		int wonFlag = details.get("won");
		int moves = details.get("moves");
		int seconds = details.get("seconds");
		boolean won = wonFlag == 1;
		if (wonFlag > 1 || revealed > SAFE_CELLS || won != (revealed == SAFE_CELLS) || flags > MINES
				|| flags > ROWS * COLUMNS - revealed) {
			return Optional.of("not a Minesweeper result");
		}
		// Every reveal uncovers a safe cell, except a losing one; the first is always safe.
		if (won ? moves < 1 || moves > revealed : moves < 2 || moves - 1 > revealed) {
			return Optional.of("moves do not match the cells revealed");
		}
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

}
