package com.cyan.arcade.tcg.dataimport;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.dataimport.SourceConfig.GameInfo;
import com.cyan.arcade.tcg.dataimport.SourceConfig.PackProfile;
import com.cyan.arcade.tcg.dataimport.SourceConfig.RarityRule;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/** The source configurations that ship with the arcade, and the helpers every source shares. */
class SourceConfigTests {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Test
	void theShippedConfigurationsAreUsableAndHonestAboutTheirOdds() {
		for (String file : List.of("tcg/sources/pokemon.json", "tcg/sources/one-piece.json")) {
			SourceConfig config = SourceConfig.load(new ClassPathResource(file), JSON);

			assertThat(config.sets()).as(file).isNotEmpty();
			assertThat(config.sets().stream().map(SetChoice::id).distinct()).as(file).hasSameSizeAs(config.sets());
			assertThat(config.rarities().stream().map(RarityRule::code).distinct()).as(file)
				.hasSameSizeAs(config.rarities());
			assertThat(config.rarities()).as(file).allSatisfy((rule) -> assertThat(rule.tier()).isBetween(1, 5));
			// Neither publisher gives official pull rates, so every pack says its odds are a simulator's.
			assertThat(config.packProfiles().values()).as(file)
				.allSatisfy((profile) -> assertThat(profile.oddsNote()).startsWith("Simulator probabilities"));
			assertThat(config.game().attribution()).as(file).contains("not affiliated");
			assertThat(config.game().accentColor()).as(file).matches("^#[0-9a-f]{6}$");
		}
	}

	@Test
	void aConfigurationThatContradictsItselfIsRefusedWhenItIsRead() {
		String broken = """
				{
				  "game": { "slug": "broken", "name": "Broken" },
				  "rarities": [ { "code": "common", "name": "Common", "tier": 1, "source": ["Common"] } ],
				  "variantRarities": { "*": "shiny" },
				  "packProfiles": { "booster": { "code": "booster", "name": "{set}", "description": "", "oddsNote": "",
				    "slots": [ { "count": 1, "odds": { "common": 1, "mythic": 1 } } ] } },
				  "sets": [ { "id": "one", "profile": "jumbo" } ]
				}
				""";

		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> SourceConfig.load(new ByteArrayResource(broken.getBytes(), "broken.json"), JSON))
			.withMessageContaining("variantRarities names the unknown rarity 'shiny'")
			.withMessageContaining("pack profile 'booster' has odds for the unknown rarity 'mythic'")
			.withMessageContaining("set 'one' uses the unknown pack profile 'jumbo'");
	}

	@ParameterizedTest
	@CsvSource({ "sv03.5, sv03-5", "sv10.5w, sv10-5w", "base1, base1", "OP-01, op01", "EB-02, eb02",
			"OP14-EB04, op14-eb04", "ST-10, st10" })
	void setCodesForUrlsComeFromTheSourcesIds(String externalId, String code) {
		assertThat(SourceConfig.codeOf(externalId)).isEqualTo(code);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', value = { "WINGS OF THE CAPTAIN|Wings of the Captain",
			"500 YEARS IN THE FUTURE|500 Years in the Future", "A FIST OF DIVINE SPEED|A Fist of Divine Speed",
			"BOOSTER PACK|Booster Pack", "Anime 25th Collection|Anime 25th Collection" })
	void namesWrittenInCapitalsAreTitleCased(String text, String expected) {
		assertThat(SourceConfig.titleCase(text)).isEqualTo(expected);
	}

	@Test
	void rarityNamesAreMatchedRegardlessOfCase() {
		SourceConfig config = config();

		assertThat(config.rarityCode("Double rare")).contains("double-rare");
		assertThat(config.rarityCode("DOUBLE RARE")).contains("double-rare");
		assertThat(config.rarityCode("Mythic")).isEmpty();
		assertThat(config.rarityCode(null)).isEmpty();
	}

	@Test
	void anAlternateArtGetsTheRarityItsKindOrPrintedRarityIsMappedTo() {
		SourceConfig config = config();

		assertThat(config.variantRarityCode("double-rare", List.of("Double rare"))).isEqualTo("special");
		assertThat(config.variantRarityCode("common", List.of("Common"))).isEqualTo("parallel");
		// The first key the configuration knows decides: the kind of print before the printed rarity.
		assertThat(config.variantRarityCode("common", List.of("Box Topper", "Double rare", "Common")))
			.isEqualTo("special");
		// Mapped to nothing: it keeps its own rarity.
		assertThat(config.variantRarityCode("special", List.of("Special"))).isEqualTo("special");
	}

	@Test
	void aSetsPackOnlyPromisesRaritiesTheSetHas() {
		SourceConfig config = config();
		List<Card> commonsAndDoubleRares = List.of(card("common"), card("common"), card("double-rare"));

		Pack pack = config.pack(new SetChoice("x", "booster", null), "Paldea", commonsAndDoubleRares);

		assertThat(pack.code()).isEqualTo("booster");
		assertThat(pack.name()).isEqualTo("Paldea Booster");
		assertThat(pack.description()).isEqualTo("Cards from Paldea.");
		assertThat(pack.oddsNote()).isEqualTo("Simulator probabilities.");
		assertThat(pack.imageUrl()).isNull();
		assertThat(pack.cards()).isNull();
		// The parallel-only slot is gone; the rare slot keeps only the double rare.
		assertThat(pack.slots()).containsExactly(new Slot(4, Map.of("common", 1)),
				new Slot(1, Map.of("double-rare", 20)));
	}

	@Test
	void aSetIsShownByTheFirstOfItsRarestCards() {
		SourceConfig config = config();
		Card firstRare = new Card("a", "1", "First Rare", "double-rare", "/a.png", null, Map.of());
		Card secondRare = new Card("b", "2", "Second Rare", "double-rare", "/b.png", null, Map.of());

		assertThat(config.coverOf(List.of(card("common"), firstRare, secondRare))).contains(firstRare);
		assertThat(config.coverOf(List.of())).isEmpty();
	}

	private static Card card(String rarity) {
		return new Card(null, "1", "Card", rarity, "/card.png", null, Map.of());
	}

	private static SourceConfig config() {
		Map<String, Integer> rareSlot = new LinkedHashMap<>();
		rareSlot.put("rare", 80);
		rareSlot.put("double-rare", 20);
		Map<String, String> variants = new LinkedHashMap<>();
		variants.put("Double rare", "special");
		variants.put("Special", "");
		variants.put("*", "parallel");
		return new SourceConfig(new GameInfo("game", "Game", "", "#123456", "", null),
				List.of(new RarityRule("common", "Common", 1, List.of("Common")),
						new RarityRule("rare", "Rare", 2, List.of("Rare")),
						new RarityRule("double-rare", "Double Rare", 3, List.of("Double rare")),
						new RarityRule("parallel", "Parallel", 4, List.of()),
						new RarityRule("special", "Special", 5, List.of("Special"))),
				variants,
				Map.of("booster", new PackProfile("booster", "{set} Booster", "Cards from {set}.",
						"Simulator probabilities.",
						List.of(new Slot(4, Map.of("common", 1)), new Slot(1, Map.of("parallel", 1)), new Slot(1, rareSlot)))),
				List.of(new SetChoice("x", "booster", null)));
	}

	@Test
	void everyRarityAShippedPackProfileMentionsBelongsToItsGame() {
		for (String file : List.of("tcg/sources/pokemon.json", "tcg/sources/one-piece.json")) {
			SourceConfig config = SourceConfig.load(new ClassPathResource(file), JSON);
			Set<String> codes = config.rarities().stream().map(RarityRule::code).collect(Collectors.toSet());
			assertThat(config.packProfiles().values().stream().flatMap((profile) -> profile.slots().stream())
				.flatMap((slot) -> slot.odds().keySet().stream())).as(file).allMatch(codes::contains);
		}
	}

}
