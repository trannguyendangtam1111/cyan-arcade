package com.cyan.arcade.tcg.dataimport.onepiece;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import com.cyan.arcade.tcg.dataimport.SourceConfig;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgCard;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgSet;

/**
 * Turns OPTCG API's sets and cards into a dataset. Pure, and tested on recorded data.
 *
 * <ul>
 * <li>A card is known by its official id ({@code OP01-120}, {@code OP01-120_p1} for an alternate
 * art). Alternate arts print the same number as the regular card, so they are separate cards here
 * that share a number. The few prints OPTCG API lists under the same id (a "Dash Pack" art next to
 * the regular one) get the kind of print added to the id, so every print has one of its own.
 * <li>OPTCG API writes the kind of print after the name: "Shanks (Parallel) (Manga)". The name is
 * kept without it, the kinds go in the card's metadata, and they decide its rarity through the
 * configuration's {@code variantRarities}: a parallel is far rarer than its printed rarity says.
 * <li>A card OPTCG API lists in two sets (a reprint) belongs to the set its number comes from.
 * </ul>
 */
final class OnePieceDatasetMapper {

	/** A group in brackets at the end of a name: "(Parallel)", "(SP)", "(092)". */
	private static final Pattern TRAILING_GROUP = Pattern.compile("\\s*\\(([^()]*)\\)\\s*$");

	/** A card id at the end of a name, added to tell cards of the same name apart: " - OP14-080". */
	private static final Pattern TRAILING_ID = Pattern.compile("\\s+-\\s+[A-Z]{1,4}\\d{1,2}-\\d{3}\\s*$");

	/** Groups that tell cards of the same name apart rather than say what kind of print a card is. */
	private static final Pattern DISAMBIGUATOR = Pattern.compile("^(-|\\d+|[A-Z]{1,4}\\d{1,2}(-\\d{3})?)$");

	/** A card's name without what OPTCG API adds to it, and the kinds of print it says the card is. */
	record ParsedName(String name, List<String> kinds) {
	}

	private OnePieceDatasetMapper() {
	}

	static ParsedName parseName(String raw) {
		String rest = TRAILING_ID.matcher(raw.trim()).replaceFirst("");
		List<String> kinds = new ArrayList<>();
		for (Matcher group = TRAILING_GROUP.matcher(rest); group.find(); group = TRAILING_GROUP.matcher(rest)) {
			String text = group.group(1).trim();
			if (!DISAMBIGUATOR.matcher(text).matches()) {
				kinds.add(0, text);
			}
			rest = rest.substring(0, group.start());
		}
		rest = TRAILING_ID.matcher(rest).replaceFirst("").trim();
		return new ParsedName(rest.isEmpty() ? raw.trim() : rest, kinds);
	}

	/**
	 * @param sets every set OPTCG API has
	 * @param cardsBySet the cards of each set the configuration asks for, by OPTCG API's set id
	 */
	static TcgDataset map(SourceConfig config, List<OptcgSet> sets, Map<String, List<OptcgCard>> cardsBySet) {
		Map<String, OptcgSet> setsById = new HashMap<>();
		sets.forEach((set) -> setsById.put(set.id(), set));
		Map<String, String> owners = ownersOfReprints(config, cardsBySet);
		Map<String, String> printedNames = new HashMap<>();
		config.rarities().forEach((rule) -> printedNames.put(rule.code(), rule.name()));

		Map<String, Integer> unmapped = new TreeMap<>();
		Set<String> usedIds = new HashSet<>();
		List<CardSet> result = new ArrayList<>();
		String gameImage = null;

		for (SetChoice choice : config.sets()) {
			OptcgSet set = setsById.get(choice.id());
			if (set == null) {
				throw new TcgSourceException("OPTCG API has no set '%s'".formatted(choice.id()));
			}
			List<Card> mapped = new ArrayList<>();
			for (OptcgCard card : inListOrder(choice.id(), cardsBySet.getOrDefault(choice.id(), List.of()))) {
				if (card.imageUrl() == null || card.number() == null || card.imageId() == null
						|| !choice.id().equals(owners.get(printKey(card)))) {
					continue;
				}
				String printed = config.rarityCode(card.rarity()).orElse(null);
				if (printed == null) {
					unmapped.merge(String.valueOf(card.rarity()), 1, Integer::sum);
					continue;
				}
				ParsedName name = parseName(card.name());
				boolean variant = !card.imageId().equals(card.number()) || !name.kinds().isEmpty();
				String rarity = variant ? config.variantRarityCode(printed,
						Stream.concat(name.kinds().stream(), Stream.of(card.rarity())).toList()) : printed;
				String externalId = uniqueId(card.imageId(), name.kinds(), usedIds);
				Card printCard = new Card(externalId, card.number(), name.name(), rarity, card.imageUrl(), null,
						metadataOf(card, printedNames.get(printed), variant ? kindsOf(name) : null));
				mapped.add(printCard);
				if (externalId.equals(config.game().coverCard())) {
					gameImage = printCard.imageUrl();
				}
			}
			if (mapped.isEmpty()) {
				throw new TcgSourceException("OPTCG API lists no cards for set '%s'".formatted(choice.id()));
			}

			String series = seriesOf(choice.id());
			String name = (choice.name() != null) ? choice.name() : set.name().replaceFirst("^Extra Booster:\\s*", "");
			result.add(new CardSet(SourceConfig.codeOf(choice.id()), choice.id(), name,
					"%s [%s]. %d cards, alternate arts included.".formatted((series != null) ? series : "Set",
							choice.id(), mapped.size()),
					series, null, config.coverOf(mapped).map(Card::imageUrl).orElse(null), null, mapped,
					List.of(config.pack(choice, name, mapped))));
		}

		if (!unmapped.isEmpty()) {
			throw new TcgSourceException(("OPTCG API uses rarities the One Piece configuration does not map: %s. "
					+ "Add them to the configuration's rarities, with a tier and pack odds.").formatted(unmapped));
		}
		return new TcgDataset(config.datasetGame(gameImage), config.datasetRarities(), result);
	}

	/**
	 * Which set each print belongs to, for the prints listed in more than one: the set its number
	 * comes from ({@code OP03-070} belongs to {@code OP-03}, not to {@code OP-04} that reprints it),
	 * or else the first set of the configuration that lists it.
	 */
	private static Map<String, String> ownersOfReprints(SourceConfig config, Map<String, List<OptcgCard>> cardsBySet) {
		Map<String, String> owners = new HashMap<>();
		for (SetChoice choice : config.sets()) {
			for (OptcgCard card : cardsBySet.getOrDefault(choice.id(), List.of())) {
				owners.merge(printKey(card), choice.id(),
						(current, candidate) -> !isHome(current, card) && isHome(candidate, card) ? candidate : current);
			}
		}
		return owners;
	}

	/** Two listings are the same print when they have the same id and the same name. */
	private static String printKey(OptcgCard card) {
		return card.imageId() + "|" + card.name();
	}

	/** The card number prefixes a set's own cards have: {@code OP-01} has OP01, {@code OP14-EB04} OP14 and EB04. */
	private static List<String> familiesOf(String setId) {
		return Arrays.asList(setId.replaceAll("([A-Z]+)-(\\d+)", "$1$2").split("-"));
	}

	private static boolean isHome(String setId, OptcgCard card) {
		return familiesOf(setId).contains(prefixOf(card.number()));
	}

	/** An id for the print no other card has yet: its official id, with the kind of print added if needed. */
	private static String uniqueId(String imageId, List<String> kinds, Set<String> used) {
		String id = imageId;
		if (used.contains(id) && !kinds.isEmpty()) {
			id = imageId + "-" + String.join("-", kinds).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-")
				.replaceAll("^-+|-+$", "");
		}
		String candidate = id;
		for (int next = 2; used.contains(candidate); next++) {
			candidate = id + "-" + next;
		}
		used.add(candidate);
		return candidate;
	}

	/**
	 * The order of the official card list: the set's own cards first (an OP14-EB04 booster's OP14 and
	 * EB04 cards before the ones it reprints), by number, each regular card before its other prints.
	 */
	private static List<OptcgCard> inListOrder(String setId, List<OptcgCard> cards) {
		List<String> families = familiesOf(setId);
		return cards.stream()
			.filter((card) -> card.number() != null && card.imageId() != null)
			.sorted(Comparator.comparing((OptcgCard card) -> !families.contains(prefixOf(card.number())))
				.thenComparing(OptcgCard::number)
				.thenComparing((card) -> card.imageId().length())
				.thenComparing(OptcgCard::imageId)
				.thenComparing((card) -> card.name().length()))
			.toList();
	}

	private static String prefixOf(String number) {
		int dash = number.indexOf('-');
		return (dash > 0) ? number.substring(0, dash) : number;
	}

	private static String seriesOf(String setId) {
		if (setId.startsWith("PRB")) {
			return "Premium Booster";
		}
		if (setId.startsWith("EB")) {
			return "Extra Booster";
		}
		return setId.startsWith("OP") ? "Booster Pack" : null;
	}

	private static String kindsOf(ParsedName name) {
		return name.kinds().isEmpty() ? "Alternate art" : String.join(", ", name.kinds());
	}

	private static Map<String, Object> metadataOf(OptcgCard card, String printedRarity, String variant) {
		Map<String, Object> metadata = new LinkedHashMap<>();
		putIfPresent(metadata, "printedRarity", printedRarity);
		putIfPresent(metadata, "variant", variant);
		putIfPresent(metadata, "category", card.category());
		putIfPresent(metadata, "color", card.color());
		putIfPresent(metadata, "cost", number(card.cost()));
		putIfPresent(metadata, "power", number(card.power()));
		putIfPresent(metadata, "counter", card.counter());
		putIfPresent(metadata, "attribute", card.attribute());
		putIfPresent(metadata, "types", card.types());
		putIfPresent(metadata, "effect", card.text());
		return metadata;
	}

	/** OPTCG API gives costs and power as text; a number when it is one. */
	private static Object number(String text) {
		if (text == null || text.isBlank()) {
			return null;
		}
		return text.trim().matches("\\d+") ? (Object) Integer.parseInt(text.trim()) : text.trim();
	}

	private static void putIfPresent(Map<String, Object> metadata, String key, Object value) {
		if (value != null && !(value instanceof String text && (text.isBlank() || "NULL".equalsIgnoreCase(text)))) {
			metadata.put(key, value);
		}
	}

}
