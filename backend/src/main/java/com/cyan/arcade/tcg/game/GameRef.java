package com.cyan.arcade.tcg.game;

/** Which trading card game something belongs to, for embedding in other responses. */
public record GameRef(String slug, String name) {
}
