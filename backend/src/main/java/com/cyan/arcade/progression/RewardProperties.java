package com.cyan.arcade.progression;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The coins a run earns. Achievements and bonuses carry their own amounts.
 *
 * @param gameCompletedCoins for finishing a game, whatever the score
 * @param personalBestCoins extra for beating your own best score in that game
 * @param rewardedGamesPerDay how many games a day (UTC) earn {@code gameCompletedCoins}; later ones
 * still earn XP, best-score coins and everything else. Keeps very short runs from being farmed
 * @param rewardedPersonalBestsPerDay how many new personal bests a day (UTC, all games together) earn
 * {@code personalBestCoins}; later ones still earn their XP. Keeps a string of runs each a point
 * better than the last from being farmed
 */
@ConfigurationProperties("app.rewards")
record RewardProperties(@DefaultValue("5") int gameCompletedCoins, @DefaultValue("15") int personalBestCoins,
		@DefaultValue("40") int rewardedGamesPerDay, @DefaultValue("10") int rewardedPersonalBestsPerDay) {

	RewardProperties {
		if (gameCompletedCoins < 0 || personalBestCoins < 0 || rewardedGamesPerDay < 0
				|| rewardedPersonalBestsPerDay < 0) {
			throw new IllegalArgumentException("app.rewards values must not be negative");
		}
	}

}
