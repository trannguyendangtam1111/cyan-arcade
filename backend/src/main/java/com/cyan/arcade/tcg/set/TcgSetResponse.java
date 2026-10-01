package com.cyan.arcade.tcg.set;

import java.time.LocalDate;

import com.cyan.arcade.tcg.game.GameRef;

/**
 * A set of cards within a trading card game.
 *
 * @param code identifies the set within its game
 * @param releasedOn when the set came out, if known
 * @param packCount how many of its packs can be opened
 */
public record TcgSetResponse(Long id, String code, String name, String description, String imageUrl,
		LocalDate releasedOn, GameRef game, int cardCount, int packCount) {
}
