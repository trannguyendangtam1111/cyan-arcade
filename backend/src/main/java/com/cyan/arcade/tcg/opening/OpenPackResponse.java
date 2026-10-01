package com.cyan.arcade.tcg.opening;

/**
 * The answer to opening a pack.
 *
 * @param opening the cards the server decided on, already in the player's collection
 * @param allowance what the player may still open today, after this pack
 */
public record OpenPackResponse(OpeningResponse opening, AllowanceResponse allowance) {
}
