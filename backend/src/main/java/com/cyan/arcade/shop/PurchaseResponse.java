package com.cyan.arcade.shop;

import java.time.Instant;

/**
 * A purchase that was made.
 *
 * @param price what it cost
 * @param quantity units it gave, e.g. 3 packs
 * @param balance the player's coins now
 * @param owned how many of the item the player owns now
 * @param repeated {@code true} when this request had already been made: nothing was bought or
 * charged this time
 */
public record PurchaseResponse(Long purchaseId, ShopResponse.Item item, int price, int quantity, long balance,
		int owned, boolean repeated, Instant purchasedAt) {
}
