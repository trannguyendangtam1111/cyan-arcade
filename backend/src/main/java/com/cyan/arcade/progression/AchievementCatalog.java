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
					Reward.of(100, 150), "minesweeper", "won", 1),

			Achievement.forScore("FLAPPY_FIRST_FLIGHT", "First Flight", "Finish your first flight in Flappy Bird.",
					Reward.of(50, 75), "flappy-bird", 0),
			Achievement.forScore("FLAPPY_10", "Sky Rookie", "Fly past 10 pipes in one flight of Flappy Bird.",
					Reward.of(75, 100), "flappy-bird", 10),
			Achievement.forScore("FLAPPY_25", "High Flyer", "Fly past 25 pipes in one flight of Flappy Bird.",
					Reward.of(100, 150), "flappy-bird", 25),
			Achievement.forScore("FLAPPY_50", "Cloud Breaker", "Fly past 50 pipes in one flight of Flappy Bird.",
					Reward.of(200, 300), "flappy-bird", 50),
			Achievement.forScore("FLAPPY_100", "Sky Master", "Fly past 100 pipes in one flight of Flappy Bird.",
					Reward.of(400, 600), "flappy-bird", 100),
			Achievement.forDetail("FLAPPY_UNTOUCHABLE", "Untouchable",
					"Stay in the air for a whole minute without touching anything in Flappy Bird.", Reward.of(150, 200),
					"flappy-bird", "seconds", 60));

	List<Achievement> all() {
		return ALL;
	}

}
