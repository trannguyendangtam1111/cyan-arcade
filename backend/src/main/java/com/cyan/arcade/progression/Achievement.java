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
 * @param goal the number the rule compares, when a player's progress towards it can be shown from what
 * is recorded; {@code null} otherwise. It only describes the rule, which alone decides the unlock
 */
public record Achievement(String code, String name, String description, Reward reward,
		Predicate<CompletedRun> rule, Goal goal) {

	/**
	 * Only a Classic run can unlock an achievement: every rule was written for the Classic game, and
	 * another mode (a shorter one, an easier one) must not be a way round it. Enforced here, for every
	 * rule at once.
	 */
	boolean isUnlockedBy(CompletedRun run) {
		return run.isClassic() && this.rule.test(run);
	}

	/** Unlocked once the player has finished this many Classic games, of any game. */
	static Achievement forGamesPlayed(String code, String name, String description, Reward reward, int games) {
		return new Achievement(code, name, description, reward, (run) -> run.gamesPlayed() >= games,
				new Goal(Goal.Kind.GAMES_PLAYED, null, games));
	}

	/**
	 * Unlocked by reaching a score in one run of a particular game. A positive score is a goal the
	 * player's best Classic score shows progress towards; a score of 0 only asks for a finished run.
	 */
	static Achievement forScore(String code, String name, String description, Reward reward, String gameSlug,
			int score) {
		return new Achievement(code, name, description, reward,
				(run) -> run.gameSlug().equals(gameSlug) && run.score() >= score,
				(score > 0) ? new Goal(Goal.Kind.BEST_SCORE, gameSlug, score) : null);
	}

	/**
	 * Unlocked when a number the game reports about the run (lines, highest tile, ...) reaches a value.
	 * Reported numbers are not kept after the run, so there is no progress to show.
	 */
	static Achievement forDetail(String code, String name, String description, Reward reward, String gameSlug,
			String detail, int value) {
		return new Achievement(code, name, description, reward,
				(run) -> run.gameSlug().equals(gameSlug) && run.detail(detail) >= value, null);
	}

	/** What an achievement is worth. */
	public record Reward(int xp, int coins) {

		static Reward of(int xp, int coins) {
			return new Reward(xp, coins);
		}

	}

	/**
	 * The number an achievement's rule compares and the value it must reach.
	 *
	 * @param gameSlug the game, for a {@link Kind#BEST_SCORE} goal; {@code null} for games played
	 */
	public record Goal(Kind kind, String gameSlug, int target) {

		public enum Kind {

			/** Classic games finished, of any game (what {@link CompletedRun#gamesPlayed()} counts). */
			GAMES_PLAYED,

			/** The best Classic score in one game. */
			BEST_SCORE

		}

	}

}
