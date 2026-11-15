package com.cyan.arcade.tcg.dataimport.yugioh;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import com.cyan.arcade.tcg.dataimport.SetCheck;

/**
 * The configured Yu-Gi-Oh! sets as the provider has them, printing by printing. Card data only: no
 * image of any kind. {@link YugiohSource} adds configured disabled packs to its printing dataset.
 */
record YugiohCatalog(List<SetPrintings> sets) {

	YugiohCatalog {
		sets = List.copyOf(sets);
	}

	/**
	 * One collectible printing: one card, in one set, under one code, in one rarity.
	 *
	 * @param externalId {@code <set code>:<printing code>:<rarity code>}, e.g.
	 * {@code betb:BETB-EN018:starlight-rare}. Unique and stable: the same printing always gets the
	 * same id, and two printings never share one, even when sets share a code prefix or a card is
	 * reprinted elsewhere.
	 * @param setCode the arcade's id for the set
	 * @param printingCode the code printed on the card ({@code BETB-EN018}), shared by its rarities
	 * @param rarity the arcade's rarity code
	 * @param sourceRarity the provider's name for the rarity
	 * @param passcode the card's passcode: the same card in every set and rarity
	 * @param metadata what a closer look shows: type, attribute, level or rank, ATK and DEF, effect text
	 */
	record Printing(String externalId, String setCode, String printingCode, String rarity, String sourceRarity,
			long passcode, String name, Map<String, Object> metadata) {

		Printing {
			metadata = Collections.unmodifiableMap(metadata);
		}

	}

	/**
	 * A configured set and what was found for it.
	 *
	 * @param status {@code IMPORTABLE} when its printings were read; {@code NOT_AT_SOURCE} when the
	 * provider has no set of that name; {@code EMPTY} when nothing of it can be used
	 * @param listed printings the provider lists under the set's name
	 * @param otherRegion printings for another region ({@code LOB-005}, {@code LOB-E003}), left out
	 * @param incomplete printings with no code, rarity, passcode or name, or a code that is not the
	 * set's: left out, since they cannot be told apart safely
	 * @param duplicates printings listed twice, identically: kept once
	 * @param excluded printings of rarities the configuration excludes, by provider rarity name
	 * @param unknownRarities printings of rarities the configuration does not know, by provider name
	 */
	record SetPrintings(String code, String sourceName, SetCheck.Status status, LocalDate releasedOn,
			List<Printing> printings, int listed, int otherRegion, int incomplete, int duplicates,
			Map<String, Integer> excluded, Map<String, Integer> unknownRarities) {

		SetPrintings {
			printings = List.copyOf(printings);
			excluded = Collections.unmodifiableMap(new TreeMap<>(excluded));
			unknownRarities = Collections.unmodifiableMap(new TreeMap<>(unknownRarities));
		}

		static SetPrintings notAtSource(YugiohConfig.PilotSet set) {
			return new SetPrintings(set.code(), set.name(), SetCheck.Status.NOT_AT_SOURCE, null, List.of(), 0, 0, 0, 0,
					Map.of(), Map.of());
		}

	}

}
