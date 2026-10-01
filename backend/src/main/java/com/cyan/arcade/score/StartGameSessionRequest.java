package com.cyan.arcade.score;

import jakarta.validation.constraints.NotBlank;

/**
 * @param gameSlug the catalog slug of the game being started
 */
public record StartGameSessionRequest(@NotBlank String gameSlug) {
}
