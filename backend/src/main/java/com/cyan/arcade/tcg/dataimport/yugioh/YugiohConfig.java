package com.cyan.arcade.tcg.dataimport.yugioh;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.tcg.dataimport.SourceConfig.GameInfo;
import com.cyan.arcade.tcg.dataimport.SourceConfig.RarityRule;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.Resource;

/**
 * Which Yu-Gi-Oh! sets to read and what their printings' rarities are called here. Unlike the other
 * games' configurations it has no pack layouts: Konami publishes no pull rates, and packs are a
 * later step. Read from a JSON file kept apart from the active games' ones.
 *
 * @param region the region code a printing code must carry after its set prefix ({@code EN} in
 * {@code BETB-EN018}); printings for other regions are counted and left out
 * @param rarities the rarities, most common first, each with the provider's names for it. The code
 * is part of every printing's id, so it must never change once printings have been imported. The
 * tier groups rarities for display only; it says nothing about odds.
 * @param excludedRarities provider rarity names left out on purpose, each with the reason. Any other
 * rarity that is not mapped stops the import.
 * @param sets the sets to read, in the order they are shown
 */
record YugiohConfig(GameInfo game, String region, List<RarityRule> rarities, Map<String, String> excludedRarities,
		List<PilotSet> sets) {

	/** Lowercase words joined by single hyphens, as the arcade's set and rarity codes are. */
	private static final String CODE = "^[a-z0-9]+(-[a-z0-9]+)*$";

	YugiohConfig {
		rarities = (rarities != null) ? List.copyOf(rarities) : List.of();
		excludedRarities = (excludedRarities != null) ? Map.copyOf(excludedRarities) : Map.of();
		sets = (sets != null) ? List.copyOf(sets) : List.of();
	}

	/**
	 * @param code the arcade's own id for the set ({@code betb}): the first part of every printing's
	 * id, so it must never change
	 * @param name the provider's exact name for the set: how it is found, because the provider's set
	 * codes are not unique ("LOB" is two sets)
	 * @param prefix the set code its printings carry ({@code BETB}); a provider set of that name with
	 * another code is refused rather than guessed at
	 */
	record PilotSet(String code, String name, String prefix) {
	}

	static YugiohConfig load(Resource resource, JsonMapper json) {
		try (InputStream in = resource.getInputStream()) {
			YugiohConfig config = json.readValue(in, YugiohConfig.class);
			config.check(resource.getDescription());
			return config;
		}
		catch (IOException | JacksonException ex) {
			throw new TcgSourceException("Could not read the Yu-Gi-Oh! configuration " + resource.getDescription(), ex);
		}
	}

	/** The rule for one of the provider's rarity names, regardless of case. */
	Optional<RarityRule> rarityOf(String sourceName) {
		if (sourceName == null) {
			return Optional.empty();
		}
		String wanted = sourceName.trim().toLowerCase(Locale.ROOT);
		return this.rarities.stream()
			.filter((rule) -> rule.source().stream().anyMatch((name) -> name.toLowerCase(Locale.ROOT).equals(wanted)))
			.findFirst();
	}

	boolean isExcludedRarity(String sourceName) {
		return sourceName != null
				&& this.excludedRarities.keySet().stream().anyMatch((name) -> name.equalsIgnoreCase(sourceName.trim()));
	}

	/** Where a rarity comes in the configuration: common first. */
	int orderOf(String rarityCode) {
		for (int index = 0; index < this.rarities.size(); index++) {
			if (this.rarities.get(index).code().equals(rarityCode)) {
				return index;
			}
		}
		return this.rarities.size();
	}

	/** Catches mistakes when the configuration is read, not halfway through an import. */
	void check(String where) {
		List<String> problems = new ArrayList<>();
		if (this.game == null || this.game.slug() == null || !this.game.slug().matches(CODE)) {
			problems.add("the game needs a slug of lowercase words joined by hyphens");
		}
		if (this.region == null || !this.region.matches("^[A-Z]{1,3}$")) {
			problems.add("region must be a region code such as EN");
		}
		Set<String> rarityCodes = new HashSet<>();
		Set<String> sourceNames = new HashSet<>();
		for (RarityRule rule : this.rarities) {
			if (rule.code() == null || !rule.code().matches(CODE)) {
				problems.add("the rarity code '%s' is not lowercase words joined by hyphens".formatted(rule.code()));
			}
			if (!rarityCodes.add(rule.code())) {
				problems.add("the rarity code '%s' is used twice".formatted(rule.code()));
			}
			if (rule.tier() < 1 || rule.tier() > 5) {
				problems.add("the rarity '%s' needs a tier from 1 to 5".formatted(rule.code()));
			}
			if (rule.source() == null || rule.source().isEmpty()) {
				problems.add("the rarity '%s' names no provider rarity".formatted(rule.code()));
				continue;
			}
			rule.source()
				.stream()
				.filter((name) -> !sourceNames.add(name.toLowerCase(Locale.ROOT)))
				.forEach((name) -> problems.add("the provider rarity '%s' is mapped twice".formatted(name)));
		}
		this.excludedRarities.forEach((name, reason) -> {
			if (rarityOf(name).isPresent()) {
				problems.add("the rarity '%s' is both mapped and excluded".formatted(name));
			}
			if (reason == null || reason.isBlank()) {
				problems.add("the excluded rarity '%s' does not say why it is excluded".formatted(name));
			}
		});
		Set<String> setCodes = new HashSet<>();
		Set<String> setNames = new HashSet<>();
		for (PilotSet set : this.sets) {
			if (set.code() == null || !set.code().matches(CODE)) {
				problems.add("the set code '%s' is not lowercase words joined by hyphens".formatted(set.code()));
			}
			if (!setCodes.add(set.code())) {
				problems.add("the set code '%s' is used twice".formatted(set.code()));
			}
			if (set.name() == null || set.name().isBlank() || !setNames.add(set.name())) {
				problems.add("the set '%s' needs a provider name of its own".formatted(set.code()));
			}
			if (set.prefix() == null || !set.prefix().matches("^[A-Z0-9]+$")) {
				problems.add("the set '%s' needs its printing code prefix, such as BETB".formatted(set.code()));
			}
		}
		if (!problems.isEmpty()) {
			throw new TcgSourceException("The Yu-Gi-Oh! configuration %s is not usable: %s".formatted(where, problems));
		}
	}

}
