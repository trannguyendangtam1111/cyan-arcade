package com.cyan.arcade.tcg.dataimport;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternUtils;

/**
 * The import job. At startup, before the application serves anything, it imports:
 * <ol>
 * <li>the datasets that ship with the application ({@code classpath:tcg/datasets/*.json});
 * <li>any dataset files named in {@code app.tcg.import.files}, for games brought in from outside.
 * </ol>
 *
 * <p>After that the application works from its own database and never goes back to a dataset's
 * source. A dataset that cannot be imported stops the startup with a message saying what is wrong
 * with it, rather than leaving the arcade half-stocked.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TcgDatasetImportRunner.ImportProperties.class)
class TcgDatasetImportRunner implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(TcgDatasetImportRunner.class);

	private static final String BUNDLED_DATASETS = "classpath*:tcg/datasets/*.json";

	/**
	 * @param bundled whether to import the datasets that ship with the application
	 * @param files paths of further dataset files to import
	 */
	@ConfigurationProperties("app.tcg.import")
	record ImportProperties(@DefaultValue("true") boolean bundled, List<String> files) {

		ImportProperties {
			files = (files != null) ? List.copyOf(files) : List.of();
		}

	}

	private final TcgDatasetImporter importer;

	private final JsonMapper json;

	private final ResourcePatternResolver resources;

	private final ImportProperties properties;

	TcgDatasetImportRunner(TcgDatasetImporter importer, JsonMapper json, ResourceLoader resourceLoader,
			ImportProperties properties) {
		this.importer = importer;
		this.json = json;
		this.resources = ResourcePatternUtils.getResourcePatternResolver(resourceLoader);
		this.properties = properties;
	}

	@Override
	public void run(ApplicationArguments args) throws IOException {
		if (this.properties.bundled()) {
			Resource[] bundled = this.resources.getResources(BUNDLED_DATASETS);
			// A fixed order, so several games always end up in the same order of import.
			Arrays.sort(bundled, Comparator.comparing(Resource::getFilename));
			for (Resource dataset : bundled) {
				importFrom(dataset);
			}
		}
		for (String file : this.properties.files()) {
			importFrom(new FileSystemResource(file));
		}
	}

	private void importFrom(Resource resource) throws IOException {
		String source = resource.getDescription();
		TcgDataset dataset;
		try (InputStream in = resource.getInputStream()) {
			dataset = this.json.readValue(in, TcgDataset.class);
		}
		catch (JacksonException ex) {
			throw new InvalidDatasetException(source, List.of("it is not valid JSON: " + ex.getOriginalMessage()));
		}
		ImportReport report = this.importer.importDataset(dataset, source);
		log.info("Imported card game '{}' from {}: {} sets, {} cards, {} packs", report.gameSlug(), source,
				report.sets(), report.cards(), report.packs());
	}

}
