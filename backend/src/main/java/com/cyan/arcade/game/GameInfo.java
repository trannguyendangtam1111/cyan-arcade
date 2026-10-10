package com.cyan.arcade.game;

/**
 * What other features need to know about a game. They refer to games by {@code id} and never see
 * the entity itself.
 *
 * @param maxScore highest plausible score, or {@code null} when the game has no practical maximum
 * @param scored whether the platform keeps its scores (sessions, leaderboards, rewards, challenges)
 */
public record GameInfo(Long id, String slug, String name, Integer maxScore, boolean scored) {

	static GameInfo from(Game game) {
		return new GameInfo(game.getId(), game.getSlug(), game.getName(), game.getMaxScore(), game.isScored());
	}

	/** Whether a submitted score is within what this game can actually produce. */
	public boolean allowsScore(int score) {
		return score >= 0 && (this.maxScore == null || score <= this.maxScore);
	}

}
