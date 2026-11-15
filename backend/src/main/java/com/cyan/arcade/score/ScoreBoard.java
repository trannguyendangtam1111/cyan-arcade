package com.cyan.arcade.score;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Repository;

/**
 * Rankings, worked out by PostgreSQL from the recorded scores: one row per competitor (their best
 * score in one mode of the game during the window), numbered best first. Nothing is stored; every
 * board is a query over {@code scores}, and no board ever mixes two modes.
 *
 * <p>A competitor is an account, or else a guest's browser id, or else (a guest who sent no id)
 * the run itself. Among a competitor's runs the best counts (the highest, or the lowest for a mode
 * ranked lowest first), and among equal scores the earlier. The order is total (score, then when it
 * was set, then the score's id), so a rank never depends on how the database happens to return
 * rows and pages never overlap or skip anyone.
 */
@Repository
class ScoreBoard {

	/** Who a score counts for. Matches {@link RankedScore#belongsTo}: an account's scores are never a guest's. */
	private static final String COMPETITOR = """
			CASE WHEN user_id IS NOT NULL THEN 'u' || user_id
			     WHEN player_id IS NOT NULL THEN 'g' || player_id
			     ELSE 's' || id END""";

	private final JdbcClient jdbc;

	ScoreBoard(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** One page of the ranking. */
	List<RankedScore> page(Long gameId, ModeSpec mode, Instant since, Instant until, int page, int size) {
		return params(this.jdbc.sql(ranked(mode, since, until) + """
				SELECT rank, score, duration_ms, created_at, user_id, player_id
				FROM ranked
				ORDER BY rank
				LIMIT :size OFFSET :offset
				"""), gameId, mode, since, until)
			.param("size", size)
			.param("offset", (long) page * size)
			.query(ScoreBoard::toRankedScore)
			.list();
	}

	/** How many competitors the ranking has. */
	long count(Long gameId, ModeSpec mode, Instant since, Instant until) {
		return params(this.jdbc.sql("SELECT count(DISTINCT " + COMPETITOR
				+ ") FROM scores WHERE game_id = :gameId AND mode = :mode" + window(since, until)), gameId, mode, since,
				until)
			.query(Long.class)
			.single();
	}

	/**
	 * Where one competitor stands.
	 * @param userId a signed-in caller, or {@code null}
	 * @param playerId a guest caller's browser id, used only when there is no {@code userId}
	 * @return their rank and best score, or empty when they have no score in the window
	 */
	Optional<PlayerBest> standing(Long gameId, ModeSpec mode, Instant since, Instant until, Long userId,
			UUID playerId) {
		String competitor = (userId != null) ? "u" + userId : (playerId != null) ? "g" + playerId : null;
		if (competitor == null) {
			return Optional.empty();
		}
		return params(this.jdbc.sql(ranked(mode, since, until)
				+ "SELECT rank, score FROM ranked WHERE competitor = :competitor"), gameId, mode, since, until)
			.param("competitor", competitor)
			.query((row, index) -> new PlayerBest(row.getInt("score"), row.getLong("rank")))
			.optional();
	}

	/**
	 * Every competitor's best score in the window ({@code DISTINCT ON}), then their place among the
	 * others ({@code row_number}), both in the mode's order.
	 */
	private static String ranked(ModeSpec mode, Instant since, Instant until) {
		String order = orderOf(mode);
		return """
				WITH best AS (
				    SELECT DISTINCT ON (competitor) id, score, duration_ms, created_at, user_id, player_id, competitor
				    FROM (SELECT scores.*, %s AS competitor FROM scores WHERE game_id = :gameId AND mode = :mode%s) entries
				    ORDER BY competitor, %s
				), ranked AS (
				    SELECT best.*, row_number() OVER (ORDER BY %s) AS rank FROM best
				)
				""".formatted(COMPETITOR, window(since, until), order, order);
	}

	/**
	 * The ranking order, chosen from the mode's declared {@link ModeSpec.Order}: fixed text, never
	 * anything a request carries. Ties go to whoever set the score first, then to the older score.
	 */
	static String orderOf(ModeSpec mode) {
		return switch (mode.order()) {
			case DESC -> "score DESC, created_at, id";
			case ASC -> "score ASC, created_at, id";
		};
	}

	/** The time condition, served by the index on {@code (game_id, mode, created_at)}; none for all time. */
	private static String window(Instant since, Instant until) {
		return ((since != null) ? " AND created_at >= :since" : "") + ((until != null) ? " AND created_at < :until" : "");
	}

	private static StatementSpec params(StatementSpec statement, Long gameId, ModeSpec mode, Instant since,
			Instant until) {
		statement = statement.param("gameId", gameId).param("mode", mode.id());
		if (since != null) {
			statement = statement.param("since", OffsetDateTime.ofInstant(since, ZoneOffset.UTC));
		}
		if (until != null) {
			statement = statement.param("until", OffsetDateTime.ofInstant(until, ZoneOffset.UTC));
		}
		return statement;
	}

	private static RankedScore toRankedScore(ResultSet row, int index) throws SQLException {
		return new RankedScore(row.getLong("rank"), row.getInt("score"), row.getLong("duration_ms"),
				row.getObject("created_at", OffsetDateTime.class).toInstant(), row.getObject("user_id", Long.class),
				row.getObject("player_id", UUID.class));
	}

}
