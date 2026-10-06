package com.cyan.arcade.tcg.pack;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.set.SetRef;

/**
 * Which pack something came from, for embedding in other responses, with what it takes to draw it.
 *
 * @param imageUrl the pack's own artwork, or {@code null}: real card games' sources have none, and
 * the arcade draws the pack from its set's logo and cover card in the game's color
 * @param setLogoUrl the logo of the pack's set, or {@code null}
 * @param coverImageUrl a card of the pack's set to show on it, or {@code null}
 * @param accentColor the color of the pack's game, {@code #rrggbb}, or {@code null}
 */
public record PackRef(Long id, String code, String name, String imageUrl, String setLogoUrl, String coverImageUrl,
		String accentColor, SetRef set, GameRef game) {
}
