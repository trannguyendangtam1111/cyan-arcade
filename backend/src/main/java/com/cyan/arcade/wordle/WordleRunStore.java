package com.cyan.arcade.wordle;

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

import com.cyan.arcade.wordle.WordleRun.Mode;
import com.cyan.arcade.wordle.WordleRun.Owner;
import com.cyan.arcade.wordle.engine.Hint;
import com.cyan.arcade.wordle.engine.WordleGame.Status;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Word Guess runs. Backed by {@code wordle_runs}: guesses and hints are stored as comma-separated
 * text, in the order they were played. A unique index allows one daily run per player and day.
 */
@Repository
class WordleRunStore {

	private static final String COLUMNS = """
			id, mode, session_id, user_id, player_id, puzzle_date, puzzle_number, target, guesses, hints, status,
			streak, started_at, finished_at""";

	private final JdbcClient jdbc;

	WordleRunStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** A finished daily run, for streaks and statistics. */
	record DailyResult(LocalDate date, boolean solved, int guesses) {
	}

	/**
	 * Saves a new run.
	 * @return {@code false} when the player already has that day's run, or the session already has a
	 * run, possibly saved by another request at the same moment: the unique indexes decide
	 */
	boolean insert(WordleRun run) {
		return this.jdbc.sql("""
				INSERT INTO wordle_runs (%s)
				VALUES (:id, :mode, :sessionId, :userId, :playerId, :puzzleDate, :puzzleNumber, :target, :guesses,
				        :hints, :status, :streak, :startedAt, :finishedAt)
				ON CONFLICT DO NOTHING
				""".formatted(COLUMNS))
			.param("id", run.id())
			.param("mode", run.mode().name())
			.param("sessionId", run.sessionId())
			.param("userId", run.userId())
			.param("playerId", run.playerId())
			.param("puzzleDate", run.puzzleDate())
			.param("puzzleNumber", run.puzzleNumber())
			.param("target", run.target())
			.param("guesses", String.join(",", run.guesses()))
			.param("hints", encode(run.hints()))
			.param("status", run.status().name())
			.param("streak", run.streak())
			.param("startedAt", timestamp(run.startedAt()))
			.param("finishedAt", timestamp(run.finishedAt()))
			.update() == 1;
	}

	/** Loads a run and locks it until the transaction ends, so its moves are made one at a time. */
	Optional<WordleRun> findForUpdate(UUID id) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM wordle_runs WHERE id = :id FOR UPDATE")
			.param("id", id)
			.query(WordleRunStore::map)
			.optional();
	}

	Optional<WordleRun> findBySession(UUID sessionId) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM wordle_runs WHERE session_id = :sessionId")
			.param("sessionId", sessionId)
			.query(WordleRunStore::map)
			.optional();
	}

	/** The player's run of that day's puzzle, locked until the transaction ends. */
	Optional<WordleRun> findDailyForUpdate(Owner owner, LocalDate date) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM wordle_runs WHERE mode = 'DAILY' AND puzzle_date = :date AND "
				+ ownerCondition(owner) + " FOR UPDATE")
			.param("date", date)
			.params(ownerParams(owner))
			.query(WordleRunStore::map)
			.optional();
	}

	Optional<WordleRun> findDaily(Owner owner, LocalDate date) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM wordle_runs WHERE mode = 'DAILY' AND puzzle_date = :date AND "
				+ ownerCondition(owner))
			.param("date", date)
			.params(ownerParams(owner))
			.query(WordleRunStore::map)
			.optional();
	}

	/** Ties a run to the platform session its score will be submitted with. */
	void bindSession(UUID runId, UUID sessionId) {
		this.jdbc.sql("UPDATE wordle_runs SET session_id = :sessionId WHERE id = :id")
			.param("sessionId", sessionId)
			.param("id", runId)
			.update();
	}

	/** Saves a run's moves and where it stands. */
	void saveProgress(WordleRun run) {
		this.jdbc.sql("""
				UPDATE wordle_runs SET guesses = :guesses, hints = :hints, status = :status, streak = :streak,
				                       finished_at = :finishedAt
				WHERE id = :id
				""")
			.param("guesses", String.join(",", run.guesses()))
			.param("hints", encode(run.hints()))
			.param("status", run.status().name())
			.param("streak", run.streak())
			.param("finishedAt", timestamp(run.finishedAt()))
			.param("id", run.id())
			.update();
	}

	/** Every finished daily run of the player, oldest first. */
	List<DailyResult> dailyResults(Owner owner) {
		return this.jdbc.sql("SELECT puzzle_date, status, guesses FROM wordle_runs WHERE mode = 'DAILY' AND status <> 'PLAYING' AND "
				+ ownerCondition(owner) + " ORDER BY puzzle_date")
			.params(ownerParams(owner))
			.query((row, index) -> new DailyResult(row.getObject("puzzle_date", LocalDate.class),
					Status.SOLVED.name().equals(row.getString("status")), guessesOf(row.getString("guesses")).size()))
			.list();
	}

	/** Forgets practice runs started before then: they count for nothing once left. */
	int deletePracticeStartedBefore(Instant before) {
		return this.jdbc.sql("DELETE FROM wordle_runs WHERE mode = 'PRACTICE' AND started_at < :before")
			.param("before", timestamp(before))
			.update();
	}

	private static String ownerCondition(Owner owner) {
		return (owner.userId() != null) ? "user_id = :userId" : "user_id IS NULL AND player_id = :playerId";
	}

	private static Map<String, Object> ownerParams(Owner owner) {
		return (owner.userId() != null) ? Map.of("userId", owner.userId())
				: Map.of("playerId", owner.playerId());
	}

	private static WordleRun map(ResultSet row, int index) throws SQLException {
		OffsetDateTime finishedAt = row.getObject("finished_at", OffsetDateTime.class);
		return new WordleRun(row.getObject("id", UUID.class), Mode.valueOf(row.getString("mode")),
				row.getObject("session_id", UUID.class), row.getObject("user_id", Long.class),
				row.getObject("player_id", UUID.class), row.getObject("puzzle_date", LocalDate.class),
				(Integer) row.getObject("puzzle_number"), row.getString("target"), guessesOf(row.getString("guesses")),
				hintsOf(row.getString("hints")), Status.valueOf(row.getString("status")), row.getInt("streak"),
				row.getObject("started_at", OffsetDateTime.class).toInstant(),
				(finishedAt != null) ? finishedAt.toInstant() : null);
	}

	private static List<String> guessesOf(String text) {
		return (text == null || text.isEmpty()) ? List.of() : Arrays.asList(text.split(","));
	}

	private static List<Hint> hintsOf(String text) {
		return (text == null || text.isEmpty()) ? List.of() : Arrays.stream(text.split(",")).map(Hint::decode).toList();
	}

	private static String encode(List<Hint> hints) {
		return String.join(",", hints.stream().map(Hint::encode).toList());
	}

	private static OffsetDateTime timestamp(Instant instant) {
		return (instant != null) ? OffsetDateTime.ofInstant(instant, ZoneOffset.UTC) : null;
	}

}
