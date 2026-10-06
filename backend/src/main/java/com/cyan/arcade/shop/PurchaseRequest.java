package com.cyan.arcade.shop;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * What to buy. The price, the player and the balance all come from the server.
 *
 * @param requestId a random id the client makes for each purchase it means to make; sending the
 * same one again (a double click, a retried request) returns the first purchase instead of buying
 * twice
 */
public record PurchaseRequest(@NotNull Long itemId, @NotNull UUID requestId) {
}
