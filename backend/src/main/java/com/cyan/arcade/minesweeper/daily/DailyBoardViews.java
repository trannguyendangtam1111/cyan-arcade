package com.cyan.arcade.minesweeper.daily;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.leaderboard.LeaderboardResponse.Player;
import jakarta.validation.constraints.NotNull;

/**
 * What the Daily Board API sends and accepts. Nothing here carries a mine that has not gone off, a
 * covered cell's contents or a seed: a covered cell is only ever {@code H} (or {@code F}).
 */
final class DailyBoardViews {

	private DailyBoardViews() {
	}

	/**
	 * Today's board, as anyone signed in may know it before playing, and the caller's attempt at it.
	 *
	 * @param startCell the day's opening cell, the same for everyone: every attempt starts with it (and
	 * the empty area around it) uncovered
	 * @param resetsAt the coming 00:00 UTC, when the next board comes out
	 * @param serverTime the server's clock as it answered, for a client to time against
	 * @param attempt the caller's attempt at today's board, or {@code null} before they start one
	 */
	record TodayResponse(LocalDate date, int boardNumber, int rows, int columns, int mines, int startCell,
			long timeLimitMs, Instant resetsAt, Instant serverTime, AttemptResponse attempt) {
	}

	/**
	 * An attempt as its player sees it.
	 *
	 * @param status {@code PLAYING}, {@code WON}, {@code LOST} or {@code EXPIRED} (not finished in time)
	 * @param cells one character per cell, row by row: {@code H} covered, {@code F} flagged,
	 * {@code 0}–{@code 8} uncovered with that many mines around, {@code X} the mine that went off. Other
	 * mines are never shown, not even when the attempt is over. A new attempt already shows the day's
	 * opening uncovered.
	 * @param startCell the day's opening cell, uncovered when the attempt was created
	 * @param moves the player's reveals that uncovered something (the opening is not one)
	 * @param minesLeft mines less flags, as a counter shows it
	 * @param deadline when the attempt runs out of time
	 * @param finishedAt when it ended; {@code null} while it is being played
	 * @param elapsedMs the server's time from start to the reveal that won or lost it; {@code null}
	 * while it is being played, and for an attempt that ran out of time
	 * @param reward what the win was paid; {@code null} for an attempt that has not been won
	 */
	record AttemptResponse(UUID id, LocalDate date, int boardNumber, int rows, int columns, int mines, int startCell,
			String status, String cells, int moves, int revealedCells, int flags, int minesLeft, Instant startedAt, Instant deadline,
			Instant finishedAt, Integer elapsedMs, Reward reward, Instant serverTime) {
	}

	/**
	 * What a won attempt was paid, XP and coins. The coins are 0 when the day's paid games were used up
	 * before the win; the XP is paid all the same.
	 */
	record Reward(int xp, int coins) {
	}

	/** @param cell the cell's index, row by row from 0 */
	record RevealRequest(@NotNull Integer cell) {
	}

	/** @param flagged whether the cell should carry a flag afterwards */
	record FlagRequest(@NotNull Integer cell, @NotNull Boolean flagged) {
	}

	/**
	 * One page of a day's leaderboard: the day's wins, fastest first.
	 *
	 * @param myRank the caller's rank that day, or {@code null} without a win
	 * @param myElapsedMs the caller's winning time that day, or {@code null} likewise
	 */
	record LeaderboardView(LocalDate date, int boardNumber, List<Entry> entries, int page, int size,
			long totalEntries, int totalPages, Long myRank, Long myElapsedMs) {
	}

	/**
	 * @param rank 1 for the fastest; no two share one (equal times: whoever finished first)
	 * @param elapsedMs the server-measured time
	 * @param you whether this is the caller's
	 */
	record Entry(long rank, Player player, long elapsedMs, Instant finishedAt, boolean you) {
	}

}
