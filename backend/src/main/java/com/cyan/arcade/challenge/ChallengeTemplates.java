package com.cyan.arcade.challenge;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import com.cyan.arcade.common.platform.PlayerActivity;

import org.springframework.stereotype.Component;

/**
 * Every challenge the arcade can hand out, and which one a game or an activity gets on a given day.
 *
 * <p>To add a challenge, add a line here. A game with no lines of its own still gets the
 * challenges that fit any game, so a new game has daily challenges from its first day. An activity
 * (something players do outside the games, reported as a {@link PlayerActivity}) gets a challenge
 * every day once it has lines in {@link #ACTIVITIES}.
 */
@Component
class ChallengeTemplates {

	/**
	 * Something players do on the platform that challenges can count.
	 *
	 * @param code the {@link PlayerActivity#type()} it counts
	 * @param name what to call it on screen
	 */
	record Activity(String code, String name, List<ChallengeTemplate> templates) {
	}

	private static final List<ChallengeTemplate> ANY_GAME = List
		.of(ChallengeTemplate.play("Warm-up Round", "Finish a game of %s.", 20, 40));

	private static final Map<String, List<ChallengeTemplate>> BY_GAME = Map.of(
			"snake",
			List.of(ChallengeTemplate.score("Light Snack", "Eat 5 apples in one game of Snake.", 5, 25, 50),
					ChallengeTemplate.score("Snack Time", "Eat 10 apples in one game of Snake.", 10, 35, 70),
					ChallengeTemplate.score("Big Appetite", "Eat 20 apples in one game of Snake.", 20, 50, 100)),
			"2048",
			List.of(ChallengeTemplate.detail("Getting Warm", "Make a 128 tile in 2048.", "highestTile", 128, 30, 60),
					ChallengeTemplate.detail("Quarter Way", "Make a 256 tile in 2048.", "highestTile", 256, 40, 80),
					ChallengeTemplate.detail("Five Twelve", "Make a 512 tile in 2048.", "highestTile", 512, 60, 120),
					ChallengeTemplate.score("Number Cruncher", "Score 2,000 points in one game of 2048.", 2000, 40,
							80)),
			"tetris",
			List.of(ChallengeTemplate.detail("Tidy Up", "Clear 5 lines in one game of Tetris.", "lines", 5, 30, 60),
					ChallengeTemplate.detail("Clean Sweep", "Clear 10 lines in one game of Tetris.", "lines", 10, 50,
							100),
					ChallengeTemplate.score("Four Digits", "Score 1,000 points in one game of Tetris.", 1000, 40, 80)),
			"minesweeper",
			List.of(ChallengeTemplate.score("Careful Steps", "Score 300 points in one game of Minesweeper.", 300, 25,
					50), ChallengeTemplate.detail("Mine Free", "Clear a board in Minesweeper.", "won", 1, 50, 100)),
			"flappy-bird",
			List.of(ChallengeTemplate.score("Take Off", "Fly past 5 pipes in one flight of Flappy Bird.", 5, 25, 50),
					ChallengeTemplate.score("Pipe Dream", "Fly past 15 pipes in one flight of Flappy Bird.", 15, 40,
							80),
					ChallengeTemplate.score("Sky High", "Fly past 30 pipes in one flight of Flappy Bird.", 30, 60, 120),
					ChallengeTemplate.detail("Hang Time", "Stay in the air for 30 seconds in one flight of Flappy Bird.",
							"seconds", 30, 45, 90)),
			"brick-breaker",
			List.of(ChallengeTemplate.detail("Brick Smasher", "Destroy 20 bricks in one game of Brick Breaker.",
					"bricks", 20, 25, 50),
					ChallengeTemplate.detail("Chain Reaction", "Reach a combo of 10 in Brick Breaker.", "maxCombo", 10,
							40, 80),
					ChallengeTemplate.detail("Power Shopper", "Catch 3 power-ups in one game of Brick Breaker.",
							"powerUps", 3, 35, 70),
					ChallengeTemplate.detail("Level Up", "Clear a level of Brick Breaker.", "level", 2, 40, 80),
					ChallengeTemplate.detail("Hot Streak", "Destroy 5 bricks with Fireball in Brick Breaker.",
							"fireBricks", 5, 50, 100),
					ChallengeTemplate.detail("Pew Pew", "Destroy 5 bricks with the Laser in Brick Breaker.",
							"laserBricks", 5, 50, 100)));

	private static final List<Activity> ACTIVITIES = List.of(new Activity(PlayerActivity.TCG_PACK_OPENED, "Card packs",
			List.of(ChallengeTemplate.count("Pack Opener", "Open 3 card packs today.", 3, 30, 60),
					ChallengeTemplate.count("Card Hunter", "Open 5 card packs today.", 5, 40, 80))));

	/** Every challenge a game can be given: its own first, then the ones that fit any game. */
	List<ChallengeTemplate> forGame(String gameSlug) {
		return Stream.concat(BY_GAME.getOrDefault(gameSlug, List.of()).stream(), ANY_GAME.stream()).toList();
	}

	/** The activities that get a challenge every day. */
	List<Activity> activities() {
		return ACTIVITIES;
	}

	/**
	 * The challenge a game gets on a date. A game's challenges take turns, one per day, so the same
	 * date always gives the same answer and every challenge comes around.
	 * @param position where the game stands in the catalog; shifts each game's rotation so they do
	 * not all reach their easiest challenge on the same day
	 */
	ChallengeTemplate pick(String gameSlug, int position, LocalDate date) {
		return pick(forGame(gameSlug), position, date);
	}

	/** The same for an activity. */
	ChallengeTemplate pick(Activity activity, LocalDate date) {
		return pick(activity.templates(), 0, date);
	}

	private static ChallengeTemplate pick(List<ChallengeTemplate> options, int position, LocalDate date) {
		return options.get(Math.floorMod(date.toEpochDay() + position, options.size()));
	}

}
