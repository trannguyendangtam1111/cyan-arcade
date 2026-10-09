package com.cyan.arcade.sudoku;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.cyan.arcade.sudoku.SudokuRun.Mode;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuRun.Status;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.cyan.arcade.sudoku.engine.SudokuGame.Action;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Sudoku runs ({@code sudoku_runs}) and the stored daily puzzles ({@code sudoku_daily_puzzles}).
 * A run's actions are kept as comma-separated text in the order they were played. Unique indexes
 * allow one daily run per player and day, and one run per platform session.
 */
@Repository
class SudokuRunStore {

	private static final String COLUMNS = """
			id, mode, ranked, difficulty, puzzle_date, puzzle_number, seed, givens, solution, actions, status, mistakes,
			hints, streak, session_id, user_id, player_id, started_at, finished_at, paused_at, paused_ms""";

	private final JdbcClient jdbc;

	SudokuRunStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** A finished or abandoned ranked run, for statistics and streaks. */
	record Result(Mode mode, Difficulty difficulty, Status status, int mistakes, int hints, long activeMs,
			LocalDate puzzleDate) {
	}

	// --- Daily puzzles -------------------------------------------------------------------------------

	Optional<Puzzle> findDailyPuzzle(LocalDate date) {
		return this.jdbc.sql("SELECT givens, solution, difficulty, seed FROM sudoku_daily_puzzles WHERE puzzle_date = :date")
			.param("date", date)
			.query((row, index) -> new Puzzle(row.getString("givens"), row.getString("solution"),
					Difficulty.valueOf(row.getString("difficulty")), row.getLong("seed"), null))
			.optional();
	}

	/** Stores a day's puzzle unless one is stored already: the first one stored stays. */
	void insertDailyPuzzle(LocalDate date, int puzzleNumber, Puzzle puzzle, int generatorVersion, Instant now) {
		this.jdbc.sql("""
				INSERT INTO sudoku_daily_puzzles (puzzle_date, puzzle_number, difficulty, seed, givens, solution,
				                                  generator_version, created_at)
				VALUES (:date, :number, :difficulty, :seed, :givens, :solution, :version, :now)
				ON CONFLICT (puzzle_date) DO NOTHING
				""")
			.param("date", date)
			.param("number", puzzleNumber)
			.param("difficulty", puzzle.difficulty().name())
			.param("seed", puzzle.seed())
			.param("givens", puzzle.givens())
			.param("solution", puzzle.solution())
			.param("version", generatorVersion)
			.param("now", timestamp(now))
			.update();
	}

	// --- Runs ----------------------------------------------------------------------------------------

	/**
	 * @return {@code false} when the player already has that day's run, or the session already has a
	 * run, possibly saved by another request at the same moment: the unique indexes decide
	 */
	boolean insert(SudokuRun run) {
		return this.jdbc.sql("""
				INSERT INTO sudoku_runs (%s)
				VALUES (:id, :mode, :ranked, :difficulty, :puzzleDate, :puzzleNumber, :seed, :givens, :solution, :actions,
				        :status, :mistakes, :hints, :streak, :sessionId, :userId, :playerId, :startedAt, :finishedAt,
				        :pausedAt, :pausedMs)
				ON CONFLICT DO NOTHING
				""".formatted(COLUMNS))
			.param("id", run.id())
			.param("mode", run.mode().name())
			.param("ranked", run.ranked())
			.param("difficulty", run.difficulty().name())
			.param("puzzleDate", run.puzzleDate())
			.param("puzzleNumber", run.puzzleNumber())
			.param("seed", run.seed())
			.param("givens", run.givens())
			.param("solution", run.solution())
			.param("actions", encode(run.actions()))
			.param("status", run.status().name())
			.param("mistakes", run.mistakes())
			.param("hints", run.hints())
			.param("streak", run.streak())
			.param("sessionId", run.sessionId())
			.param("userId", run.userId())
			.param("playerId", run.playerId())
			.param("startedAt", timestamp(run.startedAt()))
			.param("finishedAt", timestamp(run.finishedAt()))
			.param("pausedAt", timestamp(run.pausedAt()))
			.param("pausedMs", run.pausedMs())
			.update() == 1;
	}

	/** Loads a run and locks it until the transaction ends, so its actions are made one at a time. */
	Optional<SudokuRun> findForUpdate(UUID id) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM sudoku_runs WHERE id = :id FOR UPDATE")
			.param("id", id)
			.query(SudokuRunStore::map)
			.optional();
	}

	Optional<SudokuRun> findBySession(UUID sessionId) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM sudoku_runs WHERE session_id = :sessionId")
			.param("sessionId", sessionId)
			.query(SudokuRunStore::map)
			.optional();
	}

	Optional<SudokuRun> findDaily(Owner owner, LocalDate date, boolean forUpdate) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM sudoku_runs WHERE mode = 'DAILY' AND puzzle_date = :date AND "
				+ ownerCondition(owner) + (forUpdate ? " FOR UPDATE" : ""))
			.param("date", date)
			.params(ownerParams(owner))
			.query(SudokuRunStore::map)
			.optional();
	}

	/** The player's practice game in progress, if any: the latest one. */
	Optional<SudokuRun> findPracticeInProgress(Owner owner) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM sudoku_runs WHERE mode = 'PRACTICE' AND status = 'PLAYING' AND "
				+ ownerCondition(owner) + " ORDER BY started_at DESC LIMIT 1")
			.params(ownerParams(owner))
			.query(SudokuRunStore::map)
			.optional();
	}

	/** Leaves the player's practice games in progress: they count as played, never as completed. */
	int abandonPractice(Owner owner, Instant now) {
		return this.jdbc.sql("""
				UPDATE sudoku_runs
				SET status = 'ABANDONED', finished_at = :now,
				    paused_ms = paused_ms + CASE WHEN paused_at IS NULL THEN 0
				                                 ELSE (EXTRACT(EPOCH FROM (:now - paused_at)) * 1000)::BIGINT END,
				    paused_at = NULL
				WHERE mode = 'PRACTICE' AND status = 'PLAYING' AND""" + " " + ownerCondition(owner))
			.param("now", timestamp(now))
			.params(ownerParams(owner))
			.update();
	}

	void bindSession(UUID runId, UUID sessionId) {
		this.jdbc.sql("UPDATE sudoku_runs SET session_id = :sessionId WHERE id = :id")
			.param("sessionId", sessionId)
			.param("id", runId)
			.update();
	}

	/** Saves a run's actions, where it stands and its clock. */
	void saveProgress(SudokuRun run) {
		this.jdbc.sql("""
				UPDATE sudoku_runs SET actions = :actions, status = :status, mistakes = :mistakes, hints = :hints,
				                       streak = :streak, finished_at = :finishedAt, paused_at = :pausedAt,
				                       paused_ms = :pausedMs
				WHERE id = :id
				""")
			.param("actions", encode(run.actions()))
			.param("status", run.status().name())
			.param("mistakes", run.mistakes())
			.param("hints", run.hints())
			.param("streak", run.streak())
			.param("finishedAt", timestamp(run.finishedAt()))
			.param("pausedAt", timestamp(run.pausedAt()))
			.param("pausedMs", run.pausedMs())
			.param("id", run.id())
			.update();
	}

	/** Every ranked run of the player that is over, oldest first. */
	List<Result> results(Owner owner) {
		return this.jdbc.sql("""
				SELECT mode, difficulty, status, mistakes, hints, puzzle_date,
				       GREATEST(0, (EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::BIGINT - paused_ms) AS active_ms
				FROM sudoku_runs
				WHERE ranked AND status <> 'PLAYING' AND finished_at IS NOT NULL AND""" + " " + ownerCondition(owner)
				+ " ORDER BY started_at")
			.params(ownerParams(owner))
			.query((row, index) -> new Result(Mode.valueOf(row.getString("mode")),
					Difficulty.valueOf(row.getString("difficulty")), Status.valueOf(row.getString("status")),
					row.getInt("mistakes"), row.getInt("hints"), row.getLong("active_ms"),
					row.getObject("puzzle_date", LocalDate.class)))
			.list();
	}

	/** Forgets relaxed games started before then: they count for nothing once left. */
	int deleteRelaxedStartedBefore(Instant before) {
		return this.jdbc.sql("DELETE FROM sudoku_runs WHERE NOT ranked AND started_at < :before")
			.param("before", timestamp(before))
			.update();
	}

	private static String ownerCondition(Owner owner) {
		return (owner.userId() != null) ? "user_id = :userId" : "user_id IS NULL AND player_id = :playerId";
	}

	private static Map<String, Object> ownerParams(Owner owner) {
		return (owner.userId() != null) ? Map.of("userId", owner.userId()) : Map.of("playerId", owner.playerId());
	}

	private static SudokuRun map(ResultSet row, int index) throws SQLException {
		return new SudokuRun(row.getObject("id", UUID.class), Mode.valueOf(row.getString("mode")),
				row.getBoolean("ranked"), Difficulty.valueOf(row.getString("difficulty")),
				row.getObject("puzzle_date", LocalDate.class), (Integer) row.getObject("puzzle_number"),
				row.getLong("seed"), row.getString("givens"), row.getString("solution"), decode(row.getString("actions")),
				Status.valueOf(row.getString("status")), row.getInt("mistakes"), row.getInt("hints"), row.getInt("streak"),
				row.getObject("session_id", UUID.class), row.getObject("user_id", Long.class),
				row.getObject("player_id", UUID.class), instant(row, "started_at"), instant(row, "finished_at"),
				instant(row, "paused_at"), row.getLong("paused_ms"));
	}

	static String encode(List<Action> actions) {
		return actions.stream().map(Action::encode).collect(Collectors.joining(","));
	}

	static List<Action> decode(String text) {
		return (text == null || text.isEmpty()) ? List.of() : Arrays.stream(text.split(",")).map(Action::decode).toList();
	}

	private static Instant instant(ResultSet row, String column) throws SQLException {
		OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
		return (value != null) ? value.toInstant() : null;
	}

	private static OffsetDateTime timestamp(Instant instant) {
		return (instant != null) ? OffsetDateTime.ofInstant(instant, ZoneOffset.UTC) : null;
	}

}
