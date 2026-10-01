package com.cyan.arcade.tcg.card;

import java.util.Map;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.game.Rarity;
import com.cyan.arcade.tcg.set.SetRef;

/**
 * A card.
 *
 * @param number the number printed on the card; text, because real sets use things like "TG03"
 * @param metadata whatever else the card's game knows about it (type, HP, flavour text, ...). The
 * platform passes it through untouched, so its fields differ from game to game.
 */
public record CardResponse(Long id, String number, String name, String imageUrl, Rarity rarity, SetRef set,
		GameRef game, Map<String, Object> metadata) {
}
