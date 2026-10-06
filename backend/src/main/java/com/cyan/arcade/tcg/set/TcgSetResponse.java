package com.cyan.arcade.tcg.set;

import java.time.LocalDate;

import com.cyan.arcade.tcg.game.GameRef;

/**
 * A set of cards within a trading card game.
 *
 * @param code identifies the set within its game
 * @param series the group of sets it belongs to, e.g. "Scarlet &amp; Violet", or {@code null}
 * @param imageUrl the set's logo, or {@code null} when it has none
 * @param coverImageUrl one of the set's rarest cards, to show for it, or {@code null}
 * @param releasedOn when the set came out, if known
 * @param packCount how many of its packs can be opened
 */
public record TcgSetResponse(Long id, String code, String name, String description, String series, String imageUrl,
		String coverImageUrl, LocalDate releasedOn, GameRef game, int cardCount, int packCount) {
}
