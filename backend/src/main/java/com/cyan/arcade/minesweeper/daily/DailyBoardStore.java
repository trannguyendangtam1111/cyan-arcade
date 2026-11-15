package com.cyan.arcade.minesweeper.daily;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.cyan.arcade.minesweeper.daily.DailyAttempt.Status;
import com.cyan.arcade.minesweeper.daily.DailySeeds.SharedBoard;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The Daily Board's boards ({@code minesweeper_daily_boards}) and attempts
 * ({@code minesweeper_daily_attempts}). The database decides the races: a date's board is the first one
 * stored, and an account's attempt at a date the first one stored, whatever requests arrive at once.
 */
@Repository
class DailyBoardStore {

	private static final String COLUMNS = """
			id, board_date, user_id, status, start_cell, cells, moves, revealed_cells, flags, started_at, finished_at,
			elapsed_ms""";

	/** What a read gives back: the attempt and, once a win was paid, its reward. */
	private static final String READ = COLUMNS + ", reward_xp, reward_coins";

	private final JdbcClient jdbc;

	DailyBoardStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** A finished, won attempt on a day's leaderboard. */
	record RankedWin(long rank, String username, String displayName, String avatar, long elapsedMs,
			Instant finishedAt, boolean you) {
	}

	// --- Boards --------------------------------------------------------------------------------------

	/** The board stored for that date, if it has been made. Server-side only: it holds the mines. */
	Optional<SharedBoard> findBoard(LocalDate date) {
		return this.jdbc.sql("""
				SELECT seed, start_cell, array_to_string(mine_cells, ',') AS mines
				FROM minesweeper_daily_boards WHERE board_date = :date
				""")
			.param("date", date)
			.query((row, index) -> new SharedBoard(row.getLong("seed"), row.getInt("start_cell"),
					Arrays.stream(row.getString("mines").split(",")).mapToInt(Integer::parseInt).toArray()))
			.optional();
	}

	/** Stores a date's board unless one is stored already: the first one stored stays. */
	void insertBoard(LocalDate date, int number, DailyBoard board, SharedBoard shared, int layoutVersion, Instant now) {
		this.jdbc.sql("""
				INSERT INTO minesweeper_daily_boards (board_date, board_number, board_rows, board_columns, mines, seed,
				                                      start_cell, mine_cells, layout_version, created_at)
				VALUES (:date, :number, :rows, :columns, :mines, :seed, :startCell, CAST(:mineCells AS SMALLINT[]),
				        :version, :now)
				ON CONFLICT (board_date) DO NOTHING
				""")
			.param("date", date)
			.param("number", number)
			.param("rows", board.rows())
			.param("columns", board.columns())
			.param("mines", board.mines())
			.param("seed", shared.seed())
			.param("startCell", shared.startCell())
			.param("mineCells", Arrays.stream(shared.mineCells())
				.mapToObj(Integer::toString)
				.collect(Collectors.joining(",", "{", "}")))
			.param("version", layoutVersion)
			.param("now", timestamp(now))
			.update();
	}

	// --- Attempts ------------------------------------------------------------------------------------

	/**
	 * @return {@code false} when the account already has an attempt at that date, possibly stored by
	 * another request at the same moment: the unique constraint decides
	 */
	boolean insert(DailyAttempt attempt) {
		return this.jdbc.sql("""
				INSERT INTO minesweeper_daily_attempts (%s)
				VALUES (:id, :date, :userId, :status, :startCell, :cells, :moves, :revealed, :flags, :startedAt,
				        :finishedAt, :elapsedMs)
				ON CONFLICT (user_id, board_date) DO NOTHING
				""".formatted(COLUMNS))
			.param("id", attempt.id())
			.param("date", attempt.boardDate())
			.param("userId", attempt.userId())
			.param("status", attempt.status().name())
			.param("startCell", attempt.startCell())
			.param("cells", attempt.cells())
			.param("moves", attempt.moves())
			.param("revealed", attempt.revealedCells())
			.param("flags", attempt.flags())
			.param("startedAt", timestamp(attempt.startedAt()))
			.param("finishedAt", timestamp(attempt.finishedAt()))
			.param("elapsedMs", attempt.elapsedMs())
			.update() == 1;
	}

	/** The account's attempt at that date. */
	Optional<DailyAttempt> findFor(long userId, LocalDate date) {
		return this.jdbc.sql("SELECT " + READ + " FROM minesweeper_daily_attempts WHERE user_id = :userId AND board_date = :date")
			.param("userId", userId)
			.param("date", date)
			.query(DailyBoardStore::map)
			.optional();
	}

	/** The attempt if it is that account's, optionally locked until the transaction ends. */
	Optional<DailyAttempt> findOwned(UUID id, long userId, boolean forUpdate) {
		return this.jdbc.sql("SELECT " + READ + " FROM minesweeper_daily_attempts WHERE id = :id AND user_id = :userId"
				+ (forUpdate ? " FOR UPDATE" : ""))
			.param("id", id)
			.param("userId", userId)
			.query(DailyBoardStore::map)
			.optional();
	}

	/**
	 * Saves a move, only on an attempt still being played: once it is over, nothing changes it again.
	 * @return whether it was saved
	 */
	boolean save(DailyAttempt attempt) {
		return this.jdbc.sql("""
				UPDATE minesweeper_daily_attempts
				SET status = :status, cells = :cells, moves = :moves, revealed_cells = :revealed,
				    flags = :flags, finished_at = :finishedAt, elapsed_ms = :elapsedMs
				WHERE id = :id AND status = 'PLAYING'
				""")
			.param("status", attempt.status().name())
			.param("cells", attempt.cells())
			.param("moves", attempt.moves())
			.param("revealed", attempt.revealedCells())
			.param("flags", attempt.flags())
			.param("finishedAt", timestamp(attempt.finishedAt()))
			.param("elapsedMs", attempt.elapsedMs())
			.param("id", attempt.id())
			.update() == 1;
	}

	/**
	 * Records what a won attempt was paid. Only once, and only for a win: false if the attempt is not
	 * won or already has its reward.
	 */
	boolean saveReward(UUID id, DailyAttempt.Reward reward) {
		return this.jdbc.sql("""
				UPDATE minesweeper_daily_attempts SET reward_xp = :xp, reward_coins = :coins
				WHERE id = :id AND status = 'WON' AND reward_xp IS NULL
				""")
			.param("xp", reward.xp())
			.param("coins", reward.coins())
			.param("id", id)
			.update() == 1;
	}

	// --- Leaderboard ---------------------------------------------------------------------------------

	private static final String RANKED = """
			SELECT a.id, a.user_id, a.elapsed_ms, a.finished_at,
			       row_number() OVER (ORDER BY a.elapsed_ms, a.finished_at, a.id) AS rank
			FROM minesweeper_daily_attempts a
			WHERE a.board_date = :date AND a.status = 'WON'
			""";

	/** One page of the day's wins: fastest first, then whoever finished first; no two share a rank. */
	List<RankedWin> leaderboard(LocalDate date, long userId, int page, int size) {
		return this.jdbc.sql("""
				SELECT r.rank, r.user_id, r.elapsed_ms, r.finished_at, u.username, u.display_name, u.avatar
				FROM (%s) r JOIN users u ON u.id = r.user_id
				ORDER BY r.rank
				LIMIT :size OFFSET :offset
				""".formatted(RANKED))
			.param("date", date)
			.param("size", size)
			.param("offset", (long) page * size)
			.query((row, index) -> new RankedWin(row.getLong("rank"), row.getString("username"),
					row.getString("display_name"), row.getString("avatar"), row.getLong("elapsed_ms"),
					instant(row, "finished_at"), row.getLong("user_id") == userId))
			.list();
	}

	long wins(LocalDate date) {
		return this.jdbc.sql("SELECT count(*) FROM minesweeper_daily_attempts WHERE board_date = :date AND status = 'WON'")
			.param("date", date)
			.query(Long.class)
			.single();
	}

	/** The account's place on the day's leaderboard, if it won that day. */
	Optional<RankedWin> standingOf(LocalDate date, long userId) {
		return this.jdbc.sql("SELECT r.rank, r.elapsed_ms, r.finished_at FROM (%s) r WHERE r.user_id = :userId"
			.formatted(RANKED))
			.param("date", date)
			.param("userId", userId)
			.query((row, index) -> new RankedWin(row.getLong("rank"), null, null, null, row.getLong("elapsed_ms"),
					instant(row, "finished_at"), true))
			.optional();
	}

	private static DailyAttempt.Reward reward(Integer xp, Integer coins) {
		return (xp != null) ? new DailyAttempt.Reward(xp, coins) : null;
	}

	private static DailyAttempt map(ResultSet row, int index) throws SQLException {
		return new DailyAttempt(row.getObject("id", UUID.class), row.getObject("board_date", LocalDate.class),
				row.getLong("user_id"), Status.valueOf(row.getString("status")), row.getInt("start_cell"),
				row.getString("cells"), row.getInt("moves"), row.getInt("revealed_cells"), row.getInt("flags"),
				instant(row, "started_at"), instant(row, "finished_at"), row.getObject("elapsed_ms", Integer.class),
				reward(row.getObject("reward_xp", Integer.class), row.getObject("reward_coins", Integer.class)));
	}

	private static Instant instant(ResultSet row, String column) throws SQLException {
		OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
		return (value != null) ? value.toInstant() : null;
	}

	private static OffsetDateTime timestamp(Instant instant) {
		return (instant != null) ? OffsetDateTime.ofInstant(instant, ZoneOffset.UTC) : null;
	}

}
