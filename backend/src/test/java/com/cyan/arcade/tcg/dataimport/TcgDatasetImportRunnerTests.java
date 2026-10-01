package com.cyan.arcade.tcg.dataimport;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImportRunner.ImportProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.io.ResourceLoader;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * The import job itself: reading dataset files, which is how a card game from outside gets into
 * the arcade. (The datasets bundled with the application went through it when this context started.)
 */
@IntegrationTest
class TcgDatasetImportRunnerTests {

	private static final String DATASET = """
			{
			  "game": { "slug": "file-game", "name": "From A File", "imageUrl": "/file/game.svg" },
			  "rarities": [ { "code": "plain", "name": "Plain", "tier": 1 }, { "code": "shiny", "name": "Shiny", "tier": 4 } ],
			  "sets": [ {
			    "code": "first", "name": "First Set", "imageUrl": "/file/set.svg", "releasedOn": "2026-10-01",
			    "cards": [
			      { "number": "1", "name": "Alpha", "rarity": "plain", "imageUrl": "/file/1.svg", "metadata": { "attack": 3 } },
			      { "number": "2", "name": "Beta", "rarity": "shiny", "imageUrl": "/file/2.svg" }
			    ],
			    "packs": [ {
			      "code": "pack", "name": "Pack", "imageUrl": "/file/pack.svg",
			      "slots": [ { "count": 1, "odds": { "plain": 9, "shiny": 1 } } ],
			      "somethingThisVersionDoesNotKnow": true
			    } ]
			  } ]
			}
			""";

	@Autowired
	private TcgDatasetImporter importer;

	@Autowired
	private JsonMapper json;

	@Autowired
	private ResourceLoader resources;

	@Autowired
	private JdbcTemplate jdbc;

	@TempDir
	Path directory;

	@Test
	void importsTheDatasetFilesItIsPointedAt() throws Exception {
		Path file = Files.writeString(this.directory.resolve("file-game.json"), DATASET);

		runner(false, file).run(new DefaultApplicationArguments());

		assertThat(this.jdbc.queryForObject("SELECT name FROM tcg_games WHERE slug = 'file-game'", String.class))
			.isEqualTo("From A File");
		assertThat(this.jdbc.queryForList("""
				SELECT c.name || ':' || r.code || ':' || c.metadata::text
				FROM tcg_cards c JOIN tcg_rarities r ON r.id = c.rarity_id JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = 'file-game' ORDER BY c.card_number
				""", String.class)).containsExactly("Alpha:plain:{\"attack\": 3}", "Beta:shiny:{}");
		// A pack that lists no cards draws from its whole set.
		assertThat(this.jdbc.queryForObject("""
				SELECT count(*) FROM tcg_pack_cards pc JOIN tcg_packs p ON p.id = pc.pack_id
				JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = 'file-game'
				""", Integer.class)).isEqualTo(2);
	}

	@Test
	void reimportsTheBundledDatasetsWithoutChangingThem() throws Exception {
		int cardsBefore = this.jdbc.queryForObject("SELECT count(*) FROM tcg_cards", Integer.class);

		runner(true).run(new DefaultApplicationArguments());

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_cards", Integer.class)).isEqualTo(cardsBefore);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_games WHERE slug = 'cyan-critters'", Integer.class))
			.isEqualTo(1);
	}

	@Test
	void stopsWithAnExplanationWhenAFileIsNotADataset() throws Exception {
		Path notJson = Files.writeString(this.directory.resolve("broken.json"), "{ \"game\": ");
		Path notADataset = Files.writeString(this.directory.resolve("empty.json"), "{}");

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> runner(false, notJson).run(new DefaultApplicationArguments()))
			.withMessageContaining("broken.json")
			.withMessageContaining("not valid JSON");
		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> runner(false, notADataset).run(new DefaultApplicationArguments()))
			.withMessageContaining("empty.json")
			.satisfies((ex) -> assertThat(ex.getProblems()).anyMatch((problem) -> problem.startsWith("game ")));
	}

	private TcgDatasetImportRunner runner(boolean bundled, Path... files) {
		List<String> paths = List.of(files).stream().map(Path::toString).toList();
		return new TcgDatasetImportRunner(this.importer, this.json, this.resources, new ImportProperties(bundled, paths));
	}

}
