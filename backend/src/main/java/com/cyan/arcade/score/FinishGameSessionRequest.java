package com.cyan.arcade.score;

import java.util.Map;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * @param score the final score of the run
 * @param details optional game-specific numbers about the run, such as {@code lines} or
 * {@code highestTile}. Used for achievements; not stored.
 */
public record FinishGameSessionRequest(@NotNull @PositiveOrZero Integer score,
		@Size(max = 10) Map<@Pattern(regexp = "^[A-Za-z][A-Za-z0-9]{0,29}$") String, @NotNull @PositiveOrZero Integer> details) {

	/** The reported details, never {@code null}. */
	Map<String, Integer> detailsOrEmpty() {
		return (this.details != null) ? this.details : Map.of();
	}

}
