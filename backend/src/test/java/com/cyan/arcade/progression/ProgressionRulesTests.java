package com.cyan.arcade.progression;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.progression.Levels.LevelProgress;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** The progression rules on their own: no database, no web layer. */
class ProgressionRulesTests {

	private final List<Achievement> catalog = new AchievementCatalog().all();

	@ParameterizedTest
	@CsvSource({ "0, 1", "99, 1", "100, 2", "299, 2", "300, 3", "599, 3", "600, 4", "1000, 5", "4500, 10" })
	void xpTurnsIntoLevels(int xp, int level) {
		assertThat(Levels.levelFor(xp)).isEqualTo(level);
	}

	@Test
	void eachLevelTakesAHundredXpMoreThanTheLast() {
		assertThat(Levels.xpToReach(1)).isZero();
		assertThat(Levels.xpToReach(2)).isEqualTo(100);
		assertThat(Levels.xpToReach(3)).isEqualTo(300);
		assertThat(Levels.xpToReach(4)).isEqualTo(600);
	}

	@Test
	void progressWithinALevelIsMeasuredFromWhereTheLevelStarts() {
		assertThat(Levels.progress(0)).isEqualTo(new LevelProgress(1, 0, 100));
		assertThat(Levels.progress(85)).isEqualTo(new LevelProgress(1, 85, 100));
		assertThat(Levels.progress(100)).isEqualTo(new LevelProgress(2, 0, 200));
		assertThat(Levels.progress(450)).isEqualTo(new LevelProgress(3, 150, 300));
	}

	@Test
	void aRunIsWorthTenXpAndTwentyFiveMoreForAPersonalBest() {
		assertThat(XpRules.forRun(run("snake", 3, Map.of(), false, 5))).isEqualTo(10);
		assertThat(XpRules.forRun(run("snake", 3, Map.of(), true, 5))).isEqualTo(35);
	}

	@Test
	void achievementCodesAreUniqueAndEveryAchievementIsWorthSomething() {
		assertThat(this.catalog).extracting(Achievement::code).doesNotHaveDuplicates();
		assertThat(this.catalog).allSatisfy((achievement) -> {
			assertThat(achievement.code()).matches("[A-Z0-9_]{1,50}");
			assertThat(achievement.name()).isNotBlank();
			assertThat(achievement.description()).isNotBlank();
			assertThat(achievement.reward().xp()).isPositive();
			assertThat(achievement.reward().coins()).isPositive();
		});
	}

	@Test
	void gamesPlayedAchievementsUnlockAtTheirThreshold() {
		assertThat(unlockedBy(run("snake", 0, Map.of(), false, 1))).containsExactly("FIRST_GAME");
		assertThat(unlockedBy(run("snake", 0, Map.of(), false, 9))).containsExactly("FIRST_GAME");
		assertThat(unlockedBy(run("snake", 0, Map.of(), false, 10))).containsExactly("FIRST_GAME", "PLAY_10_GAMES");
		assertThat(unlockedBy(run("tetris", 0, Map.of(), false, 50))).containsExactly("FIRST_GAME", "PLAY_10_GAMES",
				"PLAY_50_GAMES");
	}

	@Test
	void scoreAchievementsBelongToOneGame() {
		assertThat(unlockedBy(run("snake", 24, Map.of(), true, 2))).doesNotContain("SNAKE_25");
		assertThat(unlockedBy(run("snake", 25, Map.of(), true, 2))).contains("SNAKE_25").doesNotContain("SNAKE_100");
		assertThat(unlockedBy(run("snake", 100, Map.of(), true, 2))).contains("SNAKE_25", "SNAKE_100");
		assertThat(unlockedBy(run("tetris", 100000, Map.of(), true, 2))).doesNotContain("SNAKE_25", "SNAKE_100");
	}

	@Test
	void detailAchievementsReadTheReportedNumbers() {
		assertThat(unlockedBy(run("2048", 5000, Map.of("highestTile", 256), true, 2))).doesNotContain("REACH_512");
		assertThat(unlockedBy(run("2048", 9000, Map.of("highestTile", 512), true, 2))).contains("REACH_512")
			.doesNotContain("REACH_2048");
		assertThat(unlockedBy(run("2048", 21000, Map.of("highestTile", 4096), true, 2))).contains("REACH_512",
				"REACH_2048");
		assertThat(unlockedBy(run("tetris", 900, Map.of("lines", 9), true, 2))).doesNotContain("TETRIS_10_LINES");
		assertThat(unlockedBy(run("tetris", 9000, Map.of("lines", 40), true, 2))).contains("TETRIS_10_LINES",
				"TETRIS_40_LINES");
		// A detail the game did not report counts as zero.
		assertThat(unlockedBy(run("tetris", 9000, Map.of(), true, 2))).doesNotContain("TETRIS_10_LINES");
	}

	private List<String> unlockedBy(CompletedRun run) {
		return this.catalog.stream().filter((achievement) -> achievement.isUnlockedBy(run)).map(Achievement::code).toList();
	}

	private static CompletedRun run(String game, int score, Map<String, Integer> details, boolean personalBest,
			long gamesPlayed) {
		return new CompletedRun(UUID.randomUUID(), 1L, game, score, details, personalBest, gamesPlayed);
	}

}
