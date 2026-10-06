package com.cyan.arcade.shop;

import java.time.Instant;
import java.util.List;

/**
 * What a player owns.
 *
 * @param bonusPacks extra card packs, from every pack item together
 */
public record InventoryResponse(List<Entry> items, int bonusPacks) {

	/**
	 * @param equippable whether it can be worn on the profile
	 * @param equipped whether it is
	 * @param consumable whether it is used up, like card packs
	 * @param gameSlug for a game skin, the game it is worn in; otherwise {@code null}
	 * @param slot for a game skin, the piece of the game it dresses; otherwise {@code null}
	 */
	public record Entry(Long itemId, String code, String name, String description, ItemType type, String icon,
			int quantity, boolean equippable, boolean equipped, boolean consumable, Instant acquiredAt,
			String gameSlug, String slot) {
	}

}
