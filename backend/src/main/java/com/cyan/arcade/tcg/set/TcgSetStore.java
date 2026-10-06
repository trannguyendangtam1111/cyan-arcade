package com.cyan.arcade.tcg.set;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.cyan.arcade.tcg.game.GameRef;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Reads sets. Only the sets of active games are ever returned. */
@Repository
class TcgSetStore {

	private static final String SELECT_SETS = """
			SELECT s.id, s.code, s.name, s.description, s.series, s.image_url, s.cover_image_url, s.released_on,
			       g.slug AS game_slug, g.name AS game_name,
			       (SELECT count(*) FROM tcg_cards c WHERE c.set_id = s.id) AS card_count,
			       (SELECT count(*) FROM tcg_packs p WHERE p.set_id = s.id AND p.active) AS pack_count
			FROM tcg_sets s
			JOIN tcg_games g ON g.id = s.game_id
			WHERE g.active
			""";

	private static final String IN_ORDER = " ORDER BY g.display_order, g.name, s.display_order, s.name";

	private final JdbcClient jdbc;

	TcgSetStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<TcgSetResponse> findAll() {
		return this.jdbc.sql(SELECT_SETS + IN_ORDER).query(TcgSetStore::toSet).list();
	}

	List<TcgSetResponse> findByGame(String gameSlug) {
		return this.jdbc.sql(SELECT_SETS + " AND g.slug = :gameSlug" + IN_ORDER)
			.param("gameSlug", gameSlug)
			.query(TcgSetStore::toSet)
			.list();
	}

	Optional<TcgSetResponse> findById(Long id) {
		return this.jdbc.sql(SELECT_SETS + " AND s.id = :id").param("id", id).query(TcgSetStore::toSet).optional();
	}

	private static TcgSetResponse toSet(ResultSet row, int index) throws SQLException {
		return new TcgSetResponse(row.getLong("id"), row.getString("code"), row.getString("name"),
				row.getString("description"), row.getString("series"), row.getString("image_url"),
				row.getString("cover_image_url"), row.getObject("released_on", LocalDate.class),
				new GameRef(row.getString("game_slug"), row.getString("game_name")), row.getInt("card_count"),
				row.getInt("pack_count"));
	}

}
