package com.cyan.arcade.shop;

/**
 * Something the shop sells, as stored in {@code shop_items}.
 *
 * @param quantity units one purchase gives, e.g. 3 packs
 * @param maxOwned how many a player may own at most, or {@code null} for no limit
 * @param minLevel the level a player must have reached to buy it
 * @param icon a name the frontend turns into a picture
 */
record ShopItem(Long id, String code, String name, String description, ItemType type, int price, int quantity,
		Integer maxOwned, int minLevel, String icon, boolean active) {
}
