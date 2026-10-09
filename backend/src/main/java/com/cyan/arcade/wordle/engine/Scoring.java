package com.cyan.arcade.wordle.engine;

import java.util.Map;

/**
 * What a finished Word Guess run scores, and the details it reports to the platform. The whole rule:
 *
 * <pre>
 * failed:  0
 * solved:  floor(100 × (7 − guesses) × hint% / 100) + 10 × min(streak − 1, 10)
 *
 *          guesses 1 → 600, 2 → 500, 3 → 400, 4 → 300, 5 → 200, 6 → 100
 *          hint%   0 hints → 100, 1 → 90, 2 → 75, 3 → 60
 *          streak  the daily streak this solve makes, today included (the first day adds nothing)
 * </pre>
 *
 * So fewer guesses always beat a longer streak's bonus, a hint always costs something, and the best
 * run there can be scores {@value #MAX_SCORE}. The server works this out from what it recorded; the
 * score a client sends must match it exactly.
 */
public final class Scoring {

	/** The score multiplier, in percent, by the number of hints taken. */
	static final int[] HINT_PERCENT = { 100, 90, 75, 60 };

	static final int POINTS_PER_SPARE_GUESS = 100;

	static final int STREAK_BONUS_PER_DAY = 10;

	/** Streak days that add to the score; a longer streak adds no more. */
	static final int STREAK_BONUS_DAYS = 10;

	public static final int MAX_SCORE = POINTS_PER_SPARE_GUESS * WordleRules.MAX_GUESSES
			+ STREAK_BONUS_PER_DAY * STREAK_BONUS_DAYS;

	private Scoring() {
	}

	/**
	 * @param guesses guesses used, 1 to 6
	 * @param hints hints taken, 0 to 3
	 * @param streak the daily streak after this run (0 when it is not a daily puzzle)
	 */
	public static int score(boolean solved, int guesses, int hints, int streak) {
		if (!solved) {
			return 0;
		}
		checkRange(guesses, hints);
		int base = POINTS_PER_SPARE_GUESS * (WordleRules.MAX_GUESSES + 1 - guesses);
		return base * HINT_PERCENT[hints] / 100 + streakBonus(streak);
	}

	public static int hintPercent(int hints) {
		return HINT_PERCENT[hints];
	}

	static int streakBonus(int streak) {
		return STREAK_BONUS_PER_DAY * Math.clamp(streak - 1L, 0, STREAK_BONUS_DAYS);
	}

	/**
	 * The numbers a run reports to the platform, which achievements and daily challenges count. Every
	 * one is a "reach at least" number, which is how they are matched:
	 * <ul>
	 * <li>{@code solved}: 1 when solved;</li>
	 * <li>{@code guesses}, {@code hints}: as used;</li>
	 * <li>{@code speed}: 7 − guesses when solved (solving in 3 or fewer is a speed of 4 or more), else 0;</li>
	 * <li>{@code cleanSolve}: 1 when solved without a hint;</li>
	 * <li>{@code oneHintSolve}: 1 when solved with exactly one hint;</li>
	 * <li>{@code streak}: the daily streak after this run.</li>
	 * </ul>
	 */
	public static Map<String, Integer> details(boolean solved, int guesses, int hints, int streak) {
		return Map.of("solved", solved ? 1 : 0, "guesses", guesses, "hints", hints, "speed",
				solved ? WordleRules.MAX_GUESSES + 1 - guesses : 0, "cleanSolve", (solved && hints == 0) ? 1 : 0,
				"oneHintSolve", (solved && hints == 1) ? 1 : 0, "streak", solved ? streak : 0);
	}

	private static void checkRange(int guesses, int hints) {
		if (guesses < 1 || guesses > WordleRules.MAX_GUESSES || hints < 0 || hints > WordleRules.MAX_HINTS) {
			throw new IllegalArgumentException("Not a Word Guess run: %d guesses, %d hints".formatted(guesses, hints));
		}
	}

}
