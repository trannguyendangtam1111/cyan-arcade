package com.cyan.arcade.progression;

/** How much experience a run is worth, before achievements. Deliberately simple. */
final class XpRules {

	/** For finishing any game, whatever the score. */
	static final int GAME_COMPLETED = 10;

	/** Extra for beating your own best score in that game. */
	static final int PERSONAL_BEST_BONUS = 25;

	private XpRules() {
	}

	static int forRun(CompletedRun run) {
		return GAME_COMPLETED + (run.personalBest() ? PERSONAL_BEST_BONUS : 0);
	}

}
