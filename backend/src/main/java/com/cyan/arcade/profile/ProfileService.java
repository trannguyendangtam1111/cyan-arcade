package com.cyan.arcade.profile;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.profile.GameHistoryResponse.Entry;
import com.cyan.arcade.progression.AchievementStatus;
import com.cyan.arcade.progression.Levels;
import com.cyan.arcade.progression.Levels.LevelProgress;
import com.cyan.arcade.progression.ProgressionService;
import com.cyan.arcade.score.PlayedGame;
import com.cyan.arcade.score.PlayerStats;
import com.cyan.arcade.score.ScoreQueries;
import com.cyan.arcade.user.Avatar;
import com.cyan.arcade.user.UserAccount;
import com.cyan.arcade.user.UserService;

import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Puts a player's profile together from the features that own its parts: the account, the scores
 * and the progression. Every method takes the id of the signed-in player, so there is no way to
 * ask for someone else's.
 */
@Service
@Transactional(readOnly = true)
public class ProfileService {

	private final UserService users;

	private final ScoreQueries scores;

	private final ProgressionService progression;

	private final GameService games;

	ProfileService(UserService users, ScoreQueries scores, ProgressionService progression, GameService games) {
		this.users = users;
		this.scores = scores;
		this.progression = progression;
		this.games = games;
	}

	public ProfileResponse profileOf(Long userId) {
		return toProfile(this.users.get(userId));
	}

	@Transactional
	public ProfileResponse changeAvatar(Long userId, Avatar avatar) {
		return toProfile(this.users.changeAvatar(userId, avatar));
	}

	public List<AchievementStatus> achievementsOf(Long userId) {
		return this.progression.achievementsOf(userId);
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

		return new ProfileResponse(account.id(), account.username(), account.avatar(), account.xp(), level.level(),
				level.xpIntoLevel(), level.xpForNextLevel(), stats.gamesPlayed(), stats.totalScore(), unlocked,
				achievements.size(), account.createdAt());
	}

}
