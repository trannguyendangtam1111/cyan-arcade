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
					"flappy-bird", "seconds", 60),

			Achievement.forDetail("BRICK_FIRST_BREAK", "First Break", "Destroy your first brick in Brick Breaker.",
					Reward.of(50, 75), "brick-breaker", "bricks", 1),
			Achievement.forDetail("BRICK_COMBO_5", "Combo Starter", "Reach a combo of 5 in Brick Breaker.",
					Reward.of(75, 100), "brick-breaker", "maxCombo", 5),
			Achievement.forDetail("BRICK_COMBO_15", "Combo Master", "Reach a combo of 15 in Brick Breaker.",
					Reward.of(200, 300), "brick-breaker", "maxCombo", 15),
			Achievement.forDetail("BRICK_POWER_HUNGRY", "Power Hungry",
					"Catch 5 power-ups in one game of Brick Breaker.", Reward.of(100, 150), "brick-breaker", "powerUps",
					5),
			Achievement.forDetail("BRICK_MULTI_BALL", "Multi-Ball Mayhem",
					"Have 3 balls in play at once in Brick Breaker.", Reward.of(100, 150), "brick-breaker", "maxBalls", 3),
			Achievement.forDetail("BRICK_FIRESTORM", "Firestorm", "Destroy 10 bricks with Fireball in one game.",
					Reward.of(150, 200), "brick-breaker", "fireBricks", 10),
			Achievement.forDetail("BRICK_LASER_SHOW", "Laser Show", "Destroy 10 bricks with the Laser in one game.",
					Reward.of(150, 200), "brick-breaker", "laserBricks", 10),
			Achievement.forDetail("BRICK_CRUSHER", "Brick Crusher", "Destroy 100 bricks in one game of Brick Breaker.",
					Reward.of(250, 400), "brick-breaker", "bricks", 100),
			Achievement.forDetail("BRICK_PERFECT_CLEAR", "Perfect Clear",
					"Clear a level of Brick Breaker without losing a life.", Reward.of(150, 200), "brick-breaker",
					"perfectClears", 1),
			Achievement.forDetail("BRICK_FLAWLESS", "Flawless",
					"Clear 5 levels without losing a life in one game of Brick Breaker.", Reward.of(400, 600),
					"brick-breaker", "perfectClears", 5),

			// Word Guess reports only daily puzzles, one a day, so none of these can be farmed.
			Achievement.forScore("WORDLE_FIRST_GUESS", "First Guess", "Finish your first Daily Word in Word Guess.",
					Reward.of(50, 75), "wordle", 0),
			Achievement.forDetail("WORDLE_SOLVED", "Word Wizard", "Solve a Daily Word in Word Guess.",
					Reward.of(75, 100), "wordle", "solved", 1),
			Achievement.forDetail("WORDLE_CLEAN_SWEEP", "Clean Sweep", "Solve a Daily Word without a hint.",
					Reward.of(100, 150), "wordle", "cleanSolve", 1),
			Achievement.forDetail("WORDLE_SPEED_THINKER", "Speed Thinker", "Solve a Daily Word in 3 guesses or fewer.",
					Reward.of(150, 200), "wordle", "speed", 4),
			Achievement.forDetail("WORDLE_STREAK_3", "Daily Streak", "Solve the Daily Word 3 days in a row.",
					Reward.of(150, 200), "wordle", "streak", 3),
			Achievement.forDetail("WORDLE_PERFECT_WEEK", "Perfect Week", "Solve the Daily Word 7 days in a row.",
					Reward.of(300, 450), "wordle", "streak", 7),

			// Sudoku's numbers are the server's own (it plays the run), so none can be claimed. Level
			// flags hold the difficulty (1 Easy to 4 Expert) when met; daily ones come once a day.
			Achievement.forDetail("SUDOKU_FIRST_SOLVE", "First Solve", "Solve your first Sudoku.", Reward.of(50, 75),
					"sudoku", "solvedLevel", 1),
			Achievement.forDetail("SUDOKU_HARD_THINKER", "Hard Thinker", "Solve a Hard Sudoku.", Reward.of(150, 200),
					"sudoku", "solvedLevel", 3),
			Achievement.forDetail("SUDOKU_EXPERT_SOLVER", "Expert Solver", "Solve an Expert Sudoku.",
					Reward.of(300, 450), "sudoku", "solvedLevel", 4),
			Achievement.forDetail("SUDOKU_NO_MISTAKES", "No Mistakes",
					"Solve a Medium or harder Sudoku without a mistake.", Reward.of(100, 150), "sudoku", "flawless", 2),
			Achievement.forDetail("SUDOKU_NO_HINTS", "No Hints", "Solve a Hard or Expert Sudoku without a hint.",
					Reward.of(150, 200), "sudoku", "cleanSolve", 3),
			Achievement.forDetail("SUDOKU_SPEED_SOLVER", "Speed Solver", "Solve a Sudoku in half its par time.",
					Reward.of(150, 200), "sudoku", "speedSolve", 1),
			Achievement.forDetail("SUDOKU_DAILY_STREAK", "Daily Streak", "Solve the Daily Sudoku 3 days in a row.",
					Reward.of(150, 200), "sudoku", "streak", 3),
			Achievement.forDetail("SUDOKU_PERFECT_WEEK", "Perfect Week", "Solve the Daily Sudoku 7 days in a row.",
					Reward.of(300, 450), "sudoku", "streak", 7));

	List<Achievement> all() {
		return ALL;
	}

}
