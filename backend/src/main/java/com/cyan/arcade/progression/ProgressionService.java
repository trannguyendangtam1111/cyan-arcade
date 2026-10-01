package com.cyan.arcade.progression;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.progression.Rewards.UnlockedAchievement;
import com.cyan.arcade.user.UserService;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * XP, levels and achievements. The single place where a finished run turns into rewards: no
 * controller and no game knows any of these rules.
 */
@Service
public class ProgressionService {

	private final AchievementCatalog catalog;

	private final UnlockedAchievements unlocked;

	private final UserService users;

	private final List<BonusSource> bonusSources;

	private final Clock clock;

	ProgressionService(AchievementCatalog catalog, UnlockedAchievements unlocked, UserService users,
			ObjectProvider<BonusSource> bonusSources, Clock clock) {
		this.clock = clock;
		this.catalog = catalog;
		this.unlocked = unlocked;
		this.users = users;
		this.bonusSources = bonusSources.orderedStream().toList();
	}

	/**
	 * Awards XP for the run, unlocks any achievements it earned, collects bonuses from other
	 * features, and reports what changed.
	 */
	@Transactional
	public Rewards reward(CompletedRun run) {
		int xpBefore = this.users.get(run.userId()).xp();
		int xpEarned = XpRules.forRun(run);

		Instant now = this.clock.instant();
		List<UnlockedAchievement> newlyUnlocked = new ArrayList<>();
		for (Achievement achievement : this.catalog.all()) {
			// "unlock" is false when the player already has it, so nothing is rewarded twice.
			if (achievement.isUnlockedBy(run) && this.unlocked.unlock(run.userId(), achievement.code(), now)) {
				newlyUnlocked.add(UnlockedAchievement.of(achievement));
				xpEarned += achievement.xp();
			}
		}

		List<Bonus> bonuses = this.bonusSources.stream().flatMap((source) -> source.award(run).stream()).toList();
		xpEarned += bonuses.stream().mapToInt(Bonus::xp).sum();

		int totalXp = this.users.addXp(run.userId(), xpEarned);
		int level = Levels.levelFor(totalXp);
		return new Rewards(xpEarned, run.personalBest(), List.copyOf(newlyUnlocked), bonuses, totalXp, level,
				level > Levels.levelFor(xpBefore));
	}

	/** Every achievement in the catalog, with whether and when this player unlocked it. */
	@Transactional(readOnly = true)
	public List<AchievementStatus> achievementsOf(Long userId) {
		Map<String, Instant> unlockedAt = this.unlocked.of(userId);
		return this.catalog.all()
			.stream()
			.map((achievement) -> new AchievementStatus(achievement.code(), achievement.name(),
					achievement.description(), achievement.xp(), unlockedAt.containsKey(achievement.code()),
					unlockedAt.get(achievement.code())))
			.toList();
	}

}
