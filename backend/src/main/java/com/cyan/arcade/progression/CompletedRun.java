package com.cyan.arcade.progression;

import java.util.Map;
import java.util.UUID;

/**
 * Everything the progression rules may look at when a signed-in player finishes a game.
 *
 * @param sessionId the run's game session, which its rewards refer to
 * @param details game-specific numbers reported with the run, e.g. {@code lines} for Tetris or
 * {@code highestTile} for 2048
 * @param personalBest whether this score beat the player's previous best in the game
 * @param gamesPlayed how many games the player has finished in total, this one included
 */
public record CompletedRun(UUID sessionId, Long userId, String gameSlug, int score, Map<String, Integer> details,
		boolean personalBest, long gamesPlayed) {

	public CompletedRun {
		details = Map.copyOf(details);
	}

	/** A reported detail, or 0 when the game did not report it. */
	public int detail(String name) {
		return this.details.getOrDefault(name, 0);
	}

}
