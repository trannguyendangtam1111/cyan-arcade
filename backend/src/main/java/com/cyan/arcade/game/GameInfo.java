package com.cyan.arcade.game;

/**
 * What other features need to know about a game. They refer to games by {@code id} and never see
 * the entity itself.
 *
 * @param maxScore highest plausible score, or {@code null} when the game has no practical maximum
 */
public record GameInfo(Long id, String slug, String name, Integer maxScore) {

	static GameInfo from(Game game) {
		return new GameInfo(game.getId(), game.getSlug(), game.getName(), game.getMaxScore());
	}

	/** Whether a submitted score is within what this game can actually produce. */
	public boolean allowsScore(int score) {
		return score >= 0 && (this.maxScore == null || score <= this.maxScore);
	}

}
