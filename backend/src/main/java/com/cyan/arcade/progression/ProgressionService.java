package com.cyan.arcade.progression;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinService;
import com.cyan.arcade.economy.CoinTransaction;
import com.cyan.arcade.economy.CoinTransactionType;
import com.cyan.arcade.progression.Rewards.UnlockedAchievement;
import com.cyan.arcade.user.UserService;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * XP, levels, achievements and the coins they earn. The single place where what a player did turns
 * into rewards: no controller and no game knows any of these rules, and every coin a player earns
 * for playing is paid from here, through {@link CoinService}.
 */
@Service
@EnableConfigurationProperties(RewardProperties.class)
public class ProgressionService {

	static final String GAME_SESSION = "GAME_SESSION";

	static final String ACHIEVEMENT = "ACHIEVEMENT";

	private final AchievementCatalog catalog;

	private final UnlockedAchievements unlocked;

	private final UserService users;

	private final CoinService coins;

	private final RewardProperties rewards;

	private final List<BonusSource> bonusSources;

	private final Clock clock;

	ProgressionService(AchievementCatalog catalog, UnlockedAchievements unlocked, UserService users, CoinService coins,
			RewardProperties rewards, ObjectProvider<BonusSource> bonusSources, Clock clock) {
		this.clock = clock;
		this.catalog = catalog;
		this.unlocked = unlocked;
		this.users = users;
		this.coins = coins;
		this.rewards = rewards;
		this.bonusSources = bonusSources.orderedStream().toList();
	}

	/**
	 * Makes this player's finished runs and coin changes happen one at a time until the current
	 * transaction ends. Called before anything about the player's past runs is read (their best
	 * score, their games today), so two runs finished at the same moment are judged one after the
	 * other: only a score that really beats the best earns the personal-best reward, and the daily
	 * limits hold.
	 */
	@Transactional
	public void lockPlayer(Long userId) {
		this.coins.lock(userId);
	}

	/**
	 * Awards XP and coins for the run, unlocks any achievements it earned, collects bonuses from
	 * other features, and reports what changed. Each coin reward refers to what it rewards (the
	 * session, the achievement, the bonus), so none can be paid twice.
	 */
	@Transactional
	public Rewards reward(CompletedRun run) {
		Long userId = run.userId();
		int xpBefore = this.users.get(userId).xp();
		int xpEarned = XpRules.forRun(run);
		CoinReference session = CoinReference.of(GAME_SESSION, run.sessionId());

		int coinsEarned = 0;
		// Only so many games a day pay coins just for being played, so a stream of very short runs
		// earns XP but cannot be farmed for coins.
		if (this.coins.countToday(userId, CoinTransactionType.GAME_COMPLETION) < this.rewards.rewardedGamesPerDay()) {
			coinsEarned += pay(userId, CoinTransactionType.GAME_COMPLETION, this.rewards.gameCompletedCoins(),
					session, "Finished a game of " + run.gameSlug());
		}
		// Likewise for new bests: a string of runs each a little better than the last still earns their
		// XP, but only so many pay coins in a day.
		if (run.personalBest() && this.coins.countToday(userId,
				CoinTransactionType.HIGH_SCORE) < this.rewards.rewardedPersonalBestsPerDay()) {
			coinsEarned += pay(userId, CoinTransactionType.HIGH_SCORE, this.rewards.personalBestCoins(), session,
					"New best score in " + run.gameSlug());
		}

		Instant now = this.clock.instant();
		List<UnlockedAchievement> newlyUnlocked = new ArrayList<>();
		for (Achievement achievement : this.catalog.all()) {
			// "unlock" is false when the player already has it, so nothing is rewarded twice.
			if (achievement.isUnlockedBy(run) && this.unlocked.unlock(userId, achievement.code(), now)) {
				newlyUnlocked.add(UnlockedAchievement.of(achievement));
				xpEarned += achievement.reward().xp();
				coinsEarned += pay(userId, CoinTransactionType.ACHIEVEMENT, achievement.reward().coins(),
						CoinReference.of(ACHIEVEMENT, achievement.code()), "Achievement: " + achievement.name());
			}
		}

		List<Bonus> bonuses = this.bonusSources.stream().flatMap((source) -> source.award(run).stream()).toList();
		for (Bonus bonus : bonuses) {
			xpEarned += bonus.xp();
			coinsEarned += payBonus(userId, bonus);
		}

		int totalXp = this.users.addXp(userId, xpEarned);
		int level = Levels.levelFor(totalXp);
		return new Rewards(xpEarned, coinsEarned, run.personalBest(), List.copyOf(newlyUnlocked), bonuses, totalXp,
				level, level > Levels.levelFor(xpBefore), this.coins.balanceOf(userId));
	}

	/**
	 * Pays a bonus earned outside a game run, such as a challenge completed by opening card packs:
	 * its XP and its coins, in the caller's transaction.
	 */
	@Transactional
	public void award(Long userId, Bonus bonus) {
		payBonus(userId, bonus);
		this.users.addXp(userId, bonus.xp());
	}

	/** Every achievement in the catalog, with whether and when this player unlocked it. */
	@Transactional(readOnly = true)
	public List<AchievementStatus> achievementsOf(Long userId) {
		Map<String, Instant> unlockedAt = this.unlocked.of(userId);
		return this.catalog.all()
			.stream()
			.map((achievement) -> new AchievementStatus(achievement.code(), achievement.name(),
					achievement.description(), achievement.reward().xp(), achievement.reward().coins(),
					unlockedAt.containsKey(achievement.code()), unlockedAt.get(achievement.code())))
			.toList();
	}

	private int payBonus(Long userId, Bonus bonus) {
		return pay(userId, bonus.type(), bonus.coins(), bonus.reference(), bonus.title());
	}

	/** @return what was actually paid: nothing when this reference was paid before */
	private int pay(Long userId, CoinTransactionType type, int amount, CoinReference reference, String description) {
		return this.coins.credit(userId, type, amount, reference, description).map(CoinTransaction::amount).orElse(0);
	}

}
