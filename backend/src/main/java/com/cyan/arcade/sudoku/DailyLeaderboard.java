package com.cyan.arcade.sudoku;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuViews.BoardEntry;
import com.cyan.arcade.sudoku.SudokuViews.BoardPlayer;
import com.cyan.arcade.sudoku.SudokuViews.DailyLeaderboardResponse;
import com.cyan.arcade.sudoku.daily.DailySchedule;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Daily Sudoku leaderboard of one puzzle: the scores of that day's puzzle, whenever they arrived.
 *
 * <p>The platform's boards count a score on the day it was submitted. A daily puzzle started just
 * before midnight UTC and solved after it would then be ranked among the next day's puzzle, which
 * is a different grid. So this board takes the puzzle's date from the server's own record of the
 * run ({@code sudoku_runs.puzzle_date}), never from the browser: a score is on the board of the
 * daily run whose session it finished. A daily run is tied to one session at a time, and never to
 * another once its score is in, so each score belongs to exactly one puzzle date.
 *
 * <p>Only scores of the {@value SudokuRunRules#DAILY} mode count: the scores from before the boards
 * were split stay on the Classic (Legacy) board, and practice games are on their difficulty's. The
 * ranking is the platform's: each player once with their best score, higher first, and among equal
 * scores whoever set theirs first, then the older score.
 */
@Service
class DailyLeaderboard {

	static final int MAX_PAGE_SIZE = 100;

	/** Who a score counts for, as on every board: an account, else a guest's browser id, else the run. */
	private static final String RANKED = """
			WITH entries AS (
			    SELECT s.id, s.score, s.duration_ms, s.created_at, s.user_id, s.player_id,
			           CASE WHEN s.user_id IS NOT NULL THEN 'u' || s.user_id
			                WHEN s.player_id IS NOT NULL THEN 'g' || s.player_id
			                ELSE 's' || s.id END AS competitor
			    FROM sudoku_runs r
			    JOIN scores s ON s.game_session_id = r.session_id
			    WHERE r.mode = 'DAILY' AND r.ranked AND r.puzzle_date = :date AND s.mode = :mode
			), best AS (
			    SELECT DISTINCT ON (competitor) * FROM entries ORDER BY competitor, score DESC, created_at, id
			), ranked AS (
			    SELECT best.*, row_number() OVER (ORDER BY score DESC, created_at, id) AS rank FROM best
			)
			""";

	private final JdbcClient jdbc;

	private final Clock clock;

	DailyLeaderboard(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	/**
	 * @param date the puzzle's UTC date, or {@code null} for today's
	 * @param owner the caller, or {@code null} for a guest without an id
	 * @throws NotFoundException for a date with no daily puzzle: before the first one, or not come yet
	 */
	@Transactional(readOnly = true)
	public DailyLeaderboardResponse board(LocalDate date, int page, int size, Owner owner) {
		LocalDate today = DailySchedule.today(this.clock);
		LocalDate day = (date != null) ? date : today;
		if (!DailySchedule.hasPuzzle(day) || day.isAfter(today)) {
			throw new NotFoundException("Daily Sudoku of", day);
		}
		List<BoardEntry> entries = this.jdbc.sql(RANKED + """
				SELECT r.rank, r.score, r.duration_ms, r.created_at, r.user_id, r.player_id,
				       u.username, u.display_name, u.avatar
				FROM ranked r LEFT JOIN users u ON u.id = r.user_id
				ORDER BY r.rank
				LIMIT :size OFFSET :offset
				""")
			.param("date", day)
			.param("mode", SudokuRunRules.DAILY)
			.param("size", size)
			.param("offset", (long) page * size)
			.query((row, index) -> entry(row, owner))
			.list();
		long total = this.jdbc.sql(RANKED + "SELECT count(*) FROM ranked")
			.param("date", day)
			.param("mode", SudokuRunRules.DAILY)
			.query(Long.class)
			.single();
		Optional<long[]> mine = standing(day, owner);
		return new DailyLeaderboardResponse(day, DailySchedule.puzzleNumber(day), DailySchedule.difficultyFor(day),
				today, DailySchedule.nextPuzzleAt(this.clock), entries, page, size, total,
				(int) ((total + size - 1) / size), mine.map((best) -> best[0]).orElse(null),
				mine.map((best) -> (int) best[1]).orElse(null));
	}

	/** The caller's rank and score on that day's board, if they are on it. */
	private Optional<long[]> standing(LocalDate day, Owner owner) {
		String competitor = (owner == null) ? null
				: (owner.userId() != null) ? "u" + owner.userId()
						: (owner.playerId() != null) ? "g" + owner.playerId() : null;
		if (competitor == null) {
			return Optional.empty();
		}
		return this.jdbc.sql(RANKED + "SELECT rank, score FROM ranked WHERE competitor = :competitor")
			.param("date", day)
			.param("mode", SudokuRunRules.DAILY)
			.param("competitor", competitor)
			.query((row, index) -> new long[] { row.getLong("rank"), row.getInt("score") })
			.optional();
	}

	private static BoardEntry entry(ResultSet row, Owner owner) throws SQLException {
		Long userId = row.getObject("user_id", Long.class);
		UUID playerId = row.getObject("player_id", UUID.class);
		String username = row.getString("username");
		// Ids never leave the server: a name and avatar, or a guest, and whether it is the caller's.
		BoardPlayer player = (userId != null && username != null)
				? new BoardPlayer(username, row.getString("display_name"), row.getString("avatar")) : null;
		boolean you = owner != null && ((userId != null) ? userId.equals(owner.userId())
				: owner.userId() == null && playerId != null && playerId.equals(owner.playerId()));
		return new BoardEntry(row.getLong("rank"), player, row.getInt("score"), row.getLong("duration_ms"),
				row.getObject("created_at", OffsetDateTime.class).toInstant(), you);
	}

}
