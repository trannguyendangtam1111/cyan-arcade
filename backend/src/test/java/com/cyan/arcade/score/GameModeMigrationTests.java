package com.cyan.arcade.score;

import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import com.cyan.arcade.IntegrationTest;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V28 against a database that already holds runs, as production does: the schema is migrated to
 * V27 in a schema of its own, given a finished run, then upgraded. The application's own schema is
 * left alone.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class GameModeMigrationTests {

	private final String schema = "mode_upgrade_" + UUID.randomUUID().toString().replace("-", "");

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcTemplate jdbc;

	private UUID legacySession;

	@BeforeAll
	void upgradeADatabaseThatAlreadyHasRuns() {
		flyway("27").migrate();
		Long snake = this.jdbc.queryForObject("SELECT id FROM %s.games WHERE slug = 'snake'".formatted(this.schema),
				Long.class);
		this.legacySession = UUID.randomUUID();
		this.jdbc.update("""
				INSERT INTO %s.game_sessions (id, game_id, started_at, finished_at)
				VALUES (?, ?, now() - interval '5 minutes', now())
				""".formatted(this.schema), this.legacySession, snake);
		this.jdbc.update("""
				INSERT INTO %s.scores (game_session_id, game_id, score, duration_ms, created_at)
				VALUES (?, ?, 42, 300000, now())
				""".formatted(this.schema), this.legacySession, snake);

		flyway("latest").migrate();
	}

	@AfterAll
	void dropTheUpgradedSchema() {
		this.jdbc.execute("DROP SCHEMA IF EXISTS " + this.schema + " CASCADE");
	}

	@Test
	void runsRecordedBeforeModesExistedAreClassic() {
		assertThat(this.jdbc.queryForObject("SELECT mode FROM %s.game_sessions WHERE id = ?".formatted(this.schema),
				String.class, this.legacySession))
			.isEqualTo("classic");
		assertThat(this.jdbc.queryForObject(
				"SELECT mode FROM %s.scores WHERE game_session_id = ?".formatted(this.schema), String.class,
				this.legacySession))
			.isEqualTo("classic");
	}

	@Test
	void anInsertThatDoesNotNameAModeIsClassic() {
		// What a backend from before V28 does during a rollout or after a rollback.
		UUID session = insertSession(null);
		this.jdbc.update("""
				INSERT INTO %s.scores (game_session_id, game_id, score, duration_ms, created_at)
				SELECT id, game_id, 3, 1000, now() FROM %s.game_sessions WHERE id = ?
				""".formatted(this.schema, this.schema), session);

		assertThat(this.jdbc.queryForMap("""
				SELECT s.mode AS session_mode, sc.mode AS score_mode
				FROM %s.game_sessions s JOIN %s.scores sc ON sc.game_session_id = s.id
				WHERE s.id = ?
				""".formatted(this.schema, this.schema), session))
			.isEqualTo(Map.of("session_mode", "classic", "score_mode", "classic"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "classic", "ultra", "no-guess-expert", "x", "abcdefghijklmnopqrstuvwx" })
	void wellFormedModesAreStored(String mode) {
		UUID session = insertSession(mode);

		assertThat(this.jdbc.queryForObject("SELECT mode FROM %s.game_sessions WHERE id = ?".formatted(this.schema),
				String.class, session))
			.isEqualTo(mode);
	}

	@ParameterizedTest
	@ValueSource(strings = { "Classic", "", " ", "1v1", "-ultra", "ultra_mode", "ultra mode", "abcdefghijklmnopqrstuvwxy" })
	void malformedModesAreRefusedByTheDatabase(String mode) {
		assertThatThrownBy(() -> insertSession(mode)).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> this.jdbc.update(
				"UPDATE %s.scores SET mode = ? WHERE game_session_id = ?".formatted(this.schema), mode,
				this.legacySession))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void aModeCannotBeEmptied() {
		assertThatThrownBy(() -> this.jdbc.update(
				"UPDATE %s.game_sessions SET mode = NULL WHERE id = ?".formatted(this.schema), this.legacySession))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> this.jdbc.update(
				"UPDATE %s.scores SET mode = NULL WHERE game_session_id = ?".formatted(this.schema),
				this.legacySession))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	/** Inserts an unfinished run of Snake, naming the given mode, or leaving it out when {@code null}. */
	private UUID insertSession(String mode) {
		UUID id = UUID.randomUUID();
		if (mode == null) {
			this.jdbc.update("""
					INSERT INTO %s.game_sessions (id, game_id, started_at)
					SELECT ?, id, now() FROM %s.games WHERE slug = 'snake'
					""".formatted(this.schema, this.schema), id);
		}
		else {
			this.jdbc.update("""
					INSERT INTO %s.game_sessions (id, game_id, started_at, mode)
					SELECT ?, id, now(), ? FROM %s.games WHERE slug = 'snake'
					""".formatted(this.schema, this.schema), id, mode);
		}
		return id;
	}

	private Flyway flyway(String target) {
		return Flyway.configure()
			.dataSource(this.dataSource)
			.schemas(this.schema)
			.locations("classpath:db/migration")
			.target(target)
			.load();
	}

}
