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
 * @param reward what unlocking it earns, paid by {@link ProgressionService} like every other reward
 */
public record Achievement(String code, String name, String description, Reward reward,
		Predicate<CompletedRun> rule) {

	boolean isUnlockedBy(CompletedRun run) {
		return this.rule.test(run);
	}

	/** Unlocked once the player has finished this many games of any kind. */
	static Achievement forGamesPlayed(String code, String name, String description, Reward reward, long games) {
		return new Achievement(code, name, description, reward, (run) -> run.gamesPlayed() >= games);
	}

	/** Unlocked by reaching a score in one run of a particular game. */
	static Achievement forScore(String code, String name, String description, Reward reward, String gameSlug,
			int score) {
		return new Achievement(code, name, description, reward,
				(run) -> run.gameSlug().equals(gameSlug) && run.score() >= score);
	}

	/** Unlocked when a number the game reports about the run (lines, highest tile, ...) reaches a value. */
	static Achievement forDetail(String code, String name, String description, Reward reward, String gameSlug,
			String detail, int value) {
		return new Achievement(code, name, description, reward,
				(run) -> run.gameSlug().equals(gameSlug) && run.detail(detail) >= value);
	}

	/** What an achievement is worth. */
	public record Reward(int xp, int coins) {

		static Reward of(int xp, int coins) {
			return new Reward(xp, coins);
		}

	}

}
