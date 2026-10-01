package com.cyan.arcade.tcg.pack;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.set.SetRef;

/** Which pack something came from, for embedding in other responses. */
public record PackRef(Long id, String code, String name, String imageUrl, SetRef set, GameRef game) {
}
