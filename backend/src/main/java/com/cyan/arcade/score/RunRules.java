package com.cyan.arcade.score;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * What one game's rules say a finished run can look like: the contract between the platform and a
 * game, on the server. The games run in the browser, so the server cannot replay a run; instead
 * each game states what any real run of it must satisfy, and a submission that breaks it cannot
 * have been played. The limits come from the game's engine (board size, points per action, the
 * fastest the game moves) and are deliberately generous: an unusual but real run must always pass.
 *
 * <p>One bean per game, in {@code com.cyan.arcade.gamerules}, selected by the game's slug. That is
 * all a game brings to the server: sessions, scores, leaderboards, rewards, achievements,
 * challenges and statistics are the platform's, and a game's rules may use nothing of them. A game
 * without rules gets only the platform's checks (the score range); tests require every game in
 * the catalog to have them.
 */
public interface RunRules {

	/** Time added to what the server measured, for the requests travelling to and from it. */
	Duration LATENCY_ALLOWANCE = Duration.ofSeconds(2);

	/** The game's slug in the catalog. */
	String gameSlug();

	/**
	 * The details this game reports with every run. A run without all of them is refused, and
	 * any other detail is dropped before rewards look at the run.
	 */
	Set<String> details();

	/**
	 * @param details the run's details, exactly {@link #details()}
	 * @param elapsed how long the run lasted, measured by the server from the session's start
	 * @return why the run cannot have happened (for the server log, never for the player), or empty
	 * when it is plausible
	 */
	Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed);

	/**
	 * The same, knowing which session is being finished. A game that keeps its runs on the server as
	 * well (Word Guess holds the hidden word, every guess and every hint) judges the run by what it
	 * recorded for that session rather than by the details alone. Other games need not override it.
	 * @param sessionId the platform session the run is submitted with
	 */
	default Optional<String> problemWith(UUID sessionId, int score, Map<String, Integer> details, Duration elapsed) {
		return problemWith(score, details, elapsed);
	}

	/** How many times an action taking at least {@code fastestMs} fits in the elapsed time. */
	static long mostActionsIn(Duration elapsed, double fastestMs) {
		return (long) Math.floor(elapsed.plus(LATENCY_ALLOWANCE).toMillis() / fastestMs);
	}

}
