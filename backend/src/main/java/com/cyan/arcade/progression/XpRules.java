package com.cyan.arcade.progression;

/** How much experience a run is worth, before achievements. Deliberately simple. */
final class XpRules {

	/** For finishing a game, whatever the score: every Classic run, and a run that reached its mode's end. */
	static final int GAME_COMPLETED = 10;

	/** Extra for beating your own best score in that game, in Classic. */
	static final int PERSONAL_BEST_BONUS = 25;

	private XpRules() {
	}

	static int forRun(CompletedRun run) {
		return (run.earnsCompletionReward() ? GAME_COMPLETED : 0) + (run.earnsPersonalBestBonus() ? PERSONAL_BEST_BONUS : 0);
	}

}
