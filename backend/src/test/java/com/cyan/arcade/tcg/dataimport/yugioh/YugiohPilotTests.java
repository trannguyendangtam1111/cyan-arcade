package com.cyan.arcade.tcg.dataimport.yugioh;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.SetCheck;
import com.cyan.arcade.tcg.dataimport.SourceConfig.RarityRule;
import com.cyan.arcade.tcg.dataimport.SourceFetch;
import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgSource;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohConfig.PilotSet;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The pilot's configuration, its source, and that it is off unless switched on. */
class YugiohPilotTests {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String URL = "https://ygoprodeck.test/api/v7";

	private final ApplicationContextRunner contextRunner = new ApplicationContextRunner().withInitializer((context) -> {
		// application.yml's defaults, whatever the developer's environment says.
		context.getEnvironment()
			.getPropertySources()
			.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
		context.getEnvironment().getPropertySources().addLast(applicationProperties());
	}).withUserConfiguration(YugiohPilotConfiguration.class).withBean(JsonMapper.class, () -> JSON);

	@Test
	void thePilotIsOffByDefault() {
		this.contextRunner.run((context) -> {
			assertThat(context).hasNotFailed();
			assertThat(context).doesNotHaveBean(TcgSource.class);
		});
	}

	@Test
	void switchedOnItIsASourceNamedYugioh() {
		this.contextRunner.withPropertyValues("app.tcg.pilots.yugioh.enabled=true").run((context) -> {
			assertThat(context).hasNotFailed();
			assertThat(context).hasSingleBean(TcgSource.class);
			assertThat(context.getBean(TcgSource.class).id()).isEqualTo("yugioh");
			assertThat(context.getBean(TcgSource.class).description())
				.isEqualTo("YGOPRODeck (https://db.ygoprodeck.com/api/v7), pilot");
		});
	}

	@Test
	void theShippedPilotConfigurationIsBeyondTheBraveInEnglish() {
		YugiohConfig config = YugiohConfig.load(new ClassPathResource("tcg/pilots/yugioh.json"), JSON);

		assertThat(config.game().slug()).isEqualTo("yugioh");
		assertThat(config.game().attribution()).contains("KONAMI").contains("No card images");
		assertThat(config.region()).isEqualTo("EN");
		assertThat(config.sets()).containsExactly(new PilotSet("betb", "Beyond the Brave", "BETB"));
		assertThat(config.rarities()).extracting(RarityRule::code)
			.containsExactly("common", "super-rare", "ultra-rare", "secret-rare", "starlight-rare");
		assertThat(config.rarityOf("ultra rare")).map(RarityRule::code).contains("ultra-rare");
		assertThat(config.rarityOf("Quarter Century Secret Rare")).isEmpty();
	}

	@Test
	void aConfigurationWithMistakesIsRefusedWhenRead() {
		String config = """
				{
				  "game": { "slug": "Yu Gi Oh", "name": "Yu-Gi-Oh!" },
				  "region": "english",
				  "rarities": [
				    { "code": "common", "name": "Common", "tier": 1, "source": ["Common"] },
				    { "code": "common", "name": "Short Print", "tier": 9, "source": ["common"] }
				  ],
				  "excludedRarities": { "Common": "", "Ghost Rare": " " },
				  "sets": [
				    { "code": "betb", "name": "Beyond the Brave", "prefix": "betb" },
				    { "code": "betb", "name": "Beyond the Brave", "prefix": "BETB" }
				  ]
				}
				""";

		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> YugiohConfig.load(new ByteArrayResource(config.getBytes(), "a test configuration"), JSON))
			.withMessageContaining("is not usable")
			.withMessageContaining("needs a slug")
			.withMessageContaining("region must be")
			.withMessageContaining("the rarity code 'common' is used twice")
			.withMessageContaining("needs a tier from 1 to 5")
			.withMessageContaining("the provider rarity 'common' is mapped twice")
			.withMessageContaining("the rarity 'Common' is both mapped and excluded")
			.withMessageContaining("the excluded rarity 'Ghost Rare' does not say why")
			.withMessageContaining("the set code 'betb' is used twice")
			.withMessageContaining("needs a provider name of its own")
			.withMessageContaining("needs its printing code prefix");
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> YugiohConfig.load(new ByteArrayResource("{".getBytes(), "a broken file"), JSON))
			.withMessageContaining("Could not read");
	}

	@Test
	void theSourceReportsEverySetItReadsAsWaitingForImagesAndGivesNoDataset() {
		RestClient.Builder builder = RestClient.builder().baseUrl(URL);
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(URL + "/cardsets.php"))
			.andRespond(withSuccess(YugiohPrintingMapperTests.fixture("cardsets.json"), MediaType.APPLICATION_JSON));
		server.expect(requestTo(URL + "/cardinfo.php?cardset=Beyond%20the%20Brave"))
			.andRespond(withSuccess(YugiohPrintingMapperTests.fixture("cardinfo-beyond-the-brave.json"),
					MediaType.APPLICATION_JSON));
		YugiohConfig shipped = YugiohConfig.load(new ClassPathResource("tcg/pilots/yugioh.json"), JSON);
		YugiohConfig config = new YugiohConfig(shipped.game(), shipped.region(), shipped.rarities(), Map.of(),
				List.of(shipped.sets().get(0), new PilotSet("glvi", "Glorious Victors", "GLVI")));
		YugiohSource source = new YugiohSource(new YgoprodeckClient(new SourceHttp(builder.build(), JSON, Duration.ZERO),
				JSON, Duration.ZERO, System::nanoTime, (pause) -> {
				}), config, URL);

		SourceFetch fetch = source.fetchChecked();

		// Only sets the provider lists are asked for: Glorious Victors costs no request.
		server.verify();
		assertThat(fetch.dataset()).isNull();
		assertThat(fetch.checks()).extracting(SetCheck::setId, SetCheck::status, SetCheck::listed, SetCheck::importable)
			.containsExactly(org.assertj.core.groups.Tuple.tuple("betb", SetCheck.Status.PENDING_IMAGES, 9, 9),
					org.assertj.core.groups.Tuple.tuple("glvi", SetCheck.Status.NOT_AT_SOURCE, 0, 0));
	}

	private static PropertySource<?> applicationProperties() {
		try {
			return new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml")).getFirst();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

}
