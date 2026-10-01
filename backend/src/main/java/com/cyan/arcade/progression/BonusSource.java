package com.cyan.arcade.progression;

import java.util.List;

/**
 * A feature that can reward a finished run on top of the progression rules, such as daily
 * challenges. Implement it as a bean and {@link ProgressionService} picks it up: XP is still
 * granted in one place, and progression does not need to know the feature exists.
 */
public interface BonusSource {

	/**
	 * Called once for every run a signed-in player finishes, inside the transaction that records the
	 * score. An implementation must make sure each of its bonuses is given only once.
	 * @return what this run earned here; empty when nothing
	 */
	List<Bonus> award(CompletedRun run);

}
