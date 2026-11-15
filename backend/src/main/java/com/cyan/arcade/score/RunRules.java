package com.cyan.arcade.score;

import java.time.Duration;
import java.util.List;
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

	/**
	 * The rulesets this game can be played under. Every game has {@link ModeSpec#CLASSIC}, which every
	 * run recorded before modes existed was played under; a game adding a mode lists it here and
	 * overrides {@link #details(String)} and {@link #problemWith(String, UUID, int, Map, Duration)}
	 * for it. Without the latter, every run of the mode is refused (never judged as Classic).
	 */
	default List<ModeSpec> modes() {
		return List.of(ModeSpec.CLASSIC);
	}

	/**
	 * The details this game reports with a run of the given mode; by default, Classic's.
	 * @param mode one of {@link #modes()}
	 */
	default Set<String> details(String mode) {
		return details();
	}

	/**
	 * Judges a run of the given mode. By default only Classic is judged (by
	 * {@link #problemWith(UUID, int, Map, Duration)}); every run of any other mode is refused, so a
	 * mode whose game forgot to give it rules of its own can never have its runs accepted under
	 * Classic's. A game adding a mode overrides this for it, with tests that pin the mode's limits.
	 * @param mode one of {@link #modes()}, as fixed when the session started
	 * @param details the run's details, exactly {@link #details(String)}
	 */
	default Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (!ModeSpec.CLASSIC.id().equals(mode)) {
			return Optional.of(NO_RULES_FOR_MODE + ": " + mode);
		}
		return problemWith(sessionId, score, details, elapsed);
	}

	/** Why a run of a mode its game gave no rules of its own was refused (logged, never shown). */
	String NO_RULES_FOR_MODE = "the mode has no rules of its own";

	/**
	 * Whether an accepted run reached its mode's own end, the only kind of run that earns what
	 * finishing a game earns (completion XP and coins). Every Classic run does: it ends when the game
	 * does. By default no run of any other mode does, so a mode that does not say what finishing it
	 * means earns no completion reward; a game adding a mode overrides this for it (Tetris Ultra: the
	 * time ran out, not an early top-out).
	 * @param mode one of {@link #modes()}, as fixed when the session started
	 * @param details the run's details, exactly {@link #details(String)}, already judged plausible
	 */
	default boolean completes(String mode, Map<String, Integer> details) {
		return ModeSpec.CLASSIC.id().equals(mode);
	}

	/** How many times an action taking at least {@code fastestMs} fits in the elapsed time. */
	static long mostActionsIn(Duration elapsed, double fastestMs) {
		return (long) Math.floor(elapsed.plus(LATENCY_ALLOWANCE).toMillis() / fastestMs);
	}

}
