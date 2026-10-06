package com.cyan.arcade.tcg.dataimport;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImportRunner.ImportProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * The import job itself: reading dataset files, and running the card game sources it is told to
 * run, and only those. An ordinary start runs none (this test context started that way).
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
	private ApplicationContext context;

	@Autowired
	private JdbcTemplate jdbc;

	@TempDir
	Path directory;

	@Test
	void importsTheDatasetFilesItIsPointedAt() throws Exception {
		Path file = Files.writeString(this.directory.resolve("file-game.json"), DATASET);

		runner(file).run(new DefaultApplicationArguments());

		assertThat(this.jdbc.queryForObject("SELECT name FROM tcg_games WHERE slug = 'file-game'", String.class))
			.isEqualTo("From A File");
		assertThat(this.jdbc.queryForList("""
				SELECT c.external_id || ':' || c.name || ':' || r.code || ':' || c.metadata::text
				FROM tcg_cards c JOIN tcg_rarities r ON r.id = c.rarity_id JOIN tcg_games g ON g.id = c.game_id
				WHERE g.slug = 'file-game' ORDER BY c.display_order
				""", String.class)).containsExactly("first-1:Alpha:plain:{\"attack\": 3}", "first-2:Beta:shiny:{}");
		// A pack that lists no cards draws from its whole set.
		assertThat(this.jdbc.queryForObject("""
				SELECT count(*) FROM tcg_pack_cards pc JOIN tcg_packs p ON p.id = pc.pack_id
				JOIN tcg_sets s ON s.id = p.set_id JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = 'file-game'
				""", Integer.class)).isEqualTo(2);
	}

	@Test
	void runsTheSourcesItIsToldToRunAndOnlyThose() throws Exception {
		FakeSource wanted = new FakeSource("wanted", () -> sourceGame("runner-wanted"));
		FakeSource other = new FakeSource("other", () -> sourceGame("runner-other"));

		runnerOf(List.of(wanted, other), "wanted").run(new DefaultApplicationArguments());

		assertThat(wanted.fetches).isEqualTo(1);
		assertThat(other.fetches).isZero();
		assertThat(this.jdbc.queryForMap("SELECT name, accent_color, attribution FROM tcg_games WHERE slug = 'runner-wanted'"))
			.containsEntry("name", "From A Source")
			.containsEntry("accent_color", "#336699")
			.containsEntry("attribution", "Test data.");
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_games WHERE slug = 'runner-other'", Integer.class))
			.isZero();

		// Running it again is how a catalog is brought up to date: nothing is duplicated.
		runnerOf(List.of(wanted, other), "wanted").run(new DefaultApplicationArguments());
		assertThat(this.jdbc.queryForObject("""
				SELECT count(*) FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = 'runner-wanted'
				""", Integer.class)).isEqualTo(1);
	}

	@Test
	void anOrdinaryStartAsksNoSource() throws Exception {
		FakeSource source = new FakeSource("idle", () -> sourceGame("runner-idle"));

		runnerOf(List.of(source)).run(new DefaultApplicationArguments());

		assertThat(source.fetches).isZero();
	}

	@Test
	void anUnknownSourceIsRefusedBeforeAnythingIsFetched() {
		FakeSource known = new FakeSource("known", () -> sourceGame("runner-known"));

		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> runnerOf(List.of(known), "known", "pocket-dragons").run(new DefaultApplicationArguments()))
			.withMessageContaining("pocket-dragons")
			.withMessageContaining("[known]");
		assertThat(known.fetches).isZero();
	}

	@Test
	void aSourceThatFailsStopsTheJobAndWritesNothingOfItsGame() {
		FakeSource broken = new FakeSource("broken", () -> {
			throw new TcgSourceException("the source is down");
		});

		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> runnerOf(List.of(broken), "broken").run(new DefaultApplicationArguments()))
			.withMessage("the source is down");
	}

	@Test
	void stopsWithAnExplanationWhenAFileIsNotADataset() throws Exception {
		Path notJson = Files.writeString(this.directory.resolve("broken.json"), "{ \"game\": ");
		Path notADataset = Files.writeString(this.directory.resolve("empty.json"), "{}");

		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> runner(notJson).run(new DefaultApplicationArguments()))
			.withMessageContaining("broken.json")
			.withMessageContaining("not valid JSON");
		assertThatExceptionOfType(InvalidDatasetException.class)
			.isThrownBy(() -> runner(notADataset).run(new DefaultApplicationArguments()))
			.withMessageContaining("empty.json")
			.satisfies((ex) -> assertThat(ex.getProblems()).anyMatch((problem) -> problem.startsWith("game ")));
	}

	private TcgDatasetImportRunner runner(Path... files) {
		List<String> paths = List.of(files).stream().map(Path::toString).toList();
		return new TcgDatasetImportRunner(this.importer, this.json, List.of(),
				new ImportProperties(List.of(), paths, false), this.context);
	}

	private TcgDatasetImportRunner runnerOf(List<TcgSource> sources, String... ids) {
		return new TcgDatasetImportRunner(this.importer, this.json, sources,
				new ImportProperties(List.of(ids), List.of(), false), this.context);
	}

	private static TcgDataset sourceGame(String slug) {
		return new TcgDataset(new TcgDataset.Game(slug, "From A Source", "", null, null, "#336699", "Test data."),
				List.of(new TcgDataset.Rarity("common", "Common", 1)),
				List.of(new TcgDataset.CardSet("set-1", "SET-1", "Set One", "", "Series", "/logo.png", "/cover.png", null,
						List.of(new TcgDataset.Card(slug + "-001", "001", "First", "common", "/1.png", "/1-small.png",
								Map.of())),
						List.of())));
	}

	/** A source that hands over a fixed dataset and counts how often it was asked. */
	private static final class FakeSource implements TcgSource {

		private final String id;

		private final Supplier<TcgDataset> dataset;

		private int fetches;

		FakeSource(String id, Supplier<TcgDataset> dataset) {
			this.id = id;
			this.dataset = dataset;
		}

		@Override
		public String id() {
			return this.id;
		}

		@Override
		public String description() {
			return "fake source " + this.id;
		}

		@Override
		public TcgDataset fetch() {
			this.fetches++;
			return this.dataset.get();
		}

	}

}
