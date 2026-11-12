package com.cyan.arcade.tcg.dataimport.yugioh;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import com.cyan.arcade.tcg.dataimport.SetCheck;
import com.cyan.arcade.tcg.dataimport.SourceConfig.RarityRule;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoCard;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoPrinting;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoSet;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.Printing;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.SetPrintings;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohConfig.PilotSet;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.tuple;

/**
 * YGOPRODeck's answers, as recorded on 2026-11-12 (trimmed: no prices, shortened effect text),
 * turned into printings with the pilot configuration and a few more sets.
 */
class YugiohPrintingMapperTests {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final YugiohConfig PILOT = YugiohConfig.load(new ClassPathResource("tcg/pilots/yugioh.json"), JSON);

	private static final List<YgoSet> SETS = sets();

	private static final List<YgoCard> BEYOND_THE_BRAVE = cards("cardinfo-beyond-the-brave.json");

	private static final List<YgoCard> DARK_MAGICIAN = cards("cardinfo-dark-magician.json");

	private static final PilotSet LOB = new PilotSet("lob", "Legend of Blue Eyes White Dragon", "LOB");

	private static final PilotSet LOB_25TH = new PilotSet("lob-25th",
			"Legend of Blue Eyes White Dragon (25th Anniversary Edition)", "LOB");

	private static final PilotSet QCB = new PilotSet("ra03", "Quarter Century Bonanza", "RA03");

	private static final PilotSet RC5 = new PilotSet("ra05", "Rarity Collection 5", "RA05");

	@Test
	void theBeyondTheBravePilotBecomesOnePrintingPerCodeAndRarity() {
		SetPrintings set = pilot(BEYOND_THE_BRAVE).sets().get(0);

		assertThat(set.code()).isEqualTo("betb");
		assertThat(set.status()).isEqualTo(SetCheck.Status.IMPORTABLE);
		assertThat(set.releasedOn()).isEqualTo(LocalDate.of(2026, 10, 8));
		assertThat(set.printings()).extracting(Printing::externalId)
			.containsExactly("betb:BETB-EN009:secret-rare", "betb:BETB-EN009:starlight-rare",
					"betb:BETB-EN018:ultra-rare", "betb:BETB-EN018:starlight-rare", "betb:BETB-EN024:super-rare",
					"betb:BETB-EN025:common", "betb:BETB-EN045:common", "betb:BETB-EN049:super-rare",
					"betb:BETB-EN063:super-rare");
		assertThat(set.listed()).isEqualTo(9);
		assertThat(List.of(set.otherRegion(), set.incomplete(), set.duplicates())).containsOnly(0);
	}

	@Test
	void oneCodeInTwoRaritiesIsTwoPrintingsOfTheSameCard() {
		List<Printing> arsMagna = pilot(BEYOND_THE_BRAVE).sets()
			.get(0)
			.printings()
			.stream()
			.filter((printing) -> printing.printingCode().equals("BETB-EN018"))
			.toList();

		assertThat(arsMagna).extracting(Printing::rarity, Printing::sourceRarity)
			.containsExactly(tuple("ultra-rare", "Ultra Rare"),
					tuple("starlight-rare", "Starlight Rare"));
		assertThat(arsMagna).extracting(Printing::passcode).containsOnly(36270527L);
		assertThat(arsMagna).extracting(Printing::name).containsOnly("Ars Magna the Finite and the Infinite");
	}

	@Test
	void theCardsDetailsAreKeptWithItsPrinting() {
		Map<String, Printing> byCode = new HashMap<>();
		pilot(BEYOND_THE_BRAVE).sets().get(0).printings().forEach((printing) -> byCode.put(printing.externalId(), printing));

		assertThat(byCode.get("betb:BETB-EN018:ultra-rare").metadata()).containsEntry("passcode", 36270527L)
			.containsEntry("printingCode", "BETB-EN018")
			.containsEntry("printingRarity", "Ultra Rare")
			.containsEntry("cardType", "Effect Monster")
			.containsEntry("attribute", "EARTH")
			.containsEntry("level", 8)
			.containsEntry("atk", 1000)
			.containsEntry("def", 2400)
			.containsKey("effect");
		// An Xyz monster has a rank, a Link monster a link rating and no DEF, a Spell neither ATK nor level.
		assertThat(byCode.get("betb:BETB-EN045:common").metadata()).containsEntry("rank", 3).doesNotContainKey("level");
		assertThat(byCode.get("betb:BETB-EN049:super-rare").metadata()).containsEntry("linkRating", 2)
			.containsEntry("atk", 1800)
			.doesNotContainKeys("def", "level");
		assertThat(byCode.get("betb:BETB-EN063:super-rare").metadata()).containsEntry("cardType", "Spell Card")
			.containsEntry("property", "Normal")
			.doesNotContainKeys("atk", "def", "level", "attribute");
	}

	@Test
	void aCardReprintedInOtherSetsIsADifferentPrintingInEach() {
		YugiohCatalog catalog = YugiohPrintingMapper.map(config(platinumAndQuarterCentury(), Map.of(), LOB, QCB, RC5),
				SETS, Map.of(LOB.name(), DARK_MAGICIAN, QCB.name(), DARK_MAGICIAN, RC5.name(), DARK_MAGICIAN));

		assertThat(catalog.sets()).flatExtracting(SetPrintings::printings)
			.extracting(Printing::externalId)
			.containsExactly("lob:LOB-EN005:ultra-rare", "ra03:RA03-EN080:platinum-secret-rare",
					"ra03:RA03-EN080:quarter-century-secret-rare", "ra05:RA05-EN083:ultra-rare",
					"ra05:RA05-EN083:starlight-rare");
		assertThat(catalog.sets()).flatExtracting(SetPrintings::printings)
			.extracting(Printing::passcode)
			.containsOnly(46986414L);
		// LOB-005 and LOB-E003 are the same Dark Magician for other regions: counted, left out.
		assertThat(catalog.sets().get(0).otherRegion()).isEqualTo(2);
	}

	@Test
	void setsThatShareACodePrefixAreToldApartByName() {
		YugiohCatalog catalog = YugiohPrintingMapper.map(config(List.of(), Map.of(), LOB, LOB_25TH), SETS,
				Map.of(LOB.name(), DARK_MAGICIAN, LOB_25TH.name(), List.of()));

		// YGOPRODeck lists two "LOB" sets; Dark Magician's LOB-EN005 is only in the first.
		assertThat(SETS).filteredOn((set) -> "LOB".equals(set.code())).hasSize(2);
		assertThat(catalog.sets()).extracting(SetPrintings::code, SetPrintings::status)
			.containsExactly(tuple("lob", SetCheck.Status.IMPORTABLE),
					tuple("lob-25th", SetCheck.Status.EMPTY));
	}

	@Test
	void aSetWhoseCodeIsNotTheExpectedOneOrWhoseNameIsAmbiguousIsRefused() {
		PilotSet wrongPrefix = new PilotSet("betb", "Beyond the Brave", "BTB");
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> YugiohPrintingMapper.map(config(List.of(), Map.of(), wrongPrefix), SETS,
					Map.of(wrongPrefix.name(), BEYOND_THE_BRAVE)))
			.withMessageContaining("has the code 'BETB' at YGOPRODeck, where the configuration expects 'BTB'");

		List<YgoSet> twice = new ArrayList<>(SETS);
		twice.add(new YgoSet("Beyond the Brave", "BETB", 1, "2026-10-08"));
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> YugiohPrintingMapper.map(PILOT, twice, Map.of("Beyond the Brave", BEYOND_THE_BRAVE)))
			.withMessageContaining("lists 2 sets named 'Beyond the Brave'");
	}

	@Test
	void aSetTheProviderDoesNotListIsHeldBack() {
		PilotSet future = new PilotSet("glvi", "Glorious Victors", "GLVI");

		YugiohCatalog catalog = YugiohPrintingMapper.map(config(List.of(), Map.of(), future), SETS, Map.of());

		assertThat(catalog.sets()).singleElement().satisfies((set) -> {
			assertThat(set.status()).isEqualTo(SetCheck.Status.NOT_AT_SOURCE);
			assertThat(set.printings()).isEmpty();
		});
	}

	@Test
	void printingsMissingWhatTellsThemApartAreLeftOutAndCounted() {
		YgoCard akasuna = card(BEYOND_THE_BRAVE, 38331244L);
		List<YgoPrinting> printings = new ArrayList<>(akasuna.printings());
		printings.add(new YgoPrinting("Beyond the Brave", null, "Ultra Rare", "(UR)"));
		printings.add(new YgoPrinting("Beyond the Brave", "BETB-EN009", "  ", ""));
		printings.add(new YgoPrinting("Beyond the Brave", "XXXX-EN009", "Ultra Rare", "(UR)"));
		// Listed twice, identically: one printing.
		printings.add(akasuna.printings().get(0));

		SetPrintings set = pilot(List.of(withPrintings(akasuna, printings))).sets().get(0);

		assertThat(set.printings()).extracting(Printing::externalId)
			.containsExactly("betb:BETB-EN009:secret-rare", "betb:BETB-EN009:starlight-rare");
		assertThat(set.incomplete()).isEqualTo(3);
		assertThat(set.duplicates()).isEqualTo(1);
		assertThat(set.listed()).isEqualTo(6);
	}

	@Test
	void twoCardsUnderOnePrintingCodeStopTheImportRatherThanOneOverwritingTheOther() {
		YgoCard akasuna = card(BEYOND_THE_BRAVE, 38331244L);
		YgoCard arsMagna = card(BEYOND_THE_BRAVE, 36270527L);
		YgoCard clash = withPrintings(arsMagna,
				List.of(new YgoPrinting("Beyond the Brave", "BETB-EN009", "Ultra Rare", "(UR)")));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> pilot(List.of(akasuna, clash)))
			.withMessageContaining("cannot be told apart safely")
			.withMessageContaining("the printing code BETB-EN009 is listed for two cards, 36270527 and 38331244");
	}

	@Test
	void aRarityTheConfigurationDoesNotKnowStopsTheImportUnlessExcludedWithAReason() {
		YugiohConfig withoutStarlight = new YugiohConfig(PILOT.game(), "EN",
				PILOT.rarities().stream().filter((rule) -> !rule.code().equals("starlight-rare")).toList(), Map.of(),
				PILOT.sets());
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> YugiohPrintingMapper.map(withoutStarlight, SETS, Map.of("Beyond the Brave", BEYOND_THE_BRAVE)))
			.withMessageContaining("{Starlight Rare=2}")
			.withMessageContaining("excludedRarities");

		YugiohConfig excludingStarlight = new YugiohConfig(PILOT.game(), "EN", withoutStarlight.rarities(),
				Map.of("Starlight Rare", "Not part of this test's catalog."), PILOT.sets());
		SetPrintings set = YugiohPrintingMapper.map(excludingStarlight, SETS, Map.of("Beyond the Brave", BEYOND_THE_BRAVE))
			.sets()
			.get(0);
		assertThat(set.excluded()).containsExactly(Map.entry("Starlight Rare", 2));
		assertThat(set.printings()).hasSize(7).noneMatch((printing) -> printing.rarity().equals("starlight-rare"));
	}

	@Test
	void mappingAgainGivesTheSameIdsInTheSameOrderWhateverTheProvidersOrder() {
		List<YgoCard> shuffled = new ArrayList<>(BEYOND_THE_BRAVE);
		Collections.reverse(shuffled);
		List<YgoCard> printingsReversed = shuffled.stream().map((card) -> {
			List<YgoPrinting> reversed = new ArrayList<>(card.printings());
			Collections.reverse(reversed);
			return withPrintings(card, reversed);
		}).toList();

		assertThat(pilot(printingsReversed)).isEqualTo(pilot(BEYOND_THE_BRAVE));
		assertThat(pilot(BEYOND_THE_BRAVE)).isEqualTo(pilot(BEYOND_THE_BRAVE));
	}

	@Test
	void noImageOfAnyKindIsKept() {
		// The recorded answers carry image links; none of them reaches a printing.
		assertThat(fixture("cardinfo-beyond-the-brave.json")).contains("images.ygoprodeck.com");

		Stream<Object> values = pilot(BEYOND_THE_BRAVE).sets()
			.get(0)
			.printings()
			.stream()
			.flatMap((printing) -> Stream.concat(
					Stream.of(printing.externalId(), printing.name(), printing.printingCode(), printing.sourceRarity()),
					printing.metadata().values().stream()));
		assertThat(values).noneMatch((value) -> String.valueOf(value).contains("http")
				|| String.valueOf(value).contains("ygoprodeck"));
		assertThat(YgoCard.class.getRecordComponents()).noneMatch((component) -> component.getName().contains("image"));
	}

	private static YugiohCatalog pilot(List<YgoCard> cards) {
		return YugiohPrintingMapper.map(PILOT, SETS, Map.of("Beyond the Brave", cards));
	}

	private static YugiohConfig config(List<RarityRule> extra, Map<String, String> excluded, PilotSet... sets) {
		List<RarityRule> rarities = new ArrayList<>(PILOT.rarities());
		rarities.addAll(extra);
		return new YugiohConfig(PILOT.game(), "EN", rarities, excluded, List.of(sets));
	}

	/** Quarter Century Secret Rare comes with an empty abbreviation: rarities are known by name. */
	private static List<RarityRule> platinumAndQuarterCentury() {
		return List.of(new RarityRule("platinum-secret-rare", "Platinum Secret Rare", 5, List.of("Platinum Secret Rare")),
				new RarityRule("quarter-century-secret-rare", "Quarter Century Secret Rare", 5,
						List.of("Quarter Century Secret Rare")));
	}

	private static YgoCard card(List<YgoCard> cards, long passcode) {
		return cards.stream().filter((card) -> card.id() == passcode).findFirst().orElseThrow();
	}

	private static YgoCard withPrintings(YgoCard card, List<YgoPrinting> printings) {
		return new YgoCard(card.id(), card.name(), card.type(), card.frameType(), card.desc(), card.race(), card.atk(),
				card.def(), card.level(), card.attribute(), card.linkval(), card.scale(), card.archetype(), printings);
	}

	private static List<YgoSet> sets() {
		List<YgoSet> sets = new ArrayList<>();
		JSON.readTree(fixture("cardsets.json")).forEach((set) -> sets.add(JSON.treeToValue(set, YgoSet.class)));
		return sets;
	}

	private static List<YgoCard> cards(String file) {
		List<YgoCard> cards = new ArrayList<>();
		JsonNode data = JSON.readTree(fixture(file)).path("data");
		data.forEach((card) -> cards.add(JSON.treeToValue(card, YgoCard.class)));
		return cards;
	}

	static String fixture(String file) {
		try {
			return new ClassPathResource("tcg/ygoprodeck/" + file).getContentAsString(StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
