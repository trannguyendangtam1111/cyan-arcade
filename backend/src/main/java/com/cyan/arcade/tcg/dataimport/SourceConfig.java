package com.cyan.arcade.tcg.dataimport;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.Resource;

/**
 * How a source's data becomes a card game in the arcade: which sets to take, what the source's
 * rarities are called here, and what a pack of each kind holds. Read from a JSON file per source
 * ({@code classpath:tcg/sources/*.json} unless configured otherwise), so none of it is code.
 *
 * <p>Pack odds in these files are a simulator's, not the publisher's: neither Pokémon nor One Piece
 * publishes official pull rates. Each profile says so in its {@code oddsNote}, which players see.
 *
 * @param rarities the game's rarities, most common first, each with the names the source uses for it
 * @param variantRarities for a source that marks alternate-art versions of a card: the rarity code
 * such a version gets, by the kind of print it is ("SP", "Manga") or the name of its printed rarity
 * ({@code "*"} for any other). A key mapped to an empty code keeps the printed rarity. Empty for
 * sources without variants.
 * @param packProfiles kinds of pack, by name; sets refer to them
 * @param sets the sets to import, in the order they are shown
 */
public record SourceConfig(GameInfo game, List<RarityRule> rarities, Map<String, String> variantRarities,
		Map<String, PackProfile> packProfiles, List<SetChoice> sets) {

	public SourceConfig {
		variantRarities = (variantRarities != null) ? variantRarities : Map.of();
	}

	/**
	 * @param coverCard the source's id of a card whose image stands for the whole game; optional
	 */
	public record GameInfo(String slug, String name, String description, String accentColor, String attribution,
			String coverCard) {
	}

	/** @param source the names the source uses for this rarity; matched regardless of case */
	public record RarityRule(String code, String name, int tier, List<String> source) {
	}

	/**
	 * @param name the pack's name; {@code {set}} is replaced by the set's name
	 * @param slots in the order the cards come out. A rarity a set has no cards of is left out of
	 * that set's packs, and a slot left with nothing is dropped.
	 */
	public record PackProfile(String code, String name, String description, String oddsNote, List<Slot> slots) {
	}

	/**
	 * @param id the source's id for the set
	 * @param profile the kind of pack the set is opened in
	 * @param name the set's name, when the source's own is missing or poor; optional
	 */
	public record SetChoice(String id, String profile, String name) {
	}

	public static SourceConfig load(Resource resource, JsonMapper json) {
		try (InputStream in = resource.getInputStream()) {
			SourceConfig config = json.readValue(in, SourceConfig.class);
			config.check(resource.getDescription());
			return config;
		}
		catch (IOException | JacksonException ex) {
			throw new TcgSourceException("Could not read the card game source configuration " + resource.getDescription(),
					ex);
		}
	}

	/** Catches mistakes in a configuration when it is read rather than halfway through an import. */
	private void check(String where) {
		List<String> problems = new ArrayList<>();
		Set<String> codes = this.rarities.stream().map(RarityRule::code).collect(Collectors.toSet());
		this.variantRarities.values()
			.stream()
			.filter((code) -> !code.isEmpty() && !codes.contains(code))
			.forEach((code) -> problems.add("variantRarities names the unknown rarity '%s'".formatted(code)));
		this.packProfiles.forEach((name, profile) -> profile.slots()
			.stream()
			.flatMap((slot) -> slot.odds().keySet().stream())
			.filter((code) -> !codes.contains(code))
			.distinct()
			.forEach((code) -> problems.add("pack profile '%s' has odds for the unknown rarity '%s'".formatted(name, code))));
		this.sets.stream()
			.filter((set) -> !this.packProfiles.containsKey(set.profile()))
			.forEach((set) -> problems
				.add("set '%s' uses the unknown pack profile '%s'".formatted(set.id(), set.profile())));
		if (!problems.isEmpty()) {
			throw new TcgSourceException("The source configuration %s is not usable: %s".formatted(where, problems));
		}
	}

	public List<TcgDataset.Rarity> datasetRarities() {
		return this.rarities.stream().map((rule) -> new TcgDataset.Rarity(rule.code(), rule.name(), rule.tier())).toList();
	}

	public TcgDataset.Game datasetGame(String imageUrl) {
		return new TcgDataset.Game(this.game.slug(), this.game.name(), this.game.description(), imageUrl, null,
				this.game.accentColor(), this.game.attribution());
	}

	/** The rarity code for one of the source's rarity names, if the configuration knows it. */
	public Optional<String> rarityCode(String sourceName) {
		if (sourceName == null) {
			return Optional.empty();
		}
		String wanted = sourceName.trim().toLowerCase(Locale.ROOT);
		return this.rarities.stream()
			.filter((rule) -> rule.source().stream().anyMatch((name) -> name.toLowerCase(Locale.ROOT).equals(wanted)))
			.map(RarityRule::code)
			.findFirst();
	}

	/**
	 * The rarity code of an alternate-art version of a card: the one mapped to the first of
	 * {@code keys} the configuration knows, or to {@code "*"}.
	 * @param printedCode the rarity code of the printed rarity, for a version that keeps it
	 * @param keys what the source says about the version, most telling first: the kinds of print it
	 * is ("SP", "Manga"), then the name of its printed rarity
	 */
	public String variantRarityCode(String printedCode, List<String> keys) {
		String code = keys.stream()
			.filter(this.variantRarities::containsKey)
			.map(this.variantRarities::get)
			.findFirst()
			.orElseGet(() -> this.variantRarities.getOrDefault("*", ""));
		return code.isEmpty() ? printedCode : code;
	}

	/** The pack of a set, with odds only for the rarities the set actually has. */
	public Pack pack(SetChoice set, String setName, Collection<Card> cards) {
		PackProfile profile = this.packProfiles.get(set.profile());
		Set<String> present = cards.stream().map(Card::rarity).collect(Collectors.toCollection(HashSet::new));
		List<Slot> slots = new ArrayList<>();
		for (Slot slot : profile.slots()) {
			Map<String, Integer> odds = new LinkedHashMap<>(slot.odds());
			odds.keySet().retainAll(present);
			if (!odds.isEmpty()) {
				slots.add(new Slot(slot.count(), odds));
			}
		}
		return new Pack(profile.code(), profile.name().replace("{set}", setName),
				profile.description().replace("{set}", setName), null, profile.oddsNote(), slots, null);
	}

	/** A card of the set to show for it: the first of the rarest cards it has. */
	public Optional<Card> coverOf(List<Card> cards) {
		Map<String, Integer> tiers = this.rarities.stream()
			.collect(Collectors.toMap(RarityRule::code, RarityRule::tier, (first, second) -> first));
		int rarest = cards.stream().mapToInt((card) -> tiers.getOrDefault(card.rarity(), 0)).max().orElse(0);
		return cards.stream().filter((card) -> tiers.getOrDefault(card.rarity(), 0) == rarest).findFirst();
	}

	/**
	 * A set code for URLs from a source's id for it: {@code sv03.5} becomes {@code sv03-5},
	 * {@code OP-01} becomes {@code op01}.
	 */
	public static String codeOf(String externalId) {
		String code = externalId.toLowerCase(Locale.ROOT)
			.replaceAll("([a-z]+)-(\\d)", "$1$2")
			.replaceAll("[^a-z0-9]+", "-")
			.replaceAll("^-+|-+$", "");
		if (code.isEmpty()) {
			throw new TcgSourceException("Cannot make a set code out of '%s'".formatted(externalId));
		}
		return code;
	}

	/**
	 * Title case for names a source writes in capitals: "WINGS OF THE CAPTAIN" becomes "Wings of the
	 * Captain". Short joining words stay in lower case unless they come first.
	 */
	public static String titleCase(String text) {
		Set<String> small = Set.of("a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to");
		String[] words = text.trim().toLowerCase(Locale.ROOT).split("\\s+");
		StringBuilder result = new StringBuilder();
		for (int index = 0; index < words.length; index++) {
			String word = words[index];
			if (index > 0) {
				result.append(' ');
			}
			if (index > 0 && small.contains(word)) {
				result.append(word);
			}
			else if (!word.isEmpty()) {
				result.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
			}
		}
		return result.toString();
	}

}
