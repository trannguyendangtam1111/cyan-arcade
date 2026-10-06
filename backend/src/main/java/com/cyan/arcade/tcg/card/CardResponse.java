package com.cyan.arcade.tcg.card;

import java.util.Map;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.game.Rarity;
import com.cyan.arcade.tcg.set.SetRef;

/**
 * A card.
 *
 * @param externalId the card's id in the source it was imported from, e.g. {@code sv01-001}
 * @param number the number printed on the card; text, because real sets use things like "TG03".
 * Alternate arts of a card share its number.
 * @param imageUrl the full-size image
 * @param thumbnailUrl a smaller image for grids, or {@code null} when there is only one size
 * @param metadata whatever else the card's game knows about it (type, HP, colors, ...). The
 * platform passes it through untouched, so its fields differ from game to game.
 */
public record CardResponse(Long id, String externalId, String number, String name, String imageUrl,
		String thumbnailUrl, Rarity rarity, SetRef set, GameRef game, Map<String, Object> metadata) {
}
