package com.cyan.arcade.tcg.game;

import java.util.List;

/**
 * A trading card game in the arcade.
 *
 * @param cardBackUrl the back of this game's cards, or {@code null} to use the arcade's own
 * @param rarities the game's rarities, most common first
 */
public record TcgGameResponse(Long id, String slug, String name, String description, String imageUrl,
		String cardBackUrl, List<Rarity> rarities, int setCount, int cardCount) {
}
