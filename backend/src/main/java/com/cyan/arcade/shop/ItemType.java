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

	/** A frame around the avatar on the profile; one can be worn at a time. */
	COSMETIC,

	/**
	 * A new look for one of a game's pieces (Flappy Bird's bird, say), worn in that game. Purely
	 * cosmetic: it never changes how the game plays. One can be worn per {@link ShopItem#slot() slot}
	 * of a game at a time; wearing none means the game's own default look.
	 */
	GAME_SKIN

}
