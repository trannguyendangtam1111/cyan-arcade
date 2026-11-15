package com.cyan.arcade.tcg.dataimport.yugioh;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

import com.cyan.arcade.tcg.dataimport.SetCheck;
import com.cyan.arcade.tcg.dataimport.SourceConfig.RarityRule;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoCard;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoPrinting;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoSet;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.Printing;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.SetPrintings;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohConfig.PilotSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Turns what YGOPRODeck says about the configured sets into printings. Pure: no requests, no
 * database, so it is tested on recorded answers.
 *
 * <ul>
 * <li>A collectible card is a <em>printing</em>: the same card is printed in many sets, and in one
 * set under one code in several rarities ({@code BETB-EN018} as an Ultra Rare and a Starlight
 * Rare). Its id is {@code <set code>:<printing code>:<rarity code>}, built from the arcade's own
 * set and rarity codes, so it never depends on a printing code being unique (it is not: sets share
 * code prefixes, and a code has several rarities).
 * <li>A set is found by its exact name, and must carry the code prefix the configuration expects.
 * <li>Only printings of the configured region are taken ({@code BETB-EN018}, not {@code LOB-E003}).
 * <li>What cannot be told apart safely stops the import, naming it: two cards under one printing
 * code, or two sets of one name. A printing missing its code, rarity, passcode or name is left out
 * and counted. A rarity the configuration neither maps nor excludes stops the import too.
 * <li>No image is read or kept.
 * </ul>
 */
final class YugiohPrintingMapper {

	private static final Logger log = LoggerFactory.getLogger(YugiohPrintingMapper.class);

	/** How many problems an error names; the rest are counted. */
	private static final int NAMED_PROBLEMS = 10;

	private YugiohPrintingMapper() {
	}

	/**
	 * @param listedSets every set the provider has
	 * @param cardsBySetName the cards of each configured set the provider has, by the set's name
	 * @throws TcgSourceException when printings are ambiguous, or of a rarity the configuration does
	 * not know
	 */
	static YugiohCatalog map(YugiohConfig config, List<YgoSet> listedSets, Map<String, List<YgoCard>> cardsBySetName) {
		List<String> problems = new ArrayList<>();
		Map<String, Integer> unmapped = new TreeMap<>();
		List<SetPrintings> result = new ArrayList<>();

		for (PilotSet pilot : config.sets()) {
			List<YgoSet> named = listedSets.stream().filter((set) -> pilot.name().equals(set.name())).toList();
			if (named.isEmpty()) {
				log.warn("Yu-Gi-Oh! set '{}' held back: YGOPRODeck does not list it", pilot.name());
				result.add(SetPrintings.notAtSource(pilot));
				continue;
			}
			if (named.size() > 1) {
				problems.add("YGOPRODeck lists %d sets named '%s'".formatted(named.size(), pilot.name()));
				continue;
			}
			YgoSet source = named.get(0);
			if (!pilot.prefix().equals(source.code())) {
				problems.add("the set '%s' has the code '%s' at YGOPRODeck, where the configuration expects '%s'"
					.formatted(pilot.name(), source.code(), pilot.prefix()));
				continue;
			}
			SetPrintings set = mapSet(config, pilot, source, cardsBySetName.getOrDefault(pilot.name(), List.of()),
					problems);
			set.unknownRarities().forEach((rarity, count) -> unmapped.merge(rarity, count, Integer::sum));
			result.add(set);
		}

		if (!problems.isEmpty()) {
			List<String> named = problems.stream().distinct().toList();
			throw new TcgSourceException("YGOPRODeck's printings cannot be told apart safely, so nothing is imported: %s%s"
				.formatted(named.subList(0, Math.min(NAMED_PROBLEMS, named.size())),
						(named.size() > NAMED_PROBLEMS) ? " and %d more".formatted(named.size() - NAMED_PROBLEMS) : ""));
		}
		if (!unmapped.isEmpty()) {
			throw new TcgSourceException(("YGOPRODeck uses rarities the Yu-Gi-Oh! configuration does not map: %s. "
					+ "Add them to the configuration's rarities, or exclude them with a reason (excludedRarities).")
				.formatted(unmapped));
		}
		return new YugiohCatalog(result);
	}

	private static SetPrintings mapSet(YugiohConfig config, PilotSet pilot, YgoSet source, List<YgoCard> cards,
			List<String> problems) {
		String codePrefix = pilot.prefix() + "-";
		int listed = 0;
		int otherRegion = 0;
		int incomplete = 0;
		int duplicates = 0;
		Map<String, Integer> excluded = new TreeMap<>();
		Map<String, Integer> unknown = new TreeMap<>();
		Map<String, Printing> byId = new LinkedHashMap<>();
		Map<String, Long> cardOfCode = new HashMap<>();
		Set<String> conflicts = new LinkedHashSet<>();

		for (YgoCard card : inPasscodeOrder(cards)) {
			for (YgoPrinting printing : card.printings()) {
				if (!pilot.name().equals(printing.setName())) {
					continue;
				}
				listed++;
				String code = trimmed(printing.code());
				if (card.id() == null || isBlank(card.name()) || code == null || isBlank(printing.rarity())
						|| !code.startsWith(codePrefix)) {
					incomplete++;
					continue;
				}
				String local = code.substring(codePrefix.length());
				if (!local.startsWith(config.region()) || local.length() == config.region().length()) {
					otherRegion++;
					continue;
				}
				if (config.isExcludedRarity(printing.rarity())) {
					excluded.merge(printing.rarity().trim(), 1, Integer::sum);
					continue;
				}
				Optional<RarityRule> rarity = config.rarityOf(printing.rarity());
				if (rarity.isEmpty()) {
					unknown.merge(printing.rarity().trim(), 1, Integer::sum);
					continue;
				}
				Long owner = cardOfCode.putIfAbsent(code, card.id());
				if (owner != null && !owner.equals(card.id())) {
					conflicts.add("the printing code %s is listed for two cards, %d and %d".formatted(code, owner, card.id()));
					continue;
				}
				String externalId = pilot.code() + ":" + code + ":" + rarity.get().code();
				if (byId.containsKey(externalId)) {
					// The same card, code and rarity listed twice: one printing.
					duplicates++;
					continue;
				}
				byId.put(externalId, new Printing(externalId, pilot.code(), code, rarity.get().code(),
						printing.rarity().trim(), card.id(), card.name().trim(), metadataOf(card, code, printing)));
			}
		}
		problems.addAll(conflicts);

		List<Printing> printings = byId.values()
			.stream()
			.sorted(Comparator.comparing(Printing::printingCode)
				.thenComparingInt((printing) -> config.orderOf(printing.rarity())))
			.toList();
		SetCheck.Status status = (printings.isEmpty() && unknown.isEmpty()) ? SetCheck.Status.EMPTY
				: SetCheck.Status.IMPORTABLE;
		if (otherRegion > 0 || incomplete > 0 || duplicates > 0 || !excluded.isEmpty()) {
			log.warn("Yu-Gi-Oh! set '{}': left out {} printings of other regions, {} incomplete, {} listed twice, "
					+ "excluded rarities {}", pilot.name(), otherRegion, incomplete, duplicates, excluded);
		}
		return new SetPrintings(pilot.code(), pilot.name(), status, dateOf(source.tcgDate()), printings, listed,
				otherRegion, incomplete, duplicates, excluded, unknown);
	}

	/** Always the same order, however the provider orders its answer. */
	private static List<YgoCard> inPasscodeOrder(List<YgoCard> cards) {
		return cards.stream()
			.sorted(Comparator.comparing(YgoCard::id, Comparator.nullsLast(Comparator.naturalOrder())))
			.toList();
	}

	/** What a closer look at the card shows besides its name and rarity. Never an image. */
	private static Map<String, Object> metadataOf(YgoCard card, String code, YgoPrinting printing) {
		Map<String, Object> metadata = new LinkedHashMap<>();
		metadata.put("passcode", card.id());
		metadata.put("printingCode", code);
		metadata.put("printingRarity", printing.rarity().trim());
		putIfPresent(metadata, "cardType", card.type());
		putIfPresent(metadata, "frameType", card.frameType());
		putIfPresent(metadata, "attribute", card.attribute());
		boolean spellOrTrap = "spell".equals(card.frameType()) || "trap".equals(card.frameType());
		putIfPresent(metadata, spellOrTrap ? "property" : "monsterType", card.race());
		boolean xyz = card.frameType() != null && card.frameType().startsWith("xyz");
		putIfPresent(metadata, xyz ? "rank" : "level", card.level());
		putIfPresent(metadata, "linkRating", card.linkval());
		putIfPresent(metadata, "pendulumScale", card.scale());
		putIfPresent(metadata, "atk", card.atk());
		putIfPresent(metadata, "def", card.def());
		putIfPresent(metadata, "archetype", card.archetype());
		putIfPresent(metadata, "effect", card.desc());
		return metadata;
	}

	private static void putIfPresent(Map<String, Object> metadata, String key, Object value) {
		if (value != null && !(value instanceof String text && text.isBlank())) {
			metadata.put(key, (value instanceof String text) ? text.trim() : value);
		}
	}

	private static String trimmed(String text) {
		return isBlank(text) ? null : text.trim();
	}

	private static boolean isBlank(String text) {
		return text == null || text.isBlank();
	}

	private static LocalDate dateOf(String text) {
		if (isBlank(text)) {
			return null;
		}
		try {
			return LocalDate.parse(text.trim());
		}
		catch (DateTimeParseException ex) {
			return null;
		}
	}

}
