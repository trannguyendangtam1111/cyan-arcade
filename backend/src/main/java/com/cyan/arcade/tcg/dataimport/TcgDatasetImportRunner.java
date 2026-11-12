package com.cyan.arcade.tcg.dataimport;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
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
 * idempotent, so running it again only adds what is new and updates what changed.
 *
 * <p>Each source is imported on its own, in its own transaction. A configured set the source does
 * not have complete yet is held back and the rest imported (see {@link SetCheck}). A source or file
 * that cannot be imported leaves its game exactly as it was; the job still tries the others, then
 * fails with the first error. Every run ends with a report: a short summary per source in the log,
 * the same as one line of JSON, and as a file when {@code app.tcg.import.report-file} is set.
 * {@code app.tcg.import.dry-run} rolls every import back once its report is made.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({ TcgDatasetImportRunner.ImportProperties.class, TcgSourceProperties.class })
class TcgDatasetImportRunner implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(TcgDatasetImportRunner.class);

	/**
	 * @param sources ids of the sources to import from
	 * @param files paths of dataset files to import
	 * @param exitWhenDone whether the application stops once the import is over, for a one-off run
	 * @param dryRun whether to roll every import back once its report is made, to see what it would do
	 * @param reportFile where to write the run's report as JSON, if anywhere
	 */
	@ConfigurationProperties("app.tcg.import")
	record ImportProperties(List<String> sources, List<String> files, boolean exitWhenDone, boolean dryRun,
			String reportFile) {

		ImportProperties {
			sources = (sources != null) ? List.copyOf(sources) : List.of();
			files = (files != null) ? List.copyOf(files) : List.of();
			reportFile = (reportFile != null && !reportFile.isBlank()) ? reportFile : null;
		}

	}

	/** A run's report, as logged and written. */
	record RunReport(boolean dryRun, List<ImportOutcome> outcomes) {
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
		if (!this.properties.sources().isEmpty() || !this.properties.files().isEmpty()) {
			importAll();
		}
		if (this.properties.exitWhenDone()) {
			log.info("Card game import finished");
			System.exit(SpringApplication.exit(this.context));
		}
	}

	private void importAll() throws IOException {
		boolean dryRun = this.properties.dryRun();
		List<ImportOutcome> outcomes = new ArrayList<>();
		List<Exception> failures = new ArrayList<>();
		for (String id : this.properties.sources()) {
			TcgSource source = this.sources.get(id);
			log.info("{} card game source '{}' from {}", dryRun ? "Dry run of" : "Importing", id, source.description());
			List<SetCheck> checks = List.of();
			try {
				SourceFetch fetched = source.fetchChecked();
				checks = fetched.checks();
				if (fetched.dataset() == null) {
					outcomes.add(new ImportOutcome(id, source.description(), ImportOutcome.Status.NOTHING_TO_IMPORT,
							checks, null, null));
					continue;
				}
				ImportReport report = this.importer.importDataset(fetched.dataset(), source.description(), dryRun);
				outcomes.add(new ImportOutcome(id, source.description(), statusOf(report), checks, report, null));
			}
			catch (RuntimeException ex) {
				outcomes.add(ImportOutcome.failed(id, source.description(), checks, ex));
				failures.add(ex);
			}
		}
		for (String file : this.properties.files()) {
			Resource resource = new FileSystemResource(file);
			try {
				ImportReport report = importFile(resource, dryRun);
				outcomes.add(new ImportOutcome(file, resource.getDescription(), statusOf(report), List.of(), report,
						null));
			}
			catch (IOException | RuntimeException ex) {
				outcomes.add(ImportOutcome.failed(file, resource.getDescription(), List.of(), ex));
				failures.add(ex);
			}
		}

		RunReport run = new RunReport(dryRun, outcomes);
		outcomes.forEach((outcome) -> log.info("{}", summaryOf(outcome, dryRun)));
		log.info("Card game import report: {}", this.json.writeValueAsString(run));
		if (this.properties.reportFile() != null) {
			Path path = Path.of(this.properties.reportFile());
			Files.writeString(path, this.json.writerWithDefaultPrettyPrinter().writeValueAsString(run));
			log.info("Card game import report written to {}", path.toAbsolutePath());
		}
		if (!failures.isEmpty()) {
			Exception first = failures.get(0);
			failures.subList(1, failures.size()).forEach(first::addSuppressed);
			if (first instanceof IOException io) {
				throw io;
			}
			throw (RuntimeException) first;
		}
	}

	private ImportReport importFile(Resource resource, boolean dryRun) throws IOException {
		String source = resource.getDescription();
		TcgDataset dataset;
		try (InputStream in = resource.getInputStream()) {
			dataset = this.json.readValue(in, TcgDataset.class);
		}
		catch (JacksonException ex) {
			throw new InvalidDatasetException(source, List.of("it is not valid JSON: " + ex.getOriginalMessage()));
		}
		return this.importer.importDataset(dataset, source, dryRun);
	}

	private static ImportOutcome.Status statusOf(ImportReport report) {
		return report.dryRun() ? ImportOutcome.Status.DRY_RUN : ImportOutcome.Status.IMPORTED;
	}

	/** A few lines a person reads: what changed, what was held back and why. Counts, never every card. */
	static String summaryOf(ImportOutcome outcome, boolean dryRun) {
		StringBuilder text = new StringBuilder();
		text.append("Card game import%s, %s from %s: %s".formatted(dryRun ? " (dry run, nothing kept)" : "",
				outcome.source(), outcome.from(), outcome.status()));
		ImportReport report = outcome.report();
		if (report != null) {
			text.append("%n  game '%s': sets %d new, %d updated, %d unchanged; cards %d new, %d updated, %d unchanged; "
				.formatted(report.gameSlug(), report.newSets(), report.updatedSets(),
						report.sets() - report.newSets() - report.updatedSets(), report.newCards(),
						report.updatedCards(), report.unchangedCards()));
			text.append("packs %d new, %d updated, %d unchanged".formatted(report.newPacks(), report.updatedPacks(),
					report.packs() - report.newPacks() - report.updatedPacks()));
			if (!report.newCardsBySet().isEmpty()) {
				text.append("%n  new cards by set: %s".formatted(report.newCardsBySet()));
			}
			if (report.movedCards() > 0) {
				text.append("%n  cards moved to another set: %d, e.g. %s".formatted(report.movedCards(),
						report.movedExamples()));
			}
			if (!report.setsNotInDataset().isEmpty()) {
				text.append("%n  sets in the catalog not in this import, kept as they were: %s"
					.formatted(report.setsNotInDataset()));
			}
		}
		for (SetCheck check : outcome.sets()) {
			List<String> notes = new ArrayList<>();
			if (check.status() != SetCheck.Status.IMPORTABLE) {
				notes.add("held back, " + check.status());
			}
			if (check.withoutImage() > 0) {
				notes.add("%d of %d cards without an image".formatted(check.withoutImage(), check.listed()));
			}
			if (!check.excluded().isEmpty()) {
				notes.add("excluded rarities " + check.excluded());
			}
			if (!check.unknownRarities().isEmpty()) {
				notes.add("unknown rarities " + check.unknownRarities());
			}
			if (check.renamedIds() > 0) {
				notes.add(check.renamedIds() + " prints given an id of their own");
			}
			if (!notes.isEmpty()) {
				text.append("%n  set %s: %s".formatted(check.setId(), String.join("; ", notes)));
			}
		}
		if (outcome.failure() != null) {
			text.append("%n  nothing written: %s".formatted(outcome.failure()));
		}
		return text.toString();
	}

}
