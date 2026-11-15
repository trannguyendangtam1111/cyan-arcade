package com.cyan.arcade.minesweeper.daily;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One account's attempt at one day's board ({@code minesweeper_daily_attempts}), as the server keeps
 * it. Only the server changes it, one action at a time under a row lock.
 *
 * @param startCell the day's opening cell, uncovered (with its flood) when the attempt was created
 * @param cells the board as the player sees it, one character per cell: {@code H} covered, {@code F}
 * flagged, {@code 0}–{@code 8} uncovered with that many mines around, {@code X} the mine that went off
 * @param moves the player's reveals that uncovered something; the opening is not one
 * @param revealedCells safe cells uncovered, the opening's included
 * @param finishedAt when it ended; {@code null} while it is being played
 * @param elapsedMs the server's time from {@code startedAt} to {@code finishedAt}, for a won or lost
 * attempt; {@code null} otherwise
 * @param reward what a won attempt was paid, in the transaction that won it; {@code null} for any other
 */
record DailyAttempt(UUID id, LocalDate boardDate, long userId, Status status, int startCell, String cells,
		int moves, int revealedCells, int flags, Instant startedAt, Instant finishedAt, Integer elapsedMs,
		Reward reward) {

	/** XP and coins paid for a win; the coins can be 0 when the day's paid games were used up. */
	record Reward(int xp, int coins) {
	}

	enum Status {

		PLAYING, WON, LOST,
		/** Not finished within the time limit: over, and not ranked. */
		EXPIRED

	}

	/**
	 * A new attempt at a day's board, created now, with the day's opening already uncovered: the same
	 * cells for everyone that day. The clock starts at the same moment.
	 */
	static DailyAttempt start(LocalDate boardDate, long userId, Instant now, DailyLayout layout, int startCell) {
		char[] covered = String.valueOf(DailyPlay.HIDDEN).repeat(layout.board().cells()).toCharArray();
		DailyPlay.Move opening = DailyPlay.reveal(layout, covered, 0, 0, startCell);
		if (opening.result() != DailyPlay.Result.PLAYING) {
			throw new IllegalStateException("A day's opening must leave the board to play");
		}
		return new DailyAttempt(UUID.randomUUID(), boardDate, userId, Status.PLAYING, startCell,
				new String(opening.cells()), 0, opening.revealedCells(), 0, now, null, null, null);
	}

	/** The moment it runs out of time. */
	Instant deadline() {
		return this.startedAt.plus(DailyBoardSchedule.TIME_LIMIT);
	}

	/**
	 * The attempt as it stands at that moment: one still being played past its deadline has expired,
	 * at the deadline, though that may not have been saved yet.
	 */
	DailyAttempt at(Instant now) {
		if (this.status != Status.PLAYING || now.isBefore(deadline())) {
			return this;
		}
		return new DailyAttempt(this.id, this.boardDate, this.userId, Status.EXPIRED, this.startCell, this.cells,
				this.moves, this.revealedCells, this.flags, this.startedAt, deadline(), null, null);
	}

	DailyAttempt played(DailyPlay.Result result, String cells, int moves, int revealedCells, int flags, Instant now) {
		Status next = switch (result) {
			case PLAYING -> Status.PLAYING;
			case WON -> Status.WON;
			case LOST -> Status.LOST;
		};
		boolean over = next != Status.PLAYING;
		return new DailyAttempt(this.id, this.boardDate, this.userId, next, this.startCell, cells, moves,
				revealedCells, flags, this.startedAt, over ? now : null,
				over ? Math.toIntExact(now.toEpochMilli() - this.startedAt.toEpochMilli()) : null, null);
	}

	DailyAttempt rewarded(Reward reward) {
		return new DailyAttempt(this.id, this.boardDate, this.userId, this.status, this.startCell, this.cells,
				this.moves, this.revealedCells, this.flags, this.startedAt, this.finishedAt, this.elapsedMs, reward);
	}

}
