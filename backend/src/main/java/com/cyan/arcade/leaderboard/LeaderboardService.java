package com.cyan.arcade.leaderboard;

import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.leaderboard.LeaderboardResponse.Entry;
import com.cyan.arcade.leaderboard.LeaderboardResponse.Player;
import com.cyan.arcade.leaderboard.LeaderboardResponse.PlayerStanding;
import com.cyan.arcade.score.RankedScore;
import com.cyan.arcade.score.ScoreQueries;
import com.cyan.arcade.user.UserAccount;
import com.cyan.arcade.user.UserService;

import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Builds a game's leaderboard from recorded scores. Owns no data of its own. */
@Service
@Transactional(readOnly = true)
public class LeaderboardService {

	private final GameService games;

	private final ScoreQueries scores;

	private final UserService users;

	LeaderboardService(GameService games, ScoreQueries scores, UserService users) {
		this.games = games;
		this.scores = scores;
		this.users = users;
	}

	/**
	 * @param userId the signed-in caller, or {@code null}
	 * @param playerId the caller's guest id, or {@code null} when unknown
	 */
	public LeaderboardResponse leaderboard(String gameSlug, int page, int size, Long userId, UUID playerId) {
		GameInfo game = this.games.requireActiveGame(gameSlug);
		Page<RankedScore> top = this.scores.topScores(game.id(), page, size);

		// One lookup for the names of everyone on this page.
		Set<Long> userIds = top.stream().map(RankedScore::userId).filter(Objects::nonNull).collect(Collectors.toSet());
		Map<Long, UserAccount> accounts = this.users.getAll(userIds);

		PlayerStanding standing = this.scores.bestOf(game.id(), userId, playerId)
			.map((best) -> new PlayerStanding(best.bestScore(), best.rank()))
			.orElse(null);

		return new LeaderboardResponse(game.slug(),
				top.map((score) -> toEntry(score, accountOf(score, accounts), userId, playerId)).getContent(),
				top.getNumber(), top.getSize(), top.getTotalElements(), top.getTotalPages(), standing);
	}

	/** The account behind a score, or {@code null} for a guest's score. */
	private static UserAccount accountOf(RankedScore score, Map<Long, UserAccount> accounts) {
		return (score.userId() != null) ? accounts.get(score.userId()) : null;
	}

	private static Entry toEntry(RankedScore score, UserAccount account, Long userId, UUID playerId) {
		// Ids never leave the server: callers learn a name and avatar, and which entries are their own.
		Player player = (account != null) ? new Player(account.username(), account.avatar()) : null;
		return new Entry(score.rank(), player, score.score(), score.durationMs(), score.achievedAt(),
				score.belongsTo(userId, playerId));
	}

}
