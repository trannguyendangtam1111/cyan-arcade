package com.cyan.arcade.sudoku;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Scoring;
import com.cyan.arcade.sudoku.engine.SudokuGame;
import com.cyan.arcade.sudoku.engine.SudokuGame.Action;
import com.cyan.arcade.sudoku.engine.SudokuGame.MistakeRule;

/**
 * One Sudoku run as the server keeps it: the puzzle and its solution (which stay here until the
 * run is over), every action in order, who is playing and the server's own clock.
 *
 * @param ranked whether it counts: played by the solution rule with a mistake limit, tied to a
 * platform session, scored, and part of the statistics. Relaxed practice runs are not.
 * @param sessionId for a ranked run, the platform session its score is submitted with; {@code null}
 * for a relaxed run, and for one whose session was cleaned up before it was finished
 * @param mistakes how many the actions made, kept for statistics (the actions are the truth)
 * @param hints how many hints the actions took, likewise
 * @param streak for a solved daily run, the daily streak it made, worked out when it was solved
 * @param pausedAt when the current pause began, or {@code null} while the clock runs
 * @param pausedMs paused time before the current pause
 */
record SudokuRun(UUID id, Mode mode, boolean ranked, Difficulty difficulty, LocalDate puzzleDate,
		Integer puzzleNumber, long seed, String givens, String solution, List<Action> actions, Status status,
		int mistakes, int hints, int streak, UUID sessionId, Long userId, UUID playerId, Instant startedAt,
		Instant finishedAt, Instant pausedAt, long pausedMs) {

	enum Mode {

		DAILY, PRACTICE

	}

	enum Status {

		PLAYING, SOLVED, FAILED,

		/** Left for a new practice game: counts as played, never as completed, and is never scored. */
		ABANDONED;

		boolean isOver() {
			return this != PLAYING;
		}

		/** Over with a result: solved or failed. */
		boolean isFinished() {
			return this == SOLVED || this == FAILED;
		}

	}

	/** Who a run belongs to: an account, or a guest's browser. */
	record Owner(Long userId, UUID playerId) {

		Owner {
			if ((userId == null) == (playerId == null)) {
				throw new IllegalArgumentException("A run belongs to an account or to a guest");
			}
		}

	}

	SudokuRun {
		actions = List.copyOf(actions);
	}

	boolean belongsTo(Owner owner) {
		return (this.userId != null) ? this.userId.equals(owner.userId())
				: owner.userId() == null && this.playerId.equals(owner.playerId());
	}

	boolean isDaily() {
		return this.mode == Mode.DAILY;
	}

	MistakeRule rule() {
		return this.ranked ? MistakeRule.SOLUTION : MistakeRule.CONFLICT;
	}

	int mistakeLimit() {
		return this.ranked ? SudokuGame.RANKED_MISTAKE_LIMIT : 0;
	}

	/** The game as it stands, rebuilt from its actions. */
	SudokuGame game() {
		return SudokuGame.replay(Grid.parse(this.givens), Grid.parse(this.solution), rule(), mistakeLimit(),
				this.actions);
	}

	boolean isPaused() {
		return this.pausedAt != null;
	}

	/** Time played, by the server's clock, pauses left out. Stops when the run is over. */
	Duration played(Instant now) {
		Instant end = (this.finishedAt != null) ? this.finishedAt : (this.pausedAt != null) ? this.pausedAt : now;
		long millis = Duration.between(this.startedAt, end).toMillis() - this.pausedMs;
		return Duration.ofMillis(Math.max(0, millis));
	}

	/** The whole seconds the score counts. */
	int seconds(Instant now) {
		return (int) Math.min(Scoring.MAX_SECONDS, played(now).toSeconds());
	}

	/** What the run scores, once it is solved or failed. */
	Scoring.Summary summary() {
		return new Scoring.Summary(this.status == Status.SOLVED, isDaily(), this.difficulty, seconds(this.finishedAt),
				this.mistakes, this.hints, this.streak);
	}

	/** The same run after an action. */
	SudokuRun with(SudokuGame game, Status status, int streak, Instant finishedAt, Instant pausedAt, long pausedMs) {
		return new SudokuRun(this.id, this.mode, this.ranked, this.difficulty, this.puzzleDate, this.puzzleNumber,
				this.seed, this.givens, this.solution, game.actions(), status, game.mistakes(), game.hints(), streak,
				this.sessionId, this.userId, this.playerId, this.startedAt, finishedAt, pausedAt, pausedMs);
	}

	/** The same run, its clock stopped or started. */
	SudokuRun withPause(Instant pausedAt, long pausedMs) {
		return new SudokuRun(this.id, this.mode, this.ranked, this.difficulty, this.puzzleDate, this.puzzleNumber,
				this.seed, this.givens, this.solution, this.actions, this.status, this.mistakes, this.hints, this.streak,
				this.sessionId, this.userId, this.playerId, this.startedAt, this.finishedAt, pausedAt, pausedMs);
	}

	SudokuRun withSession(UUID sessionId) {
		return new SudokuRun(this.id, this.mode, this.ranked, this.difficulty, this.puzzleDate, this.puzzleNumber,
				this.seed, this.givens, this.solution, this.actions, this.status, this.mistakes, this.hints, this.streak,
				sessionId, this.userId, this.playerId, this.startedAt, this.finishedAt, this.pausedAt, this.pausedMs);
	}

}
