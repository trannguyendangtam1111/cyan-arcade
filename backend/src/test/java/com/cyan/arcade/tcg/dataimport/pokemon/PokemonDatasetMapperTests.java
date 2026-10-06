package com.cyan.arcade.tcg.dataimport.pokemon;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.SourceConfig;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.pokemon.PokemonDatasetMapper.FetchedSet;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexCard;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexSet;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * TCGdex's answers, as recorded for real cards, turned into a dataset with the configuration that
 * ships with the arcade.
 */
class PokemonDatasetMapperTests {

	private static final SourceConfig CONFIG = SourceConfig.load(new ClassPathResource("tcg/sources/pokemon.json"),
			JsonMapper.builder().build());

	private static final TcgdexSet SCARLET_VIOLET = new TcgdexSet("sv01", "Scarlet & Violet", "2023-03-31",
			"https://assets.tcgdex.net/en/sv/sv01/logo", new TcgdexSet.Serie("sv", "Scarlet & Violet"));

	private static final TcgdexSet POKEMON_151 = new TcgdexSet("sv03.5", "151", "2023-09-22", null,
			new TcgdexSet.Serie("sv", "Scarlet & Violet"));

	@Test
	void mapsSetsAndCardsWithTheirImagesInTwoSizes() {
		TcgDataset dataset = map(new FetchedSet(modern("sv01"), SCARLET_VIOLET,
				List.of(pineco(), card("sv01", "257", "Basic Lightning Energy", "Hyper rare", "Energy", null))));

		assertThat(dataset.game().slug()).isEqualTo("pokemon");
		assertThat(dataset.game().accentColor()).isEqualTo("#ffcb05");
		assertThat(dataset.game().attribution()).contains("TCGdex").contains("The Pokémon Company");
		CardSet set = dataset.sets().get(0);
		assertThat(set.code()).isEqualTo("sv01");
		assertThat(set.externalId()).isEqualTo("sv01");
		assertThat(set.name()).isEqualTo("Scarlet & Violet");
		assertThat(set.series()).isEqualTo("Scarlet & Violet");
		assertThat(set.imageUrl()).isEqualTo("https://assets.tcgdex.net/en/sv/sv01/logo.webp");
		assertThat(set.releasedOn()).isEqualTo(LocalDate.of(2023, 3, 31));

		Card pineco = set.cards().get(0);
		assertThat(pineco.externalId()).isEqualTo("sv01-001");
		assertThat(pineco.number()).isEqualTo("001");
		assertThat(pineco.name()).isEqualTo("Pineco");
		assertThat(pineco.rarity()).isEqualTo("common");
		assertThat(pineco.imageUrl()).isEqualTo("https://assets.tcgdex.net/en/sv/sv01/001/high.webp");
		assertThat(pineco.thumbnailUrl()).isEqualTo("https://assets.tcgdex.net/en/sv/sv01/001/low.webp");
		assertThat(pineco.metadata()).containsExactly(Map.entry("category", "Pokemon"), Map.entry("stage", "Basic"),
				Map.entry("hp", 60), Map.entry("types", "Grass"), Map.entry("illustrator", "Shigenori Negishi"));
		// The hyper rare is the rarest card, so it stands for the set.
		assertThat(set.cards().get(1).rarity()).isEqualTo("hyper-rare");
		assertThat(set.coverImageUrl()).isEqualTo("https://assets.tcgdex.net/en/sv/sv01/257/high.webp");
	}

	@Test
	void cardsAreListedByTheirPrintedNumber() {
		TcgDataset dataset = map(new FetchedSet(modern("sv03.5"), POKEMON_151,
				List.of(card("sv03.5", "TG01", "Trainer", "Rare", "Trainer", null),
						card("sv03.5", "10", "Ten", "Common", "Pokemon", 70),
						card("sv03.5", "2", "Two", "Common", "Pokemon", 70))));

		CardSet set = dataset.sets().get(0);
		assertThat(set.code()).isEqualTo("sv03-5");
		// Numbers in order ("10" would come before "2" as text), then anything that is not a number.
		assertThat(set.cards()).extracting(Card::number).containsExactly("2", "10", "TG01");
		// No logo: the set is shown by its cover card.
		assertThat(set.imageUrl()).isNull();
		assertThat(set.coverImageUrl()).isNotNull();
	}

	@Test
	void eachSetGetsAPackWithOddsOnlyForTheRaritiesItHas() {
		TcgDataset dataset = map(new FetchedSet(modern("sv01"), SCARLET_VIOLET,
				List.of(pineco(), card("sv01", "002", "Heracross", "Uncommon", "Pokemon", 120),
						card("sv01", "081", "Miraidon ex", "Double rare", "Pokemon", 220))),
				new FetchedSet(new SetChoice("base1", "classic", null),
						new TcgdexSet("base1", "Base Set", "1999-01-09", "https://assets.tcgdex.net/en/base/base1/logo",
								new TcgdexSet.Serie("base", "Base")),
						List.of(card("base1", "58", "Pikachu", "Common", "Pokemon", 40),
								card("base1", "4", "Charizard", "Rare", "Pokemon", 120))));

		TcgDataset.Pack modern = dataset.sets().get(0).packs().get(0);
		assertThat(modern.name()).isEqualTo("Scarlet & Violet Booster Pack");
		assertThat(modern.oddsNote()).startsWith("Simulator probabilities");
		// The set has no rares at all, so only the double rare is left in the rare slot.
		assertThat(modern.slots()).extracting(Slot::odds)
			.containsExactly(Map.of("common", 1), Map.of("uncommon", 1), Map.of("common", 55, "uncommon", 35),
					Map.of("common", 430, "uncommon", 260), Map.of("double-rare", 210));
		TcgDataset.Pack classic = dataset.sets().get(1).packs().get(0);
		assertThat(classic.slots()).extracting(Slot::count).containsExactly(7, 1);
		// The game is shown by the card its configuration names: Base Set Pikachu.
		assertThat(dataset.game().imageUrl()).isEqualTo("https://assets.tcgdex.net/en/base/base1/58/high.webp");
	}

	@Test
	void aRarityTheConfigurationDoesNotKnowStopsTheImport() {
		FetchedSet withNewRarity = new FetchedSet(modern("sv01"), SCARLET_VIOLET,
				List.of(pineco(), card("sv01", "300", "Mystery", "Galaxy Rare", "Pokemon", 10),
						card("sv01", "301", "Mystery", "Galaxy Rare", "Pokemon", 10)));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> map(withNewRarity))
			.withMessageContaining("{Galaxy Rare=2}");
	}

	@Test
	void aCardWithoutAnImageIsLeftOut() {
		TcgDataset dataset = map(new FetchedSet(modern("sv01"), SCARLET_VIOLET,
				List.of(pineco(), new TcgdexCard("sv01-999", "999", "No Picture", "Common", null, "Pokemon", 10,
						List.of(), null, null, new TcgdexCard.SetId("sv01")))));

		assertThat(dataset.sets().get(0).cards()).extracting(Card::externalId).containsExactly("sv01-001");
	}

	private static TcgDataset map(FetchedSet... sets) {
		return PokemonDatasetMapper.map(CONFIG, List.of(sets));
	}

	private static SetChoice modern(String id) {
		return new SetChoice(id, "modern", null);
	}

	/** As TCGdex describes it. */
	private static TcgdexCard pineco() {
		return new TcgdexCard("sv01-001", "001", "Pineco", "Common", "https://assets.tcgdex.net/en/sv/sv01/001", "Pokemon",
				60, List.of("Grass"), "Basic", "Shigenori Negishi", new TcgdexCard.SetId("sv01"));
	}

	private static TcgdexCard card(String set, String number, String name, String rarity, String category, Integer hp) {
		String serie = set.startsWith("base") ? "base" : "sv";
		return new TcgdexCard(set + "-" + number, number, name, rarity,
				"https://assets.tcgdex.net/en/%s/%s/%s".formatted(serie, set, number), category, hp, null, null, null,
				new TcgdexCard.SetId(set));
	}

}
