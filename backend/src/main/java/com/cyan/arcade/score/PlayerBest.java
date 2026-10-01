package com.cyan.arcade.score;

/**
 * A player's best result in one game.
 *
 * @param rank where that score stands among all scores of the game; equal scores share a rank
 */
public record PlayerBest(int bestScore, long rank) {
}
