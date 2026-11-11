package com.cyan.arcade.minesweeper.daily;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.leaderboard.LeaderboardResponse.Player;
import com.cyan.arcade.minesweeper.daily.DailyAttempt.Status;
import com.cyan.arcade.minesweeper.daily.DailyBoardStore.RankedWin;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.AttemptResponse;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.Entry;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.LeaderboardView;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.Reward;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.TodayResponse;
import com.cyan.arcade.minesweeper.daily.DailySeeds.SharedBoard;
import com.cyan.arcade.progression.CompletionReward;
import com.cyan.arcade.progression.ProgressionService;
import com.cyan.arcade.user.Avatar;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Daily Board, played on the server. Every method takes the moment it acts at, the server's
 * clock as the request arrived, and the account the request is signed in as; nothing the client sends
 * says who it is, when it finished, whether it won or what the board looks like.
 *
 * <p>Each action locks its attempt's row, so the moves of one attempt are made one at a time and the
 * one that ends it does so once: an attempt that is over is never changed again. A win is rewarded in
 * the transaction that saves it, so it is paid exactly once, and only if it is saved.
 */
@Service
class DailyBoardService {

	static final String ATTEMPT_OVER = "ATTEMPT_OVER";

	/** What a won attempt's coins refer to in the ledger, with the board's date: one per account and date. */
	static final String REWARD_REFERENCE = "MINESWEEPER_DAILY_BOARD";

	private static final int MAX_PAGE_SIZE = 100;

	private final DailyBoardStore store;

	private final DailySeeds seeds;

	private final ProgressionService progression;

	DailyBoardService(DailyBoardStore store, DailySeeds seeds, ProgressionService progression) {
		this.store = store;
		this.seeds = seeds;
		this.progression = progression;
	}

	/** An action on an attempt that is over. Whatever was saved before it (an expiry) is kept. */
	static final class AttemptOverException extends ApiException {

		AttemptOverException(Status status) {
			super(HttpStatus.CONFLICT, ATTEMPT_OVER, "This attempt is over (" + status.name().toLowerCase() + ")");
		}

	}

	/** @param created whether this request started it, or it had been started before */
	record Started(boolean created, AttemptResponse attempt) {
	}

	/** Today's board, made now if nobody has asked for it yet (never a later day's). */
	@Transactional
	public TodayResponse today(long userId, Instant now) {
		LocalDate today = DailyBoardSchedule.dateAt(now);
		DailyBoard board = DailyBoardSchedule.BOARD;
		SharedBoard shared = boardOf(today, now);
		AttemptResponse attempt = this.store.findFor(userId, today).map((found) -> view(found.at(now), now)).orElse(null);
		return new TodayResponse(today, DailyBoardSchedule.boardNumber(today), board.rows(), board.columns(),
				board.mines(), shared.startCell(), DailyBoardSchedule.TIME_LIMIT.toMillis(),
				DailyBoardSchedule.nextBoardAt(now), now, attempt);
	}

	/**
	 * Starts the account's attempt at today's board, or gives back the one it has: one attempt per
	 * account and day, however many requests arrive at once. A new attempt is created with the day's
	 * opening uncovered, and its clock starts at the same moment.
	 */
	@Transactional
	public Started start(long userId, Instant now) {
		LocalDate today = DailyBoardSchedule.dateAt(now);
		SharedBoard shared = boardOf(today, now);
		boolean created = this.store.insert(DailyAttempt.start(today, userId, now,
				shared.layout(DailyBoardSchedule.BOARD), shared.startCell()));
		DailyAttempt attempt = this.store.findFor(userId, today)
			.orElseThrow(() -> new IllegalStateException("The attempt just stored is missing"));
		return new Started(created, view(attempt.at(now), now));
	}

	@Transactional(readOnly = true)
	public AttemptResponse attempt(long userId, UUID id, Instant now) {
		return view(owned(id, userId, false).at(now), now);
	}

	/**
	 * Uncovers a cell on the day's stored mines, which no reveal changes: uncovering a mine loses, and
	 * the last safe cell wins at this moment, and is rewarded. The opening is uncovered already, so
	 * revealing it again changes nothing.
	 */
	@Transactional(noRollbackFor = AttemptOverException.class)
	public AttemptResponse reveal(long userId, UUID id, int cell, Instant now) {
		DailyAttempt attempt = playable(id, userId, now);
		requireOnBoard(cell);
		DailyLayout layout = this.store.findBoard(attempt.boardDate())
			.orElseThrow(() -> new IllegalStateException("An attempt's board is missing"))
			.layout(DailyBoardSchedule.BOARD);
		DailyPlay.Move move = DailyPlay.reveal(layout, attempt.cells().toCharArray(), attempt.revealedCells(),
				attempt.flags(), cell);
		if (!move.changed()) {
			return view(attempt, now);
		}
		return save(attempt.played(move.result(), new String(move.cells()), attempt.moves() + 1,
				move.revealedCells(), move.flags(), now), now);
	}

	/** Flags a covered cell, or takes its flag off. */
	@Transactional(noRollbackFor = AttemptOverException.class)
	public AttemptResponse flag(long userId, UUID id, int cell, boolean flagged, Instant now) {
		DailyAttempt attempt = playable(id, userId, now);
		requireOnBoard(cell);
		DailyPlay.Move move = DailyPlay.flag(attempt.cells().toCharArray(), attempt.revealedCells(), attempt.flags(),
				DailyBoardSchedule.BOARD.mines(), cell, flagged);
		if (!move.changed()) {
			return view(attempt, now);
		}
		return save(attempt.played(move.result(), new String(move.cells()), attempt.moves(),
				move.revealedCells(), move.flags(), now), now);
	}

	/**
	 * A day's leaderboard, today's when no date is given. Only days that have had a board are asked
	 * about: a day still to come is not found.
	 */
	@Transactional(readOnly = true)
	public LeaderboardView leaderboard(long userId, LocalDate date, int page, int size, Instant now) {
		LocalDate day = (date != null) ? date : DailyBoardSchedule.dateAt(now);
		if (!DailyBoardSchedule.hasBoard(day) || day.isAfter(DailyBoardSchedule.dateAt(now))) {
			throw new NotFoundException("Daily Board", day);
		}
		if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
					"page must be 0 or more and size between 1 and " + MAX_PAGE_SIZE);
		}
		List<Entry> entries = this.store.leaderboard(day, userId, page, size)
			.stream()
			.map((win) -> new Entry(win.rank(),
					new Player(win.username(), win.displayName(), Avatar.valueOf(win.avatar())), win.elapsedMs(),
					win.finishedAt(), win.you()))
			.toList();
		long total = this.store.wins(day);
		RankedWin mine = this.store.standingOf(day, userId).orElse(null);
		return new LeaderboardView(day, DailyBoardSchedule.boardNumber(day), entries, page, size, total,
				(int) ((total + size - 1) / size), (mine != null) ? mine.rank() : null,
				(mine != null) ? mine.elapsedMs() : null);
	}

	/**
	 * That date's board, the stored one: the first time a date is asked for, its board is made from the
	 * secret and stored, and from then on it is the date's, even if two requests make it at once (the
	 * first one stored stays, and every request reads that one back).
	 */
	private SharedBoard boardOf(LocalDate date, Instant now) {
		return this.store.findBoard(date).orElseGet(() -> {
			this.store.insertBoard(date, DailyBoardSchedule.boardNumber(date), DailyBoardSchedule.BOARD,
					this.seeds.boardFor(date, DailyBoardSchedule.BOARD), DailyBoardSchedule.LAYOUT_VERSION, now);
			return this.store.findBoard(date).orElseThrow(() -> new IllegalStateException("The board just stored is missing"));
		});
	}

	/**
	 * The caller's attempt, locked, if it can still be played. One past its deadline is saved as
	 * expired first, and the action refused.
	 */
	private DailyAttempt playable(UUID id, long userId, Instant now) {
		DailyAttempt stored = owned(id, userId, true);
		DailyAttempt current = stored.at(now);
		if (current.status() == Status.PLAYING) {
			return current;
		}
		if (stored.status() == Status.PLAYING) {
			this.store.save(current);
		}
		throw new AttemptOverException(current.status());
	}

	/** Another account's attempt is not found, just as one that does not exist. */
	private DailyAttempt owned(UUID id, long userId, boolean forUpdate) {
		return this.store.findOwned(id, userId, forUpdate).orElseThrow(() -> new NotFoundException("Attempt", id));
	}

	private AttemptResponse save(DailyAttempt next, Instant now) {
		if (!this.store.save(next)) {
			// The row is locked and was being played, so only a bug gets here.
			throw new IllegalStateException("Attempt " + next.id() + " was finished by another request");
		}
		return view((next.status() == Status.WON) ? rewarded(next) : next, now);
	}

	/**
	 * Pays a win, which was just saved in this transaction under the attempt's row lock: this runs once
	 * per attempt, so once per account and date. Losses and expiries are never saved through here.
	 * Should anything fail, the whole move rolls back, the win with it, and the attempt is still being
	 * played.
	 */
	private DailyAttempt rewarded(DailyAttempt won) {
		CompletionReward paid = this.progression.rewardCompletion(won.userId(), DailyBoardSchedule.WIN_XP,
				DailyBoardSchedule.WIN_COINS, CoinReference.of(REWARD_REFERENCE, won.boardDate()),
				"Won Minesweeper Daily Board #" + DailyBoardSchedule.boardNumber(won.boardDate()));
		DailyAttempt.Reward reward = new DailyAttempt.Reward(paid.xp(), paid.coins());
		if (!this.store.saveReward(won.id(), reward)) {
			throw new IllegalStateException("Attempt " + won.id() + " was rewarded already");
		}
		return won.rewarded(reward);
	}

	private static void requireOnBoard(int cell) {
		if (cell < 0 || cell >= DailyBoardSchedule.BOARD.cells()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
					"cell must be between 0 and " + (DailyBoardSchedule.BOARD.cells() - 1));
		}
	}

	private static AttemptResponse view(DailyAttempt attempt, Instant now) {
		DailyBoard board = DailyBoardSchedule.BOARD;
		return new AttemptResponse(attempt.id(), attempt.boardDate(), DailyBoardSchedule.boardNumber(attempt.boardDate()),
				board.rows(), board.columns(), board.mines(), attempt.startCell(), attempt.status().name(),
				attempt.cells(), attempt.moves(),
				attempt.revealedCells(), attempt.flags(), board.mines() - attempt.flags(), attempt.startedAt(),
				attempt.deadline(), attempt.finishedAt(), attempt.elapsedMs(),
				(attempt.reward() != null) ? new Reward(attempt.reward().xp(), attempt.reward().coins()) : null, now);
	}

}
