package com.cyan.arcade.chess;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.cyan.arcade.chess.ChessMatch.Mode;
import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessMatch.Status;
import com.cyan.arcade.chess.analysis.Difficulty;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Termination;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Chess matches ({@code chess_matches}). Moves are kept as space-separated UCI text in the order
 * played. Partial unique indexes allow one match in progress per player.
 */
@Repository
class ChessMatchStore {

	private static final String COLUMNS = """
			id, mode, status, moves, undone, draw_offer, winner, termination, revision, user_id, player_id, created_at,
			updated_at, finished_at, engine_side, engine_difficulty, hints_used""";

	private final JdbcClient jdbc;

	ChessMatchStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** @return {@code false} when the player has a match in progress already (the unique index decides) */
	boolean insert(ChessMatch match) {
		return this.jdbc.sql("""
				INSERT INTO chess_matches (%s)
				VALUES (:id, :mode, :status, :moves, :undone, :drawOffer, :winner, :termination, :revision, :userId,
				        :playerId, :createdAt, :updatedAt, :finishedAt, :engineSide, :difficulty, :hintsUsed)
				ON CONFLICT DO NOTHING
				""".formatted(COLUMNS))
			.param("id", match.id())
			.param("mode", match.mode().name())
			.param("status", match.status().name())
			.param("moves", encode(match.moves()))
			.param("undone", encode(match.undone()))
			.param("drawOffer", name(match.drawOffer()))
			.param("winner", name(match.winner()))
			.param("termination", name(match.termination()))
			.param("revision", match.revision())
			.param("userId", match.userId())
			.param("playerId", match.playerId())
			.param("createdAt", timestamp(match.createdAt()))
			.param("updatedAt", timestamp(match.updatedAt()))
			.param("finishedAt", timestamp(match.finishedAt()))
			.param("engineSide", name(match.engineSide()))
			.param("difficulty", name(match.difficulty()))
			.param("hintsUsed", match.hintsUsed())
			.update() == 1;
	}

	/** Loads a match and locks it until the transaction ends, so its actions are judged one at a time. */
	Optional<ChessMatch> findForUpdate(UUID id) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM chess_matches WHERE id = :id FOR UPDATE")
			.param("id", id)
			.query(ChessMatchStore::map)
			.optional();
	}

	Optional<ChessMatch> find(UUID id) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM chess_matches WHERE id = :id")
			.param("id", id)
			.query(ChessMatchStore::map)
			.optional();
	}

	/** The player's latest match that was not left for another: the one in progress, or the last one finished. */
	Optional<ChessMatch> findCurrent(Owner owner) {
		return this.jdbc.sql("SELECT " + COLUMNS + " FROM chess_matches WHERE status <> 'ABANDONED' AND "
				+ ownerCondition(owner) + " ORDER BY (status = 'ACTIVE') DESC, updated_at DESC LIMIT 1")
			.params(ownerParams(owner))
			.query(ChessMatchStore::map)
			.optional();
	}

	/** Leaves the player's match in progress, if any, for a new one. */
	int abandonActive(Owner owner, Instant now) {
		return this.jdbc.sql("""
				UPDATE chess_matches SET status = 'ABANDONED', draw_offer = NULL, undone = '', revision = revision + 1,
				                         updated_at = :now, finished_at = :now
				WHERE status = 'ACTIVE' AND""" + " " + ownerCondition(owner))
			.param("now", timestamp(now))
			.params(ownerParams(owner))
			.update();
	}

	/** Saves a match after an action: its moves, where it stands and its revision. */
	void save(ChessMatch match) {
		this.jdbc.sql("""
				UPDATE chess_matches SET status = :status, moves = :moves, undone = :undone, draw_offer = :drawOffer,
				                         winner = :winner, termination = :termination, revision = :revision,
				                         updated_at = :updatedAt, finished_at = :finishedAt
				WHERE id = :id
				""")
			.param("status", match.status().name())
			.param("moves", encode(match.moves()))
			.param("undone", encode(match.undone()))
			.param("drawOffer", name(match.drawOffer()))
			.param("winner", name(match.winner()))
			.param("termination", name(match.termination()))
			.param("revision", match.revision())
			.param("updatedAt", timestamp(match.updatedAt()))
			.param("finishedAt", timestamp(match.finishedAt()))
			.param("id", match.id())
			.update();
	}

	/**
	 * Counts one more hint given. The board does not change, so neither does the revision: a move
	 * chosen before the hint is still a move for this position.
	 */
	void countHint(UUID id) {
		this.jdbc.sql("UPDATE chess_matches SET hints_used = hints_used + 1 WHERE id = :id").param("id", id).update();
	}

	/** Forgets matches nobody has touched since then. Local games count for nothing once left. */
	int deleteUntouchedSince(Instant before) {
		return this.jdbc.sql("DELETE FROM chess_matches WHERE updated_at < :before")
			.param("before", timestamp(before))
			.update();
	}

	private static String ownerCondition(Owner owner) {
		return (owner.userId() != null) ? "user_id = :userId" : "user_id IS NULL AND player_id = :playerId";
	}

	private static Map<String, Object> ownerParams(Owner owner) {
		return (owner.userId() != null) ? Map.of("userId", owner.userId()) : Map.of("playerId", owner.playerId());
	}

	private static ChessMatch map(ResultSet row, int index) throws SQLException {
		String drawOffer = row.getString("draw_offer");
		String winner = row.getString("winner");
		String termination = row.getString("termination");
		String engineSide = row.getString("engine_side");
		String difficulty = row.getString("engine_difficulty");
		return new ChessMatch(row.getObject("id", UUID.class), Mode.valueOf(row.getString("mode")),
				Status.valueOf(row.getString("status")), decode(row.getString("moves")),
				decode(row.getString("undone")), (drawOffer != null) ? Color.valueOf(drawOffer) : null,
				(winner != null) ? Color.valueOf(winner) : null,
				(termination != null) ? Termination.valueOf(termination) : null, row.getInt("revision"),
				row.getObject("user_id", Long.class), row.getObject("player_id", UUID.class),
				instant(row, "created_at"), instant(row, "updated_at"), instant(row, "finished_at"),
				(engineSide != null) ? Color.valueOf(engineSide) : null,
				(difficulty != null) ? Difficulty.valueOf(difficulty) : null, row.getInt("hints_used"));
	}

	static String encode(List<Move> moves) {
		return moves.stream().map(Move::uci).collect(Collectors.joining(" "));
	}

	static List<Move> decode(String text) {
		return (text == null || text.isBlank()) ? List.of() : Arrays.stream(text.trim().split(" ")).map(Move::parse).toList();
	}

	private static String name(Enum<?> value) {
		return (value != null) ? value.name() : null;
	}

	private static Instant instant(ResultSet row, String column) throws SQLException {
		OffsetDateTime value = row.getObject(column, OffsetDateTime.class);
		return (value != null) ? value.toInstant() : null;
	}

	private static OffsetDateTime timestamp(Instant instant) {
		return (instant != null) ? OffsetDateTime.ofInstant(instant, ZoneOffset.UTC) : null;
	}

}
