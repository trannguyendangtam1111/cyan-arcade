package com.cyan.arcade.score;

/**
 * A player's best result in one game.
 *
 * @param rank where that score stands among the players of the game (each counted once, by their best);
 * equal scores are ranked by who set theirs first
 */
public record PlayerBest(int bestScore, long rank) {
}
