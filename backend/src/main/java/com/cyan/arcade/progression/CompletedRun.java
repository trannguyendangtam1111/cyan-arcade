package com.cyan.arcade.progression;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Everything the progression rules may look at when a signed-in player finishes a game.
 *
 * <p>Achievements, daily challenges and the personal-best bonus are earned by Classic runs only: they
 * were all made for the rules every game has always had, and a new mode must not become an easier
 * way to them. A mode that only splits Classic into separate leaderboards, without changing what a
 * run is, counts as Classic here (Sudoku's Daily and its difficulties); see {@code classicRules}. What finishing a game earns (completion XP and coins, under the same daily limit in
 * every mode) is earned by a run that reached its mode's own end: every Classic run, and a run of
 * another mode only when its game's rules say it completed (Tetris Ultra: the time ran out).
 *
 * @param sessionId the run's game session, which its rewards refer to
 * @param mode the mode the run was played under, as fixed when its session started
 * @param details game-specific numbers reported with the run, e.g. {@code lines} for Tetris or
 * {@code highestTile} for 2048
 * @param personalBest whether this score beat the player's previous best in this mode of the game
 * @param gamesPlayed how many Classic games the player has finished in total, this one included
 * when it counts as Classic
 * @param completed whether the run reached its mode's own end, as its game's rules define it; only
 * such a run earns the completion reward
 * @param classicRules whether the run was played under Classic's rules: in Classic, or in a mode its
 * game declares as sharing Classic's progression
 */
public record CompletedRun(UUID sessionId, Long userId, String gameSlug, String mode, int score,
		Map<String, Integer> details, boolean personalBest, long gamesPlayed, boolean completed,
		boolean classicRules) {

	/**
	 * The mode every game has, and the only one existing rewards count. The same id as the score
	 * module's, repeated because progression cannot depend on it (the score module depends on this one).
	 */
	public static final String CLASSIC = "classic";

	public CompletedRun {
		Objects.requireNonNull(mode, "mode");
		details = Map.copyOf(details);
		if (CLASSIC.equals(mode) && !classicRules) {
			throw new IllegalArgumentException("A Classic run is played under Classic rules");
		}
	}

	/** A run whose rules are Classic's if, and only if, it is Classic. */
	public CompletedRun(UUID sessionId, Long userId, String gameSlug, String mode, int score,
			Map<String, Integer> details, boolean personalBest, long gamesPlayed, boolean completed) {
		this(sessionId, userId, gameSlug, mode, score, details, personalBest, gamesPlayed, completed,
				CLASSIC.equals(mode));
	}

	/** A run that completed if, and only if, it is Classic: what a mode that does not define completion gets. */
	public CompletedRun(UUID sessionId, Long userId, String gameSlug, String mode, int score,
			Map<String, Integer> details, boolean personalBest, long gamesPlayed) {
		this(sessionId, userId, gameSlug, mode, score, details, personalBest, gamesPlayed, CLASSIC.equals(mode));
	}

	/** A reported detail, or 0 when the game did not report it. */
	public int detail(String name) {
		return this.details.getOrDefault(name, 0);
	}

	/** Whether the run was played under Classic rules, the only ones existing rewards were made for. */
	public boolean isClassic() {
		return this.classicRules;
	}

	/** Whether the run earns what finishing a game earns (completion XP and coins, within the daily limit). */
	public boolean earnsCompletionReward() {
		return this.completed;
	}

	/** Whether the run earns the personal-best bonus (XP and coins): a new best, in Classic. */
	public boolean earnsPersonalBestBonus() {
		return this.personalBest && isClassic();
	}

}
