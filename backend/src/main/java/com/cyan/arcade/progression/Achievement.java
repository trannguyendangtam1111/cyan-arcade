package com.cyan.arcade.progression;

import java.util.function.Predicate;

/**
 * One achievement: what it is called, what it is worth, and the rule that unlocks it.
 *
 * <p>The rule is asked once per finished run and sees only that run (see {@link CompletedRun}),
 * which already carries the totals a rule is likely to need. The factory methods below cover the
 * common shapes, so most achievements are a single line in {@link AchievementCatalog}.
 *
 * @param code stable identifier, stored when a player unlocks it; never rename one that is in use
 * @param xp experience points awarded on unlocking
 */
public record Achievement(String code, String name, String description, int xp, Predicate<CompletedRun> rule) {

	boolean isUnlockedBy(CompletedRun run) {
		return this.rule.test(run);
	}

	/** Unlocked once the player has finished this many games of any kind. */
	static Achievement forGamesPlayed(String code, String name, String description, int xp, long games) {
		return new Achievement(code, name, description, xp, (run) -> run.gamesPlayed() >= games);
	}

	/** Unlocked by reaching a score in one run of a particular game. */
	static Achievement forScore(String code, String name, String description, int xp, String gameSlug, int score) {
		return new Achievement(code, name, description, xp,
				(run) -> run.gameSlug().equals(gameSlug) && run.score() >= score);
	}

	/** Unlocked when a number the game reports about the run (lines, highest tile, ...) reaches a value. */
	static Achievement forDetail(String code, String name, String description, int xp, String gameSlug, String detail,
			int value) {
		return new Achievement(code, name, description, xp,
				(run) -> run.gameSlug().equals(gameSlug) && run.detail(detail) >= value);
	}

}
