package com.cyan.arcade.shop;

import java.time.Instant;
import java.util.Set;

/**
 * What owning an item of some types means. One bean per kind of behaviour; the shop picks the one
 * for the item's type, so a new type of item is a new handler, not a change to the shop.
 */
interface ItemHandler {

	/** The types this handler is responsible for. */
	Set<ItemType> types();

	/** Whether a player can wear an item of this type on their profile. */
	boolean isEquippable(ItemType type);

	/**
	 * Gives a player what they bought, in the purchase's transaction.
	 * @param units how many of the item they get, e.g. 3 packs
	 */
	void give(Long userId, ShopItem item, int units, Instant now);

}
