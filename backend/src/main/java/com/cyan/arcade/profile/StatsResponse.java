package com.cyan.arcade.profile;

import java.time.Instant;
import java.util.List;

/**
 * A player's statistics: across the platform, from other modules (such as the card game), and per
 * game.
 *
 * @param playTimeMs time spent in finished runs, measured by the server
 * @param coinsEarned every coin the player has earned, spending left out
 * @param activities numbers other modules keep about the player, e.g. packs opened
 * @param games one entry per game the player has finished at least once, most played first
 */
public record StatsResponse(long gamesPlayed, long totalScore, long playTimeMs, int achievementsUnlocked,
		int achievementsTotal, long coins, long coinsEarned, List<Activity> activities, List<Game> games) {

	/** @param key stable identifier, e.g. {@code tcg.packsOpened} */
	public record Activity(String key, String label, long value) {
	}

	/**
	 * @param averageScore rounded to a whole number
	 * @param playTimeMs time spent in finished runs of this game
	 */
	public record Game(String slug, String name, long gamesPlayed, int bestScore, long averageScore, long playTimeMs,
			Instant lastPlayedAt) {
	}

}
