package com.cyan.arcade.tcg.set;

/** Which set something belongs to, for embedding in other responses. */
public record SetRef(Long id, String code, String name) {
}
