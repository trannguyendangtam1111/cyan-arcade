package com.cyan.arcade.tcg.dataimport;

import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;

/**
 * What a source found for one configured set before anything is written: whether it can be
 * imported now, and which of its cards were left out and why. Counts only, never card details.
 *
 * @param setId the source's id for the set
 * @param name the set's name, when the source gave one
 * @param status whether the set takes part in this import
 * @param listed cards the source lists for the set
 * @param importable cards that go into the dataset
 * @param withoutImage cards the source has no image for
 * @param excluded cards left out because the configuration excludes their rarity, by rarity name
 * @param unknownRarities cards of rarities the configuration does not know, by rarity name; they
 * stop the import of a set that is otherwise importable
 * @param otherSet prints the source also lists for this set that belong to another configured set
 * @param renamedIds prints listed under an id another print already has, given an id of their own
 */
public record SetCheck(String setId, String name, Status status, int listed, int importable, int withoutImage,
		Map<String, Integer> excluded, Map<String, Integer> unknownRarities, int otherSet, int renamedIds) {

	public SetCheck {
		excluded = sorted(excluded);
		unknownRarities = sorted(unknownRarities);
	}

	/** A set the source does not list at all: nothing of it is written, its pack stays as it was. */
	public static SetCheck notAtSource(String setId) {
		return new SetCheck(setId, null, Status.NOT_AT_SOURCE, 0, 0, 0, Map.of(), Map.of(), 0, 0);
	}

	/** In a stable order, so that reports of the same data read the same. */
	private static Map<String, Integer> sorted(Map<String, Integer> counts) {
		return (counts != null) ? Collections.unmodifiableMap(new TreeMap<>(counts)) : Map.of();
	}

	public enum Status {

		/** Complete: the set is imported. */
		IMPORTABLE,

		/**
		 * The source lists the set but not an image for every card (a new expansion often arrives
		 * this way). It is left out until it is complete, so no pack is made of part of a set;
		 * anything of it already in the catalog stays as it was.
		 */
		PENDING_IMAGES,

		/** Nothing of the set can be imported (every card excluded or unusable). Left out. */
		EMPTY,

		/** The source does not list the set. Left out; anything of it already in the catalog stays. */
		NOT_AT_SOURCE

	}

}
