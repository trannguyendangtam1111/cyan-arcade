package com.cyan.arcade.progression;

import java.util.List;

import org.springframework.stereotype.Component;

/**
 * Every achievement in the arcade, in display order.
 *
 * <p>To add one, add a line here. Nothing else changes: unlocking, XP, the profile page and the
 * API all work from this list.
 */
@Component
class AchievementCatalog {

	private static final List<Achievement> ALL = List.of(
			Achievement.forGamesPlayed("FIRST_GAME", "First Coin", "Finish your first game.", 50, 1),
			Achievement.forGamesPlayed("PLAY_10_GAMES", "Regular", "Finish 10 games.", 100, 10),
			Achievement.forGamesPlayed("PLAY_50_GAMES", "Arcade Rat", "Finish 50 games.", 250, 50),

			Achievement.forScore("SNAKE_25", "Growing Up", "Eat 25 apples in one game of Snake.", 100, "snake", 25),
			Achievement.forScore("SNAKE_100", "Python", "Eat 100 apples in one game of Snake.", 250, "snake", 100),

			Achievement.forDetail("REACH_512", "Halfway There", "Make a 512 tile in 2048.", 100, "2048",
					"highestTile", 512),
			Achievement.forDetail("REACH_2048", "Two Zero Four Eight", "Make the 2048 tile.", 250, "2048",
					"highestTile", 2048),

			Achievement.forDetail("TETRIS_10_LINES", "Line Worker", "Clear 10 lines in one game of Tetris.", 100,
					"tetris", "lines", 10),
			Achievement.forDetail("TETRIS_40_LINES", "Marathon", "Clear 40 lines in one game of Tetris.", 250,
					"tetris", "lines", 40));

	List<Achievement> all() {
		return ALL;
	}

}
