package com.cyan.arcade.tcg.dataimport;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * What an import wrote, or would write on a dry run: the totals of the dataset and what they did to
 * the catalog. Counts and a few ids only, never every card.
 *
 * @param dryRun whether everything was rolled back afterwards, so that the catalog is as it was
 * @param newCards how many of the cards were not in the catalog before; 0 when the same dataset is
 * imported again
 * @param updatedCards how many cards already in the catalog had something changed (name, image,
 * rarity, number, set, details or order)
 * @param unchangedCards how many cards already in the catalog were exactly as the dataset says
 * @param newSets sets that were not in the catalog before
 * @param updatedSets sets already in the catalog that had something changed (name, images, order)
 * @param newPacks packs that were not in the catalog before: they can be opened from now on
 * @param updatedPacks packs already in the catalog whose details, pool or odds changed
 * @param movedCards cards already in the catalog that the dataset puts in another set
 * @param movedExamples the first few of those, as {@code externalId: from -> to}
 * @param newCardsBySet how many cards each set gained, for the sets that gained any
 * @param setsNotInDataset sets of the game in the catalog that this dataset does not have (held
 * back, or no longer configured): they, their cards and their packs stay exactly as they were
 */
public record ImportReport(String gameSlug, boolean dryRun, int rarities, int sets, int cards, int packs,
		int newCards, int updatedCards, int unchangedCards, int newSets, int updatedSets, int newPacks,
		int updatedPacks, int movedCards, List<String> movedExamples, Map<String, Integer> newCardsBySet,
		List<String> setsNotInDataset) {

	/** How many moved cards are named in a report. */
	public static final int MOVED_EXAMPLES = 5;

	public ImportReport {
		movedExamples = (movedExamples != null) ? List.copyOf(movedExamples) : List.of();
		newCardsBySet = (newCardsBySet != null) ? Collections.unmodifiableMap(new TreeMap<>(newCardsBySet)) : Map.of();
		setsNotInDataset = (setsNotInDataset != null) ? List.copyOf(setsNotInDataset) : List.of();
	}

}
