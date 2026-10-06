package com.cyan.arcade.tcg.game;

import java.util.List;

/**
 * A trading card game in the arcade.
 *
 * @param imageUrl a picture for the game (one of its cards), or {@code null}
 * @param cardBackUrl the back of this game's cards, or {@code null} to use the arcade's own
 * @param accentColor the game's own color, {@code #rrggbb}, or {@code null} for the arcade's card game purple
 * @param attribution where the game's data and images come from and whose they are
 * @param rarities the game's rarities, most common first
 */
public record TcgGameResponse(Long id, String slug, String name, String description, String imageUrl,
		String cardBackUrl, String accentColor, String attribution, List<Rarity> rarities, int setCount,
		int cardCount) {
}
