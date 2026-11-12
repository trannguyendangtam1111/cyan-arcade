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
import com.cyan.arcade.tcg.dataimport.SetCheck;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.SourceFetch;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexCard;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Turns what TCGdex says about the configured sets into a dataset. Pure: no requests, no database,
 * so it is tested on recorded answers.
 *
 * <ul>
 * <li>A card is known by its TCGdex id ({@code sv01-001}), stable across imports.
 * <li>Images: TCGdex serves each card in two sizes; the large one for a closer look and pack
 * openings, the small one for grids.
 * <li>A rarity TCGdex uses that the configuration does not map stops the import: a new kind of
 * card deserves a decision on its tier and its odds, not a silent guess. A rarity the
 * configuration excludes, with its reason, is left out and logged.
 * </ul>
 */
final class PokemonDatasetMapper {

	private static final Logger log = LoggerFactory.getLogger(PokemonDatasetMapper.class);

	/**
	 * One set as fetched: the configuration's choice and what TCGdex said about it.
	 * @param set {@code null} when TCGdex does not know the set
	 */
	record FetchedSet(SetChoice choice, TcgdexSet set, List<TcgdexCard> cards) {
	}

	private PokemonDatasetMapper() {
	}

	static TcgDataset map(SourceConfig config, List<FetchedSet> fetched) {
		return mapChecked(config, fetched).dataset();
	}

	/**
	 * The dataset of the sets that can be imported now, and a check for every configured set. A set
	 * TCGdex does not know, or lists without an image for every card, is held back: nothing of it is
	 * written, so whatever of it the catalog has stays as it is.
	 * @throws TcgSourceException when a set that could otherwise be imported has a rarity the
	 * configuration neither maps nor excludes
	 */
	static SourceFetch mapChecked(SourceConfig config, List<FetchedSet> fetched) {
		Map<String, Integer> unmapped = new TreeMap<>();
		List<CardSet> sets = new ArrayList<>();
		List<SetCheck> checks = new ArrayList<>();
		String gameImage = null;

		for (FetchedSet each : fetched) {
			String id = each.choice().id();
			if (each.set() == null) {
				log.warn("Pokémon set {} held back: TCGdex does not list it", id);
				checks.add(SetCheck.notAtSource(id));
				continue;
			}
			List<Card> cards = new ArrayList<>();
			int withoutImage = 0;
			Map<String, Integer> excluded = new TreeMap<>();
			Map<String, Integer> unknown = new TreeMap<>();
			String coverImage = null;
			for (TcgdexCard card : inPrintedOrder(each.cards())) {
				if (config.isExcludedRarity(card.rarity())) {
					// Left out on purpose, for the reason the configuration gives.
					excluded.merge(card.rarity(), 1, Integer::sum);
					continue;
				}
				String rarity = config.rarityCode(card.rarity()).orElse(null);
				if (rarity == null) {
					unknown.merge(String.valueOf(card.rarity()), 1, Integer::sum);
				}
				if (card.image() == null) {
					// No picture is invented for a card: without TCGdex's own, it is not imported.
					withoutImage++;
					continue;
				}
				if (rarity == null) {
					continue;
				}
				Card mapped = new Card(card.id(), card.localId(), card.name(), rarity, card.image() + "/high.webp",
						card.image() + "/low.webp", metadataOf(card));
				cards.add(mapped);
				if (card.id().equals(config.game().coverCard())) {
					coverImage = mapped.imageUrl();
				}
			}
			String name = Objects.requireNonNullElse(each.choice().name(), each.set().name());
			SetCheck.Status status = (withoutImage > 0) ? SetCheck.Status.PENDING_IMAGES
					: cards.isEmpty() && unknown.isEmpty() ? SetCheck.Status.EMPTY : SetCheck.Status.IMPORTABLE;
			checks.add(new SetCheck(id, name, status, each.cards().size(), cards.size(), withoutImage, excluded, unknown,
					0, 0));
			if (!excluded.isEmpty()) {
				log.warn("Pokémon set {}: cards of excluded rarities left out, as configured: {}", id, excluded);
			}
			if (status == SetCheck.Status.PENDING_IMAGES) {
				log.warn("Pokémon set {} held back: TCGdex has no image for {} of its {} cards", id, withoutImage,
						each.cards().size());
				continue;
			}
			if (status == SetCheck.Status.EMPTY) {
				log.warn("Pokémon set {} held back: none of its {} cards can be imported", id, each.cards().size());
				continue;
			}
			unknown.forEach((rarity, count) -> unmapped.merge(rarity, count, Integer::sum));
			if (!unknown.isEmpty()) {
				continue;
			}
			if (coverImage != null) {
				gameImage = coverImage;
			}
			sets.add(new CardSet(SourceConfig.codeOf(each.set().id()), each.set().id(), name,
					describe(each.set(), cards.size()), (each.set().serie() != null) ? each.set().serie().name() : null,
					(each.set().logo() != null) ? each.set().logo() + ".webp" : null,
					config.coverOf(cards).map(Card::imageUrl).orElse(null), dateOf(each.set().releaseDate()), cards,
					List.of(config.pack(each.choice(), name, cards))));
		}

		if (!unmapped.isEmpty()) {
			throw new TcgSourceException(("TCGdex uses rarities the Pokémon configuration does not map: %s. "
					+ "Add them to the configuration's rarities, with a tier and pack odds, or exclude them "
					+ "with a reason (excludedRarities).").formatted(unmapped));
		}
		TcgDataset dataset = sets.isEmpty() ? null
				: new TcgDataset(config.datasetGame(gameImage), config.datasetRarities(), sets);
		return new SourceFetch(dataset, checks);
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
