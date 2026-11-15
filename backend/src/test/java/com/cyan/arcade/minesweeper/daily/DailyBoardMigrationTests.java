package com.cyan.arcade.minesweeper.daily;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import javax.sql.DataSource;

import com.cyan.arcade.IntegrationTest;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V31 against databases as they can be found: one still at V27 (production, before any Minesweeper
 * Daily Board), and one at V30 that already holds boards, attempts and rewards. Each is migrated in a
 * schema of its own; the application's own schema is left alone.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DailyBoardMigrationTests {

	private static final UUID ALICE_WON = UUID.fromString("00000000-0000-4000-8000-000000000001");
	private static final UUID ALICE_PLAYING = UUID.fromString("00000000-0000-4000-8000-000000000002");
	private static final UUID BOB_LOST = UUID.fromString("00000000-0000-4000-8000-000000000003");
	private static final UUID CAROL_EXPIRED = UUID.fromString("00000000-0000-4000-8000-000000000004");

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcTemplate jdbc;

	private final List<String> schemas = new ArrayList<>();

	/** Upgraded from V27, with no Minesweeper Daily tables before. */
	private String fresh;

	/** Upgraded from V30, with V30 rows. */
	private String populated;

	private V30Snapshot before;

	@BeforeAll
	void upgradeBothKindsOfDatabase() {
		this.fresh = newSchema();
		flyway(this.fresh, "27").migrate();
		flyway(this.fresh, "latest").migrate();

		this.populated = newSchema();
		flyway(this.populated, "30").migrate();
		populateV30(this.populated);
		this.before = snapshot(this.populated, "minesweeper_daily_boards", "minesweeper_daily_attempts");
		flyway(this.populated, "latest").migrate();
	}

	@AfterAll
	void dropTheUpgradedSchemas() {
		this.schemas.forEach((schema) -> this.jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE"));
	}

	@Test
	void aDatabaseAtV27UpgradesToTheLatestVersionWithEmptyTables() {
		assertThat(highestVersion(this.fresh)).isEqualTo(latestVersion());
		assertThat(failedMigrations(this.fresh)).isZero();
		for (String table : List.of("minesweeper_daily_boards", "minesweeper_daily_attempts",
				"minesweeper_daily_legacy_boards", "minesweeper_daily_legacy_attempts")) {
			assertThat(count(this.fresh, table)).as(table).isZero();
		}
		assertThat(columns(this.fresh, "minesweeper_daily_attempts")).contains("start_cell smallint NO",
				"reward_xp integer YES", "reward_coins integer YES").noneMatch((column) -> column.startsWith("first_cell"));
		assertThat(columns(this.fresh, "minesweeper_daily_boards")).contains("start_cell smallint NO",
				"mine_cells ARRAY NO");
	}

	@Test
	void everyV30BoardAndAttemptIsArchivedExactlyAndLeavesTheActiveTables() {
		V30Snapshot archived = snapshot(this.populated, "minesweeper_daily_legacy_boards",
				"minesweeper_daily_legacy_attempts");

		assertThat(archived.boardRows()).isEqualTo(this.before.boardRows());
		assertThat(archived.attemptRows()).isEqualTo(this.before.attemptRows());
		// Same column names, types and nullability as V30 had: first_cell keeps its name and stays optional.
		assertThat(archived.boardColumns()).isEqualTo(this.before.boardColumns());
		assertThat(archived.attemptColumns()).isEqualTo(this.before.attemptColumns());
		assertThat(count(this.populated, "minesweeper_daily_legacy_boards")).isEqualTo(2);
		assertThat(count(this.populated, "minesweeper_daily_legacy_attempts")).isEqualTo(4);
		assertThat(this.jdbc.queryForList("""
				SELECT id || ' ' || user_id || ' ' || board_date || ' ' || status || ' ' || coalesce(first_cell::text, '-')
				    || ' ' || coalesce(elapsed_ms::text, '-')
				FROM %s.minesweeper_daily_legacy_attempts ORDER BY id
				""".formatted(this.populated), String.class))
			.containsExactly(ALICE_WON + " 1 2026-11-01 WON 17 93500", ALICE_PLAYING + " 1 2026-11-02 PLAYING - -",
					BOB_LOST + " 2 2026-11-01 LOST 0 -", CAROL_EXPIRED + " 3 2026-11-02 EXPIRED 5 -");

		assertThat(count(this.populated, "minesweeper_daily_boards")).isZero();
		assertThat(count(this.populated, "minesweeper_daily_attempts")).isZero();
	}

	@Test
	void noRewardIsAddedOrLost() {
		V30Snapshot after = snapshot(this.populated, "minesweeper_daily_boards", "minesweeper_daily_attempts");

		assertThat(after.experience()).isEqualTo(this.before.experience());
		assertThat(after.wallets()).isEqualTo(this.before.wallets());
		assertThat(after.coinTransactions()).isEqualTo(this.before.coinTransactions());
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM %s.coin_transactions WHERE reference_type = 'MINESWEEPER_DAILY_BOARD'"
					.formatted(this.populated), Integer.class))
			.isZero();
	}

	@Test
	void anArchivedDateIsPlayedAgainOnTheSharedLayoutAndPaidOnce() {
		String schema = upgradedPopulatedSchema();
		this.jdbc.update("""
				INSERT INTO %s.minesweeper_daily_boards (board_date, board_number, board_rows, board_columns, mines,
				    seed, layout_version, created_at, start_cell, mine_cells)
				VALUES (DATE '2026-11-01', 300, 16, 16, 40, 7, 2, now(), 0, ARRAY(SELECT generate_series(200, 239))::smallint[])
				""".formatted(schema));
		this.jdbc.update("""
				INSERT INTO %s.minesweeper_daily_attempts (id, board_date, user_id, status, start_cell, cells, moves,
				    revealed_cells, flags, started_at, finished_at, elapsed_ms, reward_xp, reward_coins)
				VALUES (gen_random_uuid(), DATE '2026-11-01', 1, 'WON', 0, repeat('0', 256), 9, 216, 40,
				    now() - interval '2 minutes', now(), 120000, 50, 25)
				""".formatted(schema));
		String reward = """
				INSERT INTO %s.coin_transactions (user_id, amount, balance_after, type, reference_type, reference_id,
				    description, created_at)
				VALUES (1, 25, 25, 'GAME_COMPLETION', 'MINESWEEPER_DAILY_BOARD', '2026-11-01', 'Won', now())
				""".formatted(schema);
		this.jdbc.update(reward);

		assertThatThrownBy(() -> this.jdbc.update(reward)).isInstanceOf(DataIntegrityViolationException.class);
		assertThat(this.jdbc.queryForObject("""
				SELECT count(*) FROM %s.coin_transactions
				WHERE reference_type = 'MINESWEEPER_DAILY_BOARD' AND reference_id = '2026-11-01'
				""".formatted(schema), Integer.class))
			.isOne();
		// The archived attempt on that date is untouched by the new one.
		assertThat(snapshot(schema, "minesweeper_daily_legacy_boards", "minesweeper_daily_legacy_attempts").attemptRows())
			.isEqualTo(this.before.attemptRows());
	}

	@Test
	void flywayValidatesTheUpgradedDatabasesAgainAndAgain() {
		for (String schema : List.of(this.fresh, this.populated)) {
			for (int run = 0; run < 2; run++) {
				assertThat(flyway(schema, "latest").validateWithResult().validationSuccessful)
					.as("%s, validation %d", schema, run + 1)
					.isTrue();
			}
			assertThat(flyway(schema, "latest").migrate().migrationsExecuted).isZero();
			assertThat(flyway(schema, "latest").info().pending()).isEmpty();
			assertThat(failedMigrations(schema)).isZero();
		}
	}

	@Test
	void deletingAnAccountDeletesItsArchivedAttemptsOnly() {
		String schema = upgradedPopulatedSchema();

		this.jdbc.update("DELETE FROM %s.users WHERE id = 1".formatted(schema));

		assertThat(this.jdbc.queryForList("SELECT id FROM %s.minesweeper_daily_legacy_attempts ORDER BY id"
			.formatted(schema), UUID.class)).containsExactly(BOB_LOST, CAROL_EXPIRED);
		assertThat(count(schema, "minesweeper_daily_legacy_boards")).isEqualTo(2);
	}

	@Test
	void anArchivedBoardStaysWhileItHasArchivedAttempts() {
		String schema = upgradedPopulatedSchema();

		assertThatThrownBy(() -> this.jdbc.update(
				"DELETE FROM %s.minesweeper_daily_legacy_boards WHERE board_date = DATE '2026-11-01'".formatted(schema)))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThat(count(schema, "minesweeper_daily_legacy_boards")).isEqualTo(2);
	}

	@Test
	void theArchiveKeepsV30sRules() {
		String insert = """
				INSERT INTO %s.minesweeper_daily_legacy_attempts (id, board_date, user_id, status, first_cell, cells,
				    moves, revealed_cells, flags, started_at)
				VALUES (gen_random_uuid(), ?, ?, 'PLAYING', NULL, 'H', 0, 0, 0, now())
				""".formatted(this.populated);

		// One attempt per account and date.
		assertThatThrownBy(() -> this.jdbc.update(insert, java.sql.Date.valueOf("2026-11-01"), 1))
			.isInstanceOf(DataIntegrityViolationException.class);
		// Only on an archived board.
		assertThatThrownBy(() -> this.jdbc.update(insert, java.sql.Date.valueOf("2026-11-03"), 1))
			.isInstanceOf(DataIntegrityViolationException.class);
		// Only for an account that exists.
		assertThatThrownBy(() -> this.jdbc.update(insert, java.sql.Date.valueOf("2026-11-02"), 999))
			.isInstanceOf(DataIntegrityViolationException.class);
		// A win keeps its time and first cell.
		assertThatThrownBy(() -> this.jdbc.update("""
				UPDATE %s.minesweeper_daily_legacy_attempts SET elapsed_ms = NULL WHERE id = ?
				""".formatted(this.populated), ALICE_WON))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThat(count(this.populated, "minesweeper_daily_legacy_attempts")).isEqualTo(4);
	}

	@Test
	void aFailedArchiveLeavesTheV30DatabaseAsItWas() {
		String schema = newSchema();
		flyway(schema, "30").migrate();
		populateV30(schema);
		V30Snapshot atV30 = snapshot(schema, "minesweeper_daily_boards", "minesweeper_daily_attempts");
		// Something in the way of the archive, so that V31 fails part-way through.
		this.jdbc.execute("CREATE TABLE %s.minesweeper_daily_legacy_attempts (blocker INTEGER)".formatted(schema));

		assertThatThrownBy(() -> flyway(schema, "latest").migrate()).isInstanceOf(FlywayException.class);

		assertThat(highestVersion(schema)).isEqualTo("30");
		assertThat(failedMigrations(schema)).isZero();
		assertThat(this.jdbc.queryForObject("SELECT to_regclass('%s.minesweeper_daily_legacy_boards')::text"
			.formatted(schema), String.class)).isNull();
		assertThat(snapshot(schema, "minesweeper_daily_boards", "minesweeper_daily_attempts")).isEqualTo(atV30);

		this.jdbc.execute("DROP TABLE %s.minesweeper_daily_legacy_attempts".formatted(schema));
		flyway(schema, "latest").migrate();
		V30Snapshot archived = snapshot(schema, "minesweeper_daily_legacy_boards", "minesweeper_daily_legacy_attempts");
		assertThat(archived.boardRows()).isEqualTo(atV30.boardRows());
		assertThat(archived.attemptRows()).isEqualTo(atV30.attemptRows());
		assertThat(highestVersion(schema)).isEqualTo(latestVersion());
	}

	/** Three accounts with a V30 board each day of two, in every state an attempt can be in. */
	private void populateV30(String schema) {
		this.jdbc.update("""
				INSERT INTO %s.users (id, username, display_name, password_hash, xp, created_at)
				VALUES (1, 'alice', 'Alice', '{noop}x', 120, TIMESTAMPTZ '2026-10-01 09:00:00+00'),
				       (2, 'bob', 'Bob', '{noop}x', 0, TIMESTAMPTZ '2026-10-02 09:00:00+00'),
				       (3, 'carol', 'Carol', '{noop}x', 400, TIMESTAMPTZ '2026-10-03 09:00:00+00')
				""".formatted(schema));
		this.jdbc.update("""
				INSERT INTO %s.user_wallets (user_id, balance, updated_at)
				VALUES (3, 150, TIMESTAMPTZ '2026-10-20 10:00:00.5+00')
				""".formatted(schema));
		this.jdbc.update("""
				INSERT INTO %s.coin_transactions (user_id, amount, balance_after, type, reference_type, reference_id,
				    description, created_at)
				VALUES (3, 150, 150, 'GAME_COMPLETION', 'GAME_SESSION', '6f1c1d6e-7a50-4a7e-9a35-8b2f8c4a1e11',
				    'Played Minesweeper', TIMESTAMPTZ '2026-10-20 10:00:00.5+00')
				""".formatted(schema));
		this.jdbc.update("""
				INSERT INTO %s.minesweeper_daily_boards (board_date, board_number, board_rows, board_columns, mines, seed,
				    layout_version, created_at)
				VALUES (DATE '2026-11-01', 300, 16, 16, 40, 123456789, 1, TIMESTAMPTZ '2026-11-01 00:00:00.123456+00'),
				       (DATE '2026-11-02', 301, 16, 16, 40, 4294967295, 1, TIMESTAMPTZ '2026-11-02 00:00:01.654321+00')
				""".formatted(schema));
		this.jdbc.update("""
				INSERT INTO %s.minesweeper_daily_attempts (id, board_date, user_id, status, first_cell, cells, moves,
				    revealed_cells, flags, started_at, finished_at, elapsed_ms)
				VALUES (?, DATE '2026-11-01', 1, 'WON', 17, repeat('1', 216) || repeat('F', 40), 61, 216, 40,
				        TIMESTAMPTZ '2026-11-01 08:15:30.123456+00', TIMESTAMPTZ '2026-11-01 08:17:03.623456+00', 93500),
				       (?, DATE '2026-11-02', 1, 'PLAYING', NULL, repeat('H', 256), 0, 0, 0,
				        TIMESTAMPTZ '2026-11-02 07:00:00+00', NULL, NULL),
				       (?, DATE '2026-11-01', 2, 'LOST', 0, '0X' || repeat('H', 254), 2, 1, 0,
				        TIMESTAMPTZ '2026-11-01 12:00:00+00', TIMESTAMPTZ '2026-11-01 12:00:04+00', NULL),
				       (?, DATE '2026-11-02', 3, 'EXPIRED', 5, '00F' || repeat('H', 253), 4, 2, 1,
				        TIMESTAMPTZ '2026-11-02 01:00:00+00', TIMESTAMPTZ '2026-11-03 00:00:00+00', NULL)
				""".formatted(schema), ALICE_WON, ALICE_PLAYING, BOB_LOST, CAROL_EXPIRED);
	}

	private String upgradedPopulatedSchema() {
		String schema = newSchema();
		flyway(schema, "30").migrate();
		populateV30(schema);
		flyway(schema, "latest").migrate();
		return schema;
	}

	/** Every row and column definition of two board and attempt tables, and the rewards around them. */
	private V30Snapshot snapshot(String schema, String boards, String attempts) {
		return new V30Snapshot(rows(schema, boards, "board_date"), rows(schema, attempts, "id"),
				columns(schema, boards), columns(schema, attempts),
				this.jdbc.queryForList("SELECT id || ':' || xp FROM %s.users ORDER BY id".formatted(schema), String.class),
				rows(schema, "user_wallets", "user_id"), rows(schema, "coin_transactions", "id"));
	}

	private String rows(String schema, String table, String order) {
		return this.jdbc.queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.%s), '[]')::text FROM %s.%s t"
			.formatted(order, schema, table), String.class);
	}

	private List<String> columns(String schema, String table) {
		return this.jdbc.queryForList("""
				SELECT column_name || ' ' || data_type || ' ' || is_nullable
				    || coalesce(' ' || character_maximum_length, '')
				FROM information_schema.columns WHERE table_schema = ? AND table_name = ?
				ORDER BY ordinal_position
				""", String.class, schema, table);
	}

	private int count(String schema, String table) {
		return this.jdbc.queryForObject("SELECT count(*) FROM %s.%s".formatted(schema, table), Integer.class);
	}

	private String highestVersion(String schema) {
		return this.jdbc.queryForObject("""
				SELECT max(version::int)::text FROM %s.flyway_schema_history WHERE success AND version ~ '^[0-9]+$'
				""".formatted(schema), String.class);
	}

	/** The newest migration on the classpath, which "latest" upgrades to. */
	private String latestVersion() {
		return Arrays.stream(flyway(this.fresh, "latest").info().all())
			.map(MigrationInfo::getVersion)
			.filter(Objects::nonNull)
			.max(Comparator.naturalOrder())
			.map(MigrationVersion::getVersion)
			.orElseThrow();
	}

	private int failedMigrations(String schema) {
		return this.jdbc.queryForObject("SELECT count(*) FROM %s.flyway_schema_history WHERE NOT success"
			.formatted(schema), Integer.class);
	}

	private String newSchema() {
		String schema = "ms_daily_upgrade_" + UUID.randomUUID().toString().replace("-", "");
		this.schemas.add(schema);
		return schema;
	}

	private Flyway flyway(String schema, String target) {
		return Flyway.configure()
			.dataSource(this.dataSource)
			.schemas(schema)
			.locations("classpath:db/migration")
			.target(target)
			.load();
	}

	private record V30Snapshot(String boardRows, String attemptRows, List<String> boardColumns,
			List<String> attemptColumns, List<String> experience, String wallets, String coinTransactions) {
	}

}
