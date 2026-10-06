package com.cyan.arcade.profile;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.common.platform.ActivityStatistics;
import com.cyan.arcade.economy.CoinService;
import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.leaderboard.LeaderboardService;
import com.cyan.arcade.leaderboard.PlayerRanks;
import com.cyan.arcade.profile.GameHistoryResponse.Entry;
import com.cyan.arcade.profile.ProfileResponse.Cosmetic;
import com.cyan.arcade.progression.AchievementStatus;
import com.cyan.arcade.progression.Levels;
import com.cyan.arcade.progression.Levels.LevelProgress;
import com.cyan.arcade.progression.ProgressionService;
import com.cyan.arcade.score.GameStats;
import com.cyan.arcade.score.PlayedGame;
import com.cyan.arcade.score.PlayerStats;
import com.cyan.arcade.score.ScoreQueries;
import com.cyan.arcade.shop.InventoryResponse;
import com.cyan.arcade.shop.ItemType;
import com.cyan.arcade.shop.ShopService;
import com.cyan.arcade.user.UserAccount;
import com.cyan.arcade.user.UserService;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Puts a player's profile together from the features that own its parts: the account, the scores,
 * the progression, the coins, the shop and whatever other modules count. Every method takes the id
 * of the signed-in player, so there is no way to ask for someone else's.
 */
@Service
@Transactional(readOnly = true)
public class ProfileService {

	private final UserService users;

	private final ScoreQueries scores;

	private final ProgressionService progression;

	private final GameService games;

	private final CoinService coins;

	private final ShopService shop;

	private final List<ActivityStatistics> activityStatistics;

	private final LeaderboardService leaderboards;

	ProfileService(UserService users, ScoreQueries scores, ProgressionService progression, GameService games,
			CoinService coins, ShopService shop, ObjectProvider<ActivityStatistics> activityStatistics,
			LeaderboardService leaderboards) {
		this.users = users;
		this.scores = scores;
		this.progression = progression;
		this.games = games;
		this.coins = coins;
		this.shop = shop;
		this.activityStatistics = activityStatistics.orderedStream().toList();
		this.leaderboards = leaderboards;
	}

	public ProfileResponse profileOf(Long userId) {
		return toProfile(this.users.get(userId));
	}

	/** Changes what the player shows of themselves: display name, bio, avatar. Nothing else. */
	@Transactional
	public ProfileResponse changeProfile(Long userId, UpdateProfileRequest change) {
		return toProfile(this.users.changeProfile(userId, change.displayName(), change.bio(), change.avatar()));
	}

	/**
	 * What anyone may see of a player, found by username. Built from the same sources as the
	 * player's own profile, minus what is private: coins, coin history, inventory, ids.
	 * @param callerId the signed-in caller, or {@code null}, only to say whether it is them
	 * @throws NotFoundException when there is no such player
	 */
	public PublicProfileResponse publicProfileOf(String username, Long callerId) {
		UserAccount account = this.users.findByUsername(username)
			.orElseThrow(() -> new NotFoundException("Player", username));
		StatsResponse stats = statsOf(account.id());
		List<AchievementStatus> achievements = this.progression.achievementsOf(account.id());
		List<PublicProfileResponse.Achievement> unlocked = achievements.stream()
			.filter(AchievementStatus::unlocked)
			.sorted(Comparator.comparing(AchievementStatus::unlockedAt, Comparator.nullsLast(Comparator.reverseOrder())))
			.map((achievement) -> new PublicProfileResponse.Achievement(achievement.code(), achievement.name(),
					achievement.description(), achievement.unlockedAt()))
			.toList();
		List<InventoryResponse.Entry> worn = this.shop.equippedOf(account.id());

		return new PublicProfileResponse(account.username(), account.displayName(), account.avatar(), account.bio(),
				account.role(), Levels.levelFor(account.xp()), account.createdAt(), wornOf(worn, ItemType.TITLE),
				wornOf(worn, ItemType.BADGE), wornOf(worn, ItemType.COSMETIC),
				new PublicProfileResponse.Stats(stats.gamesPlayed(), stats.totalScore(), stats.playTimeMs(),
						stats.activities(), stats.games()),
				unlocked, achievements.size(), this.leaderboards.ranksOf(account.id()),
				account.id().equals(callerId));
	}

	public List<AchievementStatus> achievementsOf(Long userId) {
		return this.progression.achievementsOf(userId);
	}

	/**
	 * Everything worth counting about a player. A handful of aggregates, each over one player's rows
	 * through an index; asked for by the profile's statistics, not on every page.
	 */
	public StatsResponse statsOf(Long userId) {
		List<GameStats> perGame = this.scores.statsByGameOf(userId);
		Map<Long, GameInfo> gamesById = this.games
			.gamesById(perGame.stream().map(GameStats::gameId).collect(Collectors.toSet()));
		List<StatsResponse.Game> games = perGame.stream()
			.filter((stats) -> gamesById.containsKey(stats.gameId()))
			.map((stats) -> {
				GameInfo game = gamesById.get(stats.gameId());
				return new StatsResponse.Game(game.slug(), game.name(), stats.gamesPlayed(), stats.bestScore(),
						Math.round(stats.averageScore()), stats.playTimeMs(), stats.lastPlayedAt());
			})
			.sorted(Comparator.comparingLong(StatsResponse.Game::gamesPlayed).reversed()
				.thenComparing(StatsResponse.Game::name))
			.toList();

		List<AchievementStatus> achievements = this.progression.achievementsOf(userId);
		List<StatsResponse.Activity> activities = this.activityStatistics.stream()
			.flatMap((source) -> source.forPlayer(userId).stream())
			.map((stat) -> new StatsResponse.Activity(stat.key(), stat.label(), stat.value()))
			.toList();

		return new StatsResponse(perGame.stream().mapToLong(GameStats::gamesPlayed).sum(),
				this.scores.statsOf(userId).totalScore(), perGame.stream().mapToLong(GameStats::playTimeMs).sum(),
				(int) achievements.stream().filter(AchievementStatus::unlocked).count(), achievements.size(),
				this.coins.balanceOf(userId), this.coins.earnedBy(userId), activities, games);
	}

	/** The player's ranks on every leaderboard, worked out by the leaderboards from the scores. */
	public PlayerRanks ranksOf(Long userId) {
		return this.leaderboards.ranksOf(userId);
	}

	public GameHistoryResponse historyOf(Long userId, int page, int size) {
		Page<PlayedGame> history = this.scores.historyOf(userId, page, size);
		Map<Long, GameInfo> gamesById = this.games
			.gamesById(history.stream().map(PlayedGame::gameId).collect(Collectors.toSet()));

		List<Entry> entries = history.stream().map((played) -> {
			GameInfo game = gamesById.get(played.gameId());
			return new Entry(game.slug(), game.name(), played.score(), played.durationMs(), played.playedAt(),
					played.xpEarned(), played.personalBest());
		}).toList();
		return new GameHistoryResponse(entries, history.getNumber(), history.getSize(), history.getTotalElements(),
				history.getTotalPages());
	}

	private ProfileResponse toProfile(UserAccount account) {
		PlayerStats stats = this.scores.statsOf(account.id());
		LevelProgress level = Levels.progress(account.xp());
		List<AchievementStatus> achievements = this.progression.achievementsOf(account.id());
		int unlocked = (int) achievements.stream().filter(AchievementStatus::unlocked).count();
		List<InventoryResponse.Entry> worn = this.shop.equippedOf(account.id());

		return new ProfileResponse(account.id(), account.username(), account.displayName(), account.bio(),
				account.avatar(), account.role(), account.xp(), level.level(),
				level.xpIntoLevel(), level.xpForNextLevel(), this.coins.balanceOf(account.id()), stats.gamesPlayed(),
				stats.totalScore(), unlocked, achievements.size(), wornOf(worn, ItemType.TITLE),
				wornOf(worn, ItemType.BADGE), wornOf(worn, ItemType.COSMETIC), account.createdAt());
	}

	private static Cosmetic wornOf(List<InventoryResponse.Entry> worn, ItemType type) {
		return worn.stream()
			.filter((entry) -> entry.type() == type)
			.findFirst()
			.map((entry) -> new Cosmetic(entry.code(), entry.name(), entry.icon()))
			.orElse(null);
	}

}
