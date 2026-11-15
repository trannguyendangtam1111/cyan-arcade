package com.cyan.arcade.score;

import java.util.Objects;

/**
 * One ruleset of a game, as its {@link RunRules} declare it. Everything that makes a mode what it is
 * (time limits, stage tables, board sizes) lives on the server with the game's rules; a client only
 * ever names a mode by its {@link #id()}.
 *
 * <p>Scores are compared only within one mode of one game, never across modes.
 *
 * @param id how the mode is named in requests and stored with runs (see {@link GameModes#FORMAT})
 * @param name what players see
 * @param ranked whether the mode has a leaderboard
 * @param order which way scores rank: higher first ({@link Order#DESC}), or lower first for times
 * @param unit what the score counts
 * @param maxScore the highest score a run of this mode may submit, or {@code null} for the game's
 * own limit ({@code games.max_score})
 * @param classicProgression whether a run of this mode earns and counts what a Classic run does
 * (achievements, daily challenges, the personal-best bonus, games played). Only for a mode that
 * splits the game's standard ruleset into separate leaderboards without changing what a run is
 * (Sudoku's Daily and its four difficulties), never for one with rules of its own.
 */
public record ModeSpec(String id, String name, boolean ranked, Order order, Unit unit, Integer maxScore,
		boolean classicProgression) {

	/** Every game's standard ruleset: the rules it had before modes existed. */
	public static final ModeSpec CLASSIC = new ModeSpec(GameModes.CLASSIC, "Classic", true, Order.DESC, Unit.POINTS,
			null);

	/** A mode with rules of its own, whose runs earn only what finishing a game earns. */
	public ModeSpec(String id, String name, boolean ranked, Order order, Unit unit, Integer maxScore) {
		this(id, name, ranked, order, unit, maxScore, false);
	}

	public ModeSpec {
		Objects.requireNonNull(id, "id");
		if (!id.matches(GameModes.FORMAT)) {
			throw new IllegalArgumentException("Mode id '" + id + "' is not lowercase letters, digits and hyphens");
		}
		if (name == null || name.isBlank()) {
			throw new IllegalArgumentException("Mode '" + id + "' needs a name");
		}
		Objects.requireNonNull(order, "order");
		Objects.requireNonNull(unit, "unit");
		if (maxScore != null && maxScore < 0) {
			throw new IllegalArgumentException("Mode '" + id + "' has a negative maximum score");
		}
		// Classic's rewards rank higher scores first; a mode that shares them must too.
		if (classicProgression && (!ranked || order != Order.DESC || unit != Unit.POINTS)) {
			throw new IllegalArgumentException("Mode '" + id + "' earns Classic progression but is not ranked points");
		}
	}

	/** Which way a mode's scores rank. */
	public enum Order {

		/** Higher is better: points. */
		DESC,

		/** Lower is better: a time to finish. */
		ASC

	}

	/** What a mode's score counts. */
	public enum Unit {

		POINTS,

		/** Game time, in milliseconds. */
		MILLISECONDS

	}

}
