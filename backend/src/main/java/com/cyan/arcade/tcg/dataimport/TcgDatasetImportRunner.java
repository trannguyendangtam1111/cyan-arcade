package com.cyan.arcade.tcg.dataimport;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

/**
 * The import job: brings card games into the database, and does nothing unless asked to.
 * <ol>
 * <li>{@code app.tcg.import.sources}: the {@link TcgSource sources} to read, e.g.
 * {@code pokemon,one-piece}. Each is fetched from the internet and imported.
 * <li>{@code app.tcg.import.files}: dataset files ({@link TcgDataset} as JSON), for a card game
 * that has no source of its own.
 * </ol>
 *
 * <p>An ordinary start of the application asks for neither, so the arcade starts quickly and never
 * depends on an external source: it serves whatever was imported last. The {@code import-tcg}
 * profile runs the job on its own and exits ({@code app.tcg.import.exit-when-done}). Importing is
 * idempotent, so running it again only adds what is new and updates what changed. A source or file
 * that cannot be imported stops the job with a message saying what is wrong, and leaves that game
 * as it was.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({ TcgDatasetImportRunner.ImportProperties.class, TcgSourceProperties.class })
class TcgDatasetImportRunner implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(TcgDatasetImportRunner.class);

	/**
	 * @param sources ids of the sources to import from
	 * @param files paths of dataset files to import
	 * @param exitWhenDone whether the application stops once the import is over, for a one-off run
	 */
	@ConfigurationProperties("app.tcg.import")
	record ImportProperties(List<String> sources, List<String> files, boolean exitWhenDone) {

		ImportProperties {
			sources = (sources != null) ? List.copyOf(sources) : List.of();
			files = (files != null) ? List.copyOf(files) : List.of();
		}

	}

	private final TcgDatasetImporter importer;

	private final JsonMapper json;

	private final Map<String, TcgSource> sources;

	private final ImportProperties properties;

	private final ApplicationContext context;

	TcgDatasetImportRunner(TcgDatasetImporter importer, JsonMapper json, List<TcgSource> sources,
			ImportProperties properties, ApplicationContext context) {
		this.importer = importer;
		this.json = json;
		this.sources = sources.stream().collect(Collectors.toMap(TcgSource::id, Function.identity()));
		this.properties = properties;
		this.context = context;
	}

	@Override
	public void run(ApplicationArguments args) throws IOException {
		List<String> unknown = this.properties.sources().stream().filter((id) -> !this.sources.containsKey(id)).toList();
		if (!unknown.isEmpty()) {
			throw new TcgSourceException("Unknown card game sources %s; the known ones are %s".formatted(unknown,
					this.sources.keySet().stream().sorted().toList()));
		}
		for (String id : this.properties.sources()) {
			TcgSource source = this.sources.get(id);
			log.info("Importing card game source '{}' from {}", id, source.description());
			report(this.importer.importDataset(source.fetch(), source.description()), source.description());
		}
		for (String file : this.properties.files()) {
			importFile(new FileSystemResource(file));
		}
		if (this.properties.exitWhenDone()) {
			log.info("Card game import finished");
			System.exit(SpringApplication.exit(this.context));
		}
	}

	private void importFile(Resource resource) throws IOException {
		String source = resource.getDescription();
		TcgDataset dataset;
		try (InputStream in = resource.getInputStream()) {
			dataset = this.json.readValue(in, TcgDataset.class);
		}
		catch (JacksonException ex) {
			throw new InvalidDatasetException(source, List.of("it is not valid JSON: " + ex.getOriginalMessage()));
		}
		report(this.importer.importDataset(dataset, source), source);
	}

	private static void report(ImportReport report, String source) {
		log.info("Imported card game '{}' from {}: {} sets, {} cards ({} new), {} packs", report.gameSlug(), source,
				report.sets(), report.cards(), report.newCards(), report.packs());
	}

}
