package com.cyan.arcade.score;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * @param gameSlug the catalog slug of the game being started
 * @param mode the ruleset to play under; absent or {@code null} for {@link GameModes#CLASSIC}, which is
 * what every client written before modes existed gets
 */
public record StartGameSessionRequest(@NotBlank String gameSlug,
		@Pattern(regexp = GameModes.FORMAT, message = "must be lowercase letters, digits and hyphens") String mode) {
}
