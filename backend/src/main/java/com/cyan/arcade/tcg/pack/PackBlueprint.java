package com.cyan.arcade.tcg.pack;

import java.util.List;
import java.util.Map;

/**
 * Everything needed to decide what comes out of a pack: its rarity rules and its card pool.
 *
 * @param active whether the pack can currently be opened
 * @param slots one entry per card of the pack, in the order the cards come out
 * @param cardIdsByRarity the pool: the cards that can come out, grouped by rarity id
 */
public record PackBlueprint(Long packId, boolean active, List<Slot> slots, Map<Long, List<Long>> cardIdsByRarity) {

	/** @param odds the rarities this card of the pack can turn out to be */
	public record Slot(int number, List<Odds> odds) {
	}

	/** @param weight how likely the rarity is, relative to the other rarities of the same slot */
	public record Odds(Long rarityId, int weight) {
	}

}
