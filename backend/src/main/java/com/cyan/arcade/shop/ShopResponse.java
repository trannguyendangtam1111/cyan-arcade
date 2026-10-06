package com.cyan.arcade.shop;

import java.util.List;

/**
 * What the shop has on sale. For a signed-in player, also their balance and level and, for every
 * item, what they own and whether they may buy it; for a guest those are {@code null}.
 */
public record ShopResponse(Long balance, Integer level, List<Item> items) {

	/**
	 * @param quantity units one purchase gives, e.g. 3 packs
	 * @param maxOwned how many a player may own at most, or {@code null} for no limit
	 * @param minLevel the level a player must have reached to buy it
	 * @param owned how many the player owns
	 * @param unlocked whether the player's level is high enough
	 * @param soldOut whether the player already owns as many as one may
	 */
	public record Item(Long id, String code, String name, String description, ItemType type, int price,
			int quantity, Integer maxOwned, int minLevel, String icon, Integer owned, Boolean unlocked,
			Boolean soldOut) {
	}

}
