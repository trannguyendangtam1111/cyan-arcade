package com.cyan.arcade.tcg;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

import com.cyan.arcade.IntegrationTest;
import org.flywaydb.core.Flyway;
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
 * V38 on a database at V37 that already has cards (with and without thumbnails) and a player's
 * collection, migrated in a schema of its own; the application's own schema is left alone.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CardsWithoutImagesMigrationTests {

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcTemplate jdbc;

	private final List<String> schemas = new ArrayList<>();

	private String schema;

	private List<String> cardsBefore;

	private List<String> collectionBefore;

	@BeforeAll
	void upgradeAPopulatedDatabaseFromV37() {
		this.schema = "tcg_text_cards_" + UUID.randomUUID().toString().replace("-", "");
		this.schemas.add(this.schema);
		flyway("37").migrate();
		populate();
		this.cardsBefore = cards();
		this.collectionBefore = collection();
		flyway("latest").migrate();
	}

	@AfterAll
	void dropTheSchema() {
		this.schemas.forEach((each) -> this.jdbc.execute("DROP SCHEMA IF EXISTS " + each + " CASCADE"));
	}

	@Test
	void v38AppliesAndLeavesEveryCardAndCollectionAsItWas() {
		assertThat(this.jdbc.queryForObject("SELECT max(version::int) FROM %s.flyway_schema_history WHERE success"
			.formatted(this.schema), Integer.class)).isGreaterThanOrEqualTo(38);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM %s.flyway_schema_history WHERE NOT success"
			.formatted(this.schema), Integer.class)).isZero();

		assertThat(cards()).isEqualTo(this.cardsBefore)
			.contains("alpha-1|https://cards.example/alpha-1/large.png|https://cards.example/alpha-1/small.png",
					"alpha-2|https://cards.example/alpha-2.png|");
		assertThat(collection()).isEqualTo(this.collectionBefore).hasSize(2);
		assertThat(this.jdbc.queryForObject("""
				SELECT is_nullable FROM information_schema.columns
				WHERE table_schema = ? AND table_name = 'tcg_cards' AND column_name = 'image_url'
				""", String.class, this.schema)).isEqualTo("YES");
	}

	@Test
	void aCardWithoutAnImageIsStoredAsNull() {
		insertCard("text-1", null, null);

		assertThat(this.jdbc.queryForObject("SELECT image_url IS NULL AND thumbnail_url IS NULL FROM %s.tcg_cards WHERE external_id = 'text-1'"
			.formatted(this.schema), Boolean.class)).isTrue();
	}

	@Test
	void noPictureIsNeverABlankStringAndAThumbnailNeedsAnImage() {
		assertThatThrownBy(() -> insertCard("blank-image", "  ", null))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_tcg_cards_image_url");
		assertThatThrownBy(() -> insertCard("blank-thumbnail", "https://cards.example/x.png", ""))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_tcg_cards_thumbnail_url");
		assertThatThrownBy(() -> insertCard("thumbnail-only", null, "https://cards.example/x-small.png"))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_tcg_cards_thumbnail_needs_image");
	}

	private void populate() {
		String s = this.schema;
		this.jdbc.update("INSERT INTO %s.users (username, display_name, password_hash, created_at) VALUES ('collector', 'Collector', '{noop}x', now())"
			.formatted(s));
		this.jdbc.update("INSERT INTO %s.tcg_games (slug, name, image_url) VALUES ('migrated', 'Migrated', NULL)".formatted(s));
		this.jdbc.update("""
				INSERT INTO %1$s.tcg_rarities (game_id, code, name, tier)
				SELECT id, 'common', 'Common', 1 FROM %1$s.tcg_games WHERE slug = 'migrated'
				""".formatted(s));
		this.jdbc.update("""
				INSERT INTO %1$s.tcg_sets (game_id, code, name, image_url)
				SELECT id, 'alpha', 'Alpha', NULL FROM %1$s.tcg_games WHERE slug = 'migrated'
				""".formatted(s));
		this.jdbc.update("""
				INSERT INTO %1$s.tcg_cards (game_id, set_id, rarity_id, external_id, card_number, name, image_url, thumbnail_url)
				SELECT g.id, st.id, r.id, v.external_id, v.number, v.name, v.image_url, v.thumbnail_url
				FROM %1$s.tcg_games g
				JOIN %1$s.tcg_sets st ON st.game_id = g.id
				JOIN %1$s.tcg_rarities r ON r.game_id = g.id,
				(VALUES ('alpha-1', '1', 'One', 'https://cards.example/alpha-1/large.png', 'https://cards.example/alpha-1/small.png'),
				        ('alpha-2', '2', 'Two', 'https://cards.example/alpha-2.png', NULL))
				    AS v (external_id, number, name, image_url, thumbnail_url)
				WHERE g.slug = 'migrated'
				""".formatted(s));
		this.jdbc.update("""
				INSERT INTO %1$s.tcg_user_cards (user_id, card_id, quantity, first_obtained_at, last_obtained_at)
				SELECT u.id, c.id, 2, TIMESTAMPTZ '2026-01-01 10:00Z', TIMESTAMPTZ '2026-02-01 10:00Z'
				FROM %1$s.users u, %1$s.tcg_cards c WHERE u.username = 'collector'
				""".formatted(s));
	}

	private void insertCard(String externalId, String imageUrl, String thumbnailUrl) {
		this.jdbc.update("""
				INSERT INTO %1$s.tcg_cards (game_id, set_id, rarity_id, external_id, card_number, name, image_url, thumbnail_url)
				SELECT g.id, st.id, r.id, ?, '9', 'Text', ?, ?
				FROM %1$s.tcg_games g JOIN %1$s.tcg_sets st ON st.game_id = g.id JOIN %1$s.tcg_rarities r ON r.game_id = g.id
				WHERE g.slug = 'migrated'
				""".formatted(this.schema), externalId, imageUrl, thumbnailUrl);
	}

	private List<String> cards() {
		return this.jdbc.queryForList("""
				SELECT external_id || '|' || image_url || '|' || coalesce(thumbnail_url, '')
				FROM %s.tcg_cards WHERE external_id LIKE 'alpha-%%' ORDER BY external_id
				""".formatted(this.schema), String.class);
	}

	private List<String> collection() {
		return this.jdbc.queryForList("""
				SELECT uc.user_id || '|' || c.external_id || '|' || uc.quantity || '|' || uc.first_obtained_at || '|' || uc.last_obtained_at
				FROM %1$s.tcg_user_cards uc JOIN %1$s.tcg_cards c ON c.id = uc.card_id ORDER BY c.external_id
				""".formatted(this.schema), String.class);
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
