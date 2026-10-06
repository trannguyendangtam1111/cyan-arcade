package com.cyan.arcade.shop;

/**
 * Kinds of things the shop sells. What owning one means is decided by its {@link ItemHandler};
 * the database accepts exactly these.
 */
public enum ItemType {

	/** Extra card packs, used once the daily allowance is gone. */
	PACK,

	/** Shown on the profile; one can be worn at a time. */
	BADGE,

	/** Shown under the player's name; one can be worn at a time. */
	TITLE,

	/** Owned, nothing more yet: the place for future cosmetics. */
	COSMETIC

}
