package com.cyan.arcade.progression;

import java.util.List;

import com.cyan.arcade.progression.Achievement.Reward;

import org.springframework.stereotype.Component;

/**
 * Every achievement in the arcade, in display order.
 *
 * <p>To add one, add a line here. Nothing else changes: unlocking, XP, coins, the profile page and
 * the API all work from this list.
 */
@Component
class AchievementCatalog {

	private static final List<Achievement> ALL = List.of(
			Achievement.forGamesPlayed("FIRST_GAME", "First Coin", "Finish your first game.", Reward.of(50, 100), 1),
			Achievement.forGamesPlayed("PLAY_10_GAMES", "Regular", "Finish 10 games.", Reward.of(100, 150), 10),
			Achievement.forGamesPlayed("PLAY_50_GAMES", "Arcade Rat", "Finish 50 games.", Reward.of(250, 400), 50),

			Achievement.forScore("SNAKE_25", "Growing Up", "Eat 25 apples in one game of Snake.", Reward.of(100, 150),
					"snake", 25),
			Achievement.forScore("SNAKE_100", "Python", "Eat 100 apples in one game of Snake.", Reward.of(250, 400),
					"snake", 100),

			Achievement.forDetail("REACH_512", "Halfway There", "Make a 512 tile in 2048.", Reward.of(100, 150),
					"2048", "highestTile", 512),
			Achievement.forDetail("REACH_2048", "Two Zero Four Eight", "Make the 2048 tile.", Reward.of(250, 500),
					"2048", "highestTile", 2048),

			Achievement.forDetail("TETRIS_10_LINES", "Line Worker", "Clear 10 lines in one game of Tetris.",
					Reward.of(100, 150), "tetris", "lines", 10),
			Achievement.forDetail("TETRIS_40_LINES", "Marathon", "Clear 40 lines in one game of Tetris.",
					Reward.of(250, 400), "tetris", "lines", 40),

			Achievement.forDetail("MINESWEEPER_CLEAR", "All Clear", "Clear a board in Minesweeper.",
					Reward.of(100, 150), "minesweeper", "won", 1));

	List<Achievement> all() {
		return ALL;
	}

}
