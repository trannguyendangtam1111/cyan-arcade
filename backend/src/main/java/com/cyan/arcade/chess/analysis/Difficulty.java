package com.cyan.arcade.chess.analysis;

import com.cyan.arcade.chess.stockfish.SearchRequest;

/**
 * How strongly Stockfish plays in a game against it, with the engine's own strength options and a
 * time per move. The two easiest use {@code Skill Level} (which makes Stockfish pick weaker moves on
 * purpose); the next two {@code UCI_LimitStrength} with a {@code UCI_Elo} target; the last is full
 * strength. The Elo values are the engine's settings, not a promise of human-equivalent strength.
 */
public enum Difficulty {

	BEGINNER("Beginner", "Skill Level 0 of 20", 0, null, 100),

	CASUAL("Casual", "Skill Level 6 of 20", 6, null, 200),

	CLUB("Club", "Elo setting 1600", 20, 1600, 300),

	ADVANCED("Advanced", "Elo setting 2200", 20, 2200, 500),

	MAXIMUM("Maximum", "Full strength, 1 second a move", 20, null, 1000);

	private final String label;

	private final String setting;

	private final int skillLevel;

	private final Integer elo;

	private final int movetimeMs;

	Difficulty(String label, String setting, int skillLevel, Integer elo, int movetimeMs) {
		this.label = label;
		this.setting = setting;
		this.skillLevel = skillLevel;
		this.elo = elo;
		this.movetimeMs = movetimeMs;
	}

	public String label() {
		return this.label;
	}

	/** What the engine is set to, in its own terms. */
	public String setting() {
		return this.setting;
	}

	public SearchRequest.Strength strength() {
		return new SearchRequest.Strength(this.skillLevel, this.elo);
	}

	public SearchRequest.Limits limits() {
		return new SearchRequest.Limits(null, this.movetimeMs, null);
	}

	public int movetimeMs() {
		return this.movetimeMs;
	}

}
