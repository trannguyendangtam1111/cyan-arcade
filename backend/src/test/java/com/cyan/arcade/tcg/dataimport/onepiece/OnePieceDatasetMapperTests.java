package com.cyan.arcade.tcg.dataimport.onepiece;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.SourceConfig;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.onepiece.OnePieceDatasetMapper.ParsedName;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgCard;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgSet;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * OPTCG API's sets and cards, as recorded for real cards, turned into a dataset with the
 * configuration that ships with the arcade.
 */
class OnePieceDatasetMapperTests {

	private static final SourceConfig SHIPPED = SourceConfig.load(new ClassPathResource("tcg/sources/one-piece.json"),
			JsonMapper.builder().build());

	private static final List<OptcgSet> SETS = List.of(new OptcgSet("OP-01", "Romance Dawn"),
			new OptcgSet("OP-03", "Pillars of Strength"), new OptcgSet("OP-04", "Kingdoms of Intrigue"),
			new OptcgSet("OP-05", "Awakening of the New Era"), new OptcgSet("OP14-EB04", "The Azure Sea's Seven"),
			new OptcgSet("EB-01", "Extra Booster: Memorial Collection"), new OptcgSet("OP-13", "Carrying On His Will"),
			new OptcgSet("EB-05", "Extra Booster: One Piece Heroines Edition Vol. 2"));

	@ParameterizedTest
	@CsvSource(delimiter = '|', value = { "Shanks|Shanks|", "Shanks (Parallel)|Shanks|Parallel",
			"Shanks (Parallel) (Manga) (Alternate Art)|Shanks|Parallel, Manga, Alternate Art",
			"Rob Lucci (092) (SP)|Rob Lucci|SP", "Nami (OP15-108) (Dash Pack)|Nami|Dash Pack",
			"Gecko Moria - OP14-080|Gecko Moria|", "Monkey.D.Luffy|Monkey.D.Luffy|", "Nami (TR)|Nami|TR" })
	void namesAreKeptWithoutWhatTheSourceAddsToThem(String raw, String name, String kinds) {
		ParsedName parsed = OnePieceDatasetMapper.parseName(raw);

		assertThat(parsed.name()).isEqualTo(name);
		assertThat(String.join(", ", parsed.kinds())).isEqualTo((kinds != null) ? kinds : "");
	}

	@Test
	void mapsASetWithItsCardsAndBoosterPack() {
		TcgDataset dataset = map(List.of("OP-01"), Map.of("OP-01", romanceDawn()));

		assertThat(dataset.game().slug()).isEqualTo("one-piece");
		assertThat(dataset.game().accentColor()).isEqualTo("#c8102e");
		assertThat(dataset.game().attribution()).contains("OPTCG API").contains("Bandai");
		// The game is shown by the card its configuration names: Shanks, the set's secret rare.
		assertThat(dataset.game().imageUrl()).isEqualTo(image("OP01-120"));
		CardSet set = dataset.sets().get(0);
		assertThat(set.code()).isEqualTo("op01");
		assertThat(set.externalId()).isEqualTo("OP-01");
		assertThat(set.name()).isEqualTo("Romance Dawn");
		assertThat(set.series()).isEqualTo("Booster Pack");
		assertThat(set.description()).isEqualTo("Booster Pack [OP-01]. 7 cards, alternate arts included.");
		assertThat(set.imageUrl()).isNull();
		assertThat(set.packs()).singleElement().satisfies((pack) -> {
			assertThat(pack.name()).isEqualTo("Romance Dawn Booster Pack");
			assertThat(pack.oddsNote()).startsWith("Simulator probabilities");
			// These seven cards have no commons, so the seven common slots are left out of this pack.
			assertThat(pack.slots()).extracting(Slot::count).containsExactly(3, 1, 1);
		});
	}

	@Test
	void alternateArtsAreSeparateCardsThatShareThePrintedNumberAndAreRarer() {
		CardSet set = map(List.of("OP-01"), Map.of("OP-01", romanceDawn())).sets().get(0);

		// In the order of the official list: each regular card before its other prints.
		assertThat(set.cards()).extracting(Card::externalId)
			.containsExactly("OP01-001", "OP01-001_p1", "OP01-077", "OP01-077_p1", "OP01-120", "OP01-120_p1",
					"OP01-120_p2");
		assertThat(set.cards()).extracting(Card::number)
			.containsExactly("OP01-001", "OP01-001", "OP01-077", "OP01-077", "OP01-120", "OP01-120", "OP01-120");
		assertThat(set.cards()).extracting(Card::name).containsOnly("Roronoa Zoro", "Perona", "Shanks");
		assertThat(set.cards()).extracting(Card::rarity)
			.containsExactly("leader", "parallel", "uncommon", "parallel", "secret-rare", "secret-parallel", "manga");

		Card zoro = set.cards().get(0);
		assertThat(zoro.metadata()).containsEntry("printedRarity", "Leader")
			.containsEntry("category", "Leader")
			.containsEntry("color", "Red")
			.containsEntry("power", 5000)
			.containsEntry("types", "Supernovas/Straw Hat Crew")
			.doesNotContainKey("variant");
		// Far rarer than its printed rarity says; that stays in its metadata.
		assertThat(set.cards().get(6).metadata()).containsEntry("printedRarity", "Secret Rare")
			.containsEntry("variant", "Parallel, Manga, Alternate Art");
		assertThat(set.cards().get(3).metadata()).containsEntry("variant", "Box Topper");
		assertThat(zoro.imageUrl()).isEqualTo(image("OP01-001"));
		assertThat(zoro.thumbnailUrl()).isNull();
		// The first of the rarest cards stands for the set.
		assertThat(set.coverImageUrl()).isEqualTo(image("OP01-120_p1"));
	}

	@Test
	void anSpOrTreasurePrintGetsItsOwnRarity() {
		CardSet set = map(List.of("OP-05"),
				Map.of("OP-05", List.of(card("OP05-001", "OP05-001", "Sabo", "L"),
						card("OP01-121", "OP01-121_p2", "Yamato (SP)", "SEC"),
						card("ST01-007", "ST01-007_p3", "Nami (TR)", "TR"))))
			.sets()
			.get(0);

		assertThat(set.cards()).extracting((card) -> card.externalId() + ":" + card.rarity())
			.containsExactly("OP05-001:leader", "OP01-121_p2:special", "ST01-007_p3:treasure-rare");
	}

	@Test
	void printsListedUnderTheSameIdEachGetAnIdOfTheirOwn() {
		CardSet set = map(List.of("OP14-EB04"),
				Map.of("OP14-EB04", List.of(card("OP14-074", "OP14-074", "Monet (Dash Pack)", "R"),
						card("OP14-074", "OP14-074", "Monet", "R"),
						card("OP14-080", "OP14-080", "Gecko Moria - OP14-080", "L"),
						card("OP14-080", "OP14-080", "Gecko Moria - OP14-080", "L"),
						card("EB04-001", "EB04-001", "Kuzan", "R"))))
			.sets()
			.get(0);

		assertThat(set.code()).isEqualTo("op14-eb04");
		assertThat(set.cards()).extracting((card) -> card.externalId() + ":" + card.name() + ":" + card.rarity())
			.containsExactly("EB04-001:Kuzan:rare", "OP14-074:Monet:rare", "OP14-074-dash-pack:Monet:parallel",
					"OP14-080:Gecko Moria:leader", "OP14-080-2:Gecko Moria:leader");
	}

	@Test
	void aReprintBelongsToTheSetItsNumberComesFrom() {
		OptcgCard reprint = card("OP03-070", "OP03-070", "Monkey.D.Luffy", "R");
		TcgDataset dataset = map(List.of("OP-04", "OP-03"),
				Map.of("OP-04", List.of(card("OP04-001", "OP04-001", "Nefeltari Vivi", "L"), reprint), "OP-03",
						List.of(card("OP03-001", "OP03-001", "Portgas.D.Ace", "L"), reprint)));

		assertThat(dataset.sets()).extracting(CardSet::code).containsExactly("op04", "op03");
		assertThat(dataset.sets().get(0).cards()).extracting(Card::externalId).containsExactly("OP04-001");
		assertThat(dataset.sets().get(1).cards()).extracting(Card::externalId).containsExactly("OP03-001", "OP03-070");
	}

	@Test
	void anExtraBoosterIsNamedWithoutItsPrefix() {
		CardSet set = map(List.of("EB-01"), Map.of("EB-01", List.of(card("EB01-001", "EB01-001", "Kouzuki Oden", "L"))))
			.sets()
			.get(0);

		assertThat(set.code()).isEqualTo("eb01");
		assertThat(set.name()).isEqualTo("Memorial Collection");
		assertThat(set.series()).isEqualTo("Extra Booster");
	}

	@Test
	void heroinesEditionVolumeTwoIsAnExtraBoosterShownAfterEveryExistingBoosterPack() {
		List<String> ids = SHIPPED.sets().stream().map(SetChoice::id).toList();

		assertThat(SHIPPED.sets()).filteredOn((set) -> set.id().equals("EB-05"))
			.singleElement()
			.satisfies((set) -> assertThat(set.profile()).isEqualTo("extra-booster"));
		// Sets are mapped in this order, and the first set to list an id keeps it. Coming after every
		// set the arcade already has, EB-05 can never take an id that a card players own is known by.
		assertThat(ids.indexOf("EB-05")).isGreaterThan(ids.lastIndexOf("OP-01"));
		assertThat(ids.subList(ids.indexOf("EB-05") + 1, ids.size())).containsExactly("EB-03", "EB-02", "EB-01");
	}

	@Test
	void heroinesEditionVolumeTwoMapsItsAlternateArtsAndReprintsWithoutTakingAnExistingId() {
		// Real entries as OPTCG API lists them (2026-11-12): OP-13's own Jewelry Bonney and the
		// "Heroine Leader" print of her that EB-05 lists under the very same id, OP13-100.
		TcgDataset dataset = map(List.of("OP-13", "EB-05"),
				Map.of("OP-13", List.of(card("OP13-100", "OP13-100", "Jewelry Bonney", "L")), "EB-05",
						List.of(card("EB05-043", "EB05-043", "Perona (Alternate Art)", "R"),
								card("EB05-043", "EB05-043", "Perona", "R"),
								card("OP13-100", "OP13-100", "Jewelry Bonney (100) (Heroine Leader)", "L"),
								card("EB05-055", "EB05-055_p3", "Nami (055) (Kentaro Yabuki) (Gold Stamped)", "SR"),
								card("EB05-014", "EB05-014_p2", "Shirahoshi (Manga)", "SR"),
								card("EB05-031", "EB05-031_p1", "Vinsmoke Reiju (SP)", "R"),
								card("EB05-061", "EB05-061", "Nami (061)", "SEC"))));

		assertThat(dataset.sets().get(0).cards()).extracting(Card::externalId).containsExactly("OP13-100");
		CardSet heroines = dataset.sets().get(1);
		assertThat(heroines.code()).isEqualTo("eb05");
		assertThat(heroines.externalId()).isEqualTo("EB-05");
		assertThat(heroines.name()).isEqualTo("One Piece Heroines Edition Vol. 2");
		assertThat(heroines.series()).isEqualTo("Extra Booster");
		assertThat(heroines.releasedOn()).isNull();
		assertThat(heroines.cards()).extracting((card) -> card.externalId() + ":" + card.name() + ":" + card.rarity())
			.containsExactly("EB05-014_p2:Shirahoshi:manga", "EB05-031_p1:Vinsmoke Reiju:special",
					"EB05-043:Perona:rare", "EB05-043-alternate-art:Perona:parallel",
					"EB05-055_p3:Nami:parallel", "EB05-061:Nami:secret-rare",
					"OP13-100-heroine-leader:Jewelry Bonney:parallel");
		assertThat(heroines.cards()).filteredOn((card) -> card.externalId().equals("EB05-055_p3"))
			.singleElement()
			.satisfies((card) -> assertThat(card.metadata()).containsEntry("variant", "Kentaro Yabuki, Gold Stamped")
				.containsEntry("printedRarity", "Super Rare"));
		// The extra booster's own layout, with odds only for the rarities the set has.
		assertThat(heroines.packs()).singleElement().satisfies((pack) -> {
			assertThat(pack.name()).isEqualTo("One Piece Heroines Edition Vol. 2 Booster Pack");
			assertThat(pack.slots()).extracting(Slot::count).containsExactly(1, 1);
			assertThat(pack.slots().get(1).odds()).containsOnlyKeys("rare", "parallel", "secret-rare", "special",
					"manga");
		});
	}

	@Test
	void aMissingSetOrAnUnknownRarityStopsTheImport() {
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> OnePieceDatasetMapper.map(narrowed(List.of("OP-01")), List.of(), Map.of()))
			.withMessageContaining("no set 'OP-01'");
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> map(List.of("OP-01"),
					Map.of("OP-01", List.of(card("OP01-999", "OP01-999", "Mystery", "UR"),
							card("OP01-077", "OP01-077", "Perona", "UC")))))
			.withMessageContaining("{UR=1}");
		assertThatExceptionOfType(TcgSourceException.class)
			.isThrownBy(() -> map(List.of("OP-01"), Map.of("OP-01", List.of())))
			.withMessageContaining("no cards for set 'OP-01'");
	}

	/** Maps with the shipped configuration, narrowed to some of its sets in the order given. */
	private static TcgDataset map(List<String> setIds, Map<String, List<OptcgCard>> cards) {
		return OnePieceDatasetMapper.map(narrowed(setIds), SETS, cards);
	}

	private static SourceConfig narrowed(List<String> setIds) {
		List<SetChoice> sets = setIds.stream()
			.map((id) -> SHIPPED.sets().stream().filter((set) -> set.id().equals(id)).findFirst().orElseThrow())
			.toList();
		return new SourceConfig(SHIPPED.game(), SHIPPED.rarities(), SHIPPED.variantRarities(), SHIPPED.packProfiles(),
				sets);
	}

	/** Seven real entries of OP-01, in the API's own order. */
	private static List<OptcgCard> romanceDawn() {
		return List.of(card("OP01-120", "OP01-120_p2", "Shanks (Parallel) (Manga) (Alternate Art)", "SEC"),
				zoro("OP01-001_p1", "Roronoa Zoro (Parallel)"), card("OP01-077", "OP01-077", "Perona", "UC"),
				card("OP01-120", "OP01-120", "Shanks", "SEC"), zoro("OP01-001", "Roronoa Zoro"),
				card("OP01-077", "OP01-077_p1", "Perona (Box Topper)", "UC"),
				card("OP01-120", "OP01-120_p1", "Shanks (Parallel)", "SEC"));
	}

	private static OptcgCard zoro(String imageId, String name) {
		return new OptcgCard("OP01-001", imageId, name, "L", "OP-01", "Leader", "Red", "5", "5000", null, "Slash",
				"Supernovas/Straw Hat Crew", "[DON!! x1] [Your Turn] All of your Characters gain +1000 power.",
				image(imageId));
	}

	private static OptcgCard card(String number, String imageId, String name, String rarity) {
		return new OptcgCard(number, imageId, name, rarity, "OP-01", "Character", "Blue", "1", "2000", 1000, "Special",
				"Thriller Bark Pirates", null, image(imageId));
	}

	private static String image(String imageId) {
		return "https://optcgapi.com/media/static/Card_Images/" + imageId + ".jpg";
	}

}
