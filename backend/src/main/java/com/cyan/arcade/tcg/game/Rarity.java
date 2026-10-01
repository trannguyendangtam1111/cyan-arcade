package com.cyan.arcade.tcg.game;

/**
 * One of a trading card game's rarities.
 *
 * @param code the game's own identifier for it, e.g. {@code secret-rare}
 * @param name what the game calls it
 * @param tier how special a card of this rarity is, from 1 (ordinary) to 5 (the rarest). The only
 * thing about a rarity that means the same in every game, so it is what visual effects go by.
 */
public record Rarity(String code, String name, int tier) {
}
