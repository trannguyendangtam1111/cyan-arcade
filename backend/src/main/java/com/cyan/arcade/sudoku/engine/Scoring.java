package com.cyan.arcade.sudoku.engine;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a finished game scores, and the details it reports to the platform. Whole numbers only, so
 * the browser, the server and the tests always agree:
 *
 * <pre>
 * score = base(difficulty) × time% × mistakes% × hints% / 1,000,000   (rounded down)
 *
 * base      Easy 1,000 · Medium 2,000 · Hard 3,500 · Expert 5,000
 * time%     150 − 50 × seconds / par, kept between 50 and 150 (100 at par; par: 6, 10, 15, 25 min)
 * mistakes% 100 − 15 per mistake, never below 55
 * hints%    100, 90, 75, 60 for 0, 1, 2, 3 hints
 * </pre>
 *
 * A failed game scores 0. The best possible score is 7,500: an Expert solve with no mistake or hint
 * in no time at all.
 */
public final class Scoring {

	public static final List<Integer> HINT_PERCENTS = List.of(100, 90, 75, 60);

	public static final int MAX_SCORE = 7500;

	/** Longer than any session lasts: only keeps the numbers in range. */
	public static final int MAX_SECONDS = 24 * 60 * 60;

	private Scoring() {
	}

	/**
	 * A finished game as it scores.
	 * @param seconds playing time measured by the server, pauses left out
	 * @param streak for a solved daily puzzle, the daily streak it makes; otherwise 0
	 */
	public record Summary(boolean solved, boolean daily, Difficulty difficulty, int seconds, int mistakes, int hints,
			int streak) {

		public Summary {
			seconds = Math.clamp(seconds, 0, MAX_SECONDS);
		}

	}

	public static int timePercent(Difficulty difficulty, int seconds) {
		long percent = 150 - Math.floorDiv(50L * seconds, difficulty.parSeconds());
		return (int) Math.clamp(percent, 50, 150);
	}

	public static int mistakePercent(int mistakes) {
		return Math.max(55, 100 - 15 * mistakes);
	}

	public static int hintPercent(int hints) {
		return HINT_PERCENTS.get(Math.clamp(hints, 0, HINT_PERCENTS.size() - 1));
	}

	public static int score(Summary run) {
		if (!run.solved()) {
			return 0;
		}
		long product = (long) run.difficulty().baseScore() * timePercent(run.difficulty(), run.seconds())
				* mistakePercent(run.mistakes()) * hintPercent(run.hints());
		return (int) (product / 1_000_000L);
	}

	/**
	 * What the run reports with its score (the platform takes at most ten details): the plain facts,
	 * and values achievements and challenges look for, all read as "at least":
	 *
	 * <ul>
	 * <li>{@code solvedLevel}, {@code flawless} (no mistake), {@code cleanSolve} (no hint): the
	 * difficulty level (1 Easy to 4 Expert) when the puzzle was solved that way, else 0, so "a Hard or
	 * harder puzzle" is simply "at least 3";</li>
	 * <li>{@code speedSolve}: 1 for a solve in half the par time;</li>
	 * <li>{@code streak}: for a solved daily puzzle, the daily streak it makes (so at least 1); 0 for
	 * anything else;</li>
	 * <li>{@code dailyGrade}: 0 unless this is a solved daily puzzle; then 1, 2 without a hint, 3
	 * without a hint or a mistake, 4 for that within par time.</li>
	 * </ul>
	 *
	 * The daily values are only ever set by a daily puzzle, which a player gets once a day.
	 */
	public static Map<String, Integer> details(Summary run) {
		boolean solved = run.solved();
		int level = run.difficulty().level();
		boolean daily = run.daily() && solved;
		Map<String, Integer> details = new LinkedHashMap<>();
		details.put("difficulty", level);
		details.put("seconds", run.seconds());
		details.put("mistakes", run.mistakes());
		details.put("hints", run.hints());
		details.put("solvedLevel", solved ? level : 0);
		details.put("flawless", (solved && run.mistakes() == 0) ? level : 0);
		details.put("cleanSolve", (solved && run.hints() == 0) ? level : 0);
		details.put("speedSolve", flag(solved && run.seconds() * 2 <= run.difficulty().parSeconds()));
		details.put("streak", daily ? Math.max(1, run.streak()) : 0);
		details.put("dailyGrade", daily ? dailyGrade(run) : 0);
		return details;
	}

	private static int dailyGrade(Summary run) {
		if (run.hints() > 0) {
			return 1;
		}
		if (run.mistakes() > 0) {
			return 2;
		}
		return (run.seconds() <= run.difficulty().parSeconds()) ? 4 : 3;
	}

	private static int flag(boolean value) {
		return value ? 1 : 0;
	}

}
