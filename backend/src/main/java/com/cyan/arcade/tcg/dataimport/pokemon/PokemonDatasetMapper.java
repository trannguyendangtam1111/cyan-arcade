package com.cyan.arcade.tcg.dataimport.pokemon;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

import com.cyan.arcade.tcg.dataimport.SourceConfig;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexCard;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexSet;

/**
 * Turns what TCGdex says about the configured sets into a dataset. Pure: no requests, no database,
 * so it is tested on recorded answers.
 *
 * <ul>
 * <li>A card is known by its TCGdex id ({@code sv01-001}), stable across imports.
 * <li>Images: TCGdex serves each card in two sizes; the large one for a closer look and pack
 * openings, the small one for grids.
 * <li>A rarity TCGdex uses that the configuration does not map stops the import: a new kind of
 * card deserves a decision on its tier and its odds, not a silent guess.
 * </ul>
 */
final class PokemonDatasetMapper {

	/** One set as fetched: the configuration's choice and what TCGdex said about it. */
	record FetchedSet(SetChoice choice, TcgdexSet set, List<TcgdexCard> cards) {
	}

	private PokemonDatasetMapper() {
	}

	static TcgDataset map(SourceConfig config, List<FetchedSet> fetched) {
		Map<String, Integer> unmapped = new TreeMap<>();
		List<CardSet> sets = new ArrayList<>();
		String gameImage = null;

		for (FetchedSet each : fetched) {
			List<Card> cards = new ArrayList<>();
			for (TcgdexCard card : inPrintedOrder(each.cards())) {
				if (card.image() == null) {
					continue;
				}
				String rarity = config.rarityCode(card.rarity()).orElse(null);
				if (rarity == null) {
					unmapped.merge(String.valueOf(card.rarity()), 1, Integer::sum);
					continue;
				}
				Card mapped = new Card(card.id(), card.localId(), card.name(), rarity, card.image() + "/high.webp",
						card.image() + "/low.webp", metadataOf(card));
				cards.add(mapped);
				if (card.id().equals(config.game().coverCard())) {
					gameImage = mapped.imageUrl();
				}
			}
			if (cards.isEmpty()) {
				continue;
			}
			String name = Objects.requireNonNullElse(each.choice().name(), each.set().name());
			sets.add(new CardSet(SourceConfig.codeOf(each.set().id()), each.set().id(), name,
					describe(each.set(), cards.size()), (each.set().serie() != null) ? each.set().serie().name() : null,
					(each.set().logo() != null) ? each.set().logo() + ".webp" : null,
					config.coverOf(cards).map(Card::imageUrl).orElse(null), dateOf(each.set().releaseDate()), cards,
					List.of(config.pack(each.choice(), name, cards))));
		}

		if (!unmapped.isEmpty()) {
			throw new TcgSourceException(("TCGdex uses rarities the Pokémon configuration does not map: %s. "
					+ "Add them to the configuration's rarities, with a tier and pack odds.").formatted(unmapped));
		}
		return new TcgDataset(config.datasetGame(gameImage), config.datasetRarities(), sets);
	}

	/** Numbered cards by their number, then any others (such as "TG01") as text. */
	private static List<TcgdexCard> inPrintedOrder(List<TcgdexCard> cards) {
		return cards.stream()
			.sorted(Comparator.comparing((TcgdexCard card) -> !card.localId().matches("\\d+"))
				.thenComparingInt((card) -> card.localId().matches("\\d+") ? Integer.parseInt(card.localId()) : 0)
				.thenComparing(TcgdexCard::localId))
			.toList();
	}

	/** What a closer look at the card shows besides its name, number and rarity. */
	private static Map<String, Object> metadataOf(TcgdexCard card) {
		Map<String, Object> metadata = new LinkedHashMap<>();
		putIfPresent(metadata, "category", card.category());
		putIfPresent(metadata, "stage", card.stage());
		putIfPresent(metadata, "hp", card.hp());
		if (card.types() != null && !card.types().isEmpty()) {
			metadata.put("types", String.join(", ", card.types()));
		}
		putIfPresent(metadata, "illustrator", card.illustrator());
		return metadata;
	}

	private static void putIfPresent(Map<String, Object> metadata, String key, Object value) {
		if (value != null && !(value instanceof String text && text.isBlank())) {
			metadata.put(key, value);
		}
	}

	private static String describe(TcgdexSet set, int cards) {
		String series = (set.serie() != null) ? set.serie().name() + " series. " : "";
		return "%s%d cards.".formatted(series, cards);
	}

	private static LocalDate dateOf(String text) {
		if (text == null || text.isBlank()) {
			return null;
		}
		try {
			return LocalDate.parse(text.trim().replace('/', '-'));
		}
		catch (DateTimeParseException ex) {
			return null;
		}
	}

}
