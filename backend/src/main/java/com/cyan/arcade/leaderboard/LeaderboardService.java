package com.cyan.arcade.leaderboard;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameResponse;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.leaderboard.LeaderboardPeriod.Window;
import com.cyan.arcade.leaderboard.LeaderboardResponse.Entry;
import com.cyan.arcade.leaderboard.LeaderboardResponse.Player;
import com.cyan.arcade.leaderboard.PlayerRanks.GameRanks;
import com.cyan.arcade.leaderboard.PlayerRanks.Standing;
import com.cyan.arcade.score.PlayerBest;
import com.cyan.arcade.score.RankedScore;
import com.cyan.arcade.score.ScoreQueries;
import com.cyan.arcade.user.UserAccount;
import com.cyan.arcade.user.UserService;

import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds leaderboards from recorded scores. Owns no data and writes nothing: every board is read
 * from the scores that score submission already validated, for a period whose boundaries the
 * server works out from its own clock.
 */
@Service
@Transactional(readOnly = true)
public class LeaderboardService {

	private final GameService games;

	private final ScoreQueries scores;

	private final UserService users;

	private final Clock clock;

	LeaderboardService(GameService games, ScoreQueries scores, UserService users, Clock clock) {
		this.games = games;
		this.scores = scores;
		this.users = users;
		this.clock = clock;
	}

	/**
	 * @param userId the signed-in caller, or {@code null}
	 * @param playerId the caller's guest id, or {@code null} when unknown
	 */
	public LeaderboardResponse leaderboard(String gameSlug, LeaderboardPeriod period, int page, int size, Long userId,
			UUID playerId) {
		GameInfo game = this.games.requireScoredGame(gameSlug);
		Window window = period.windowAt(this.clock.instant());
		Page<RankedScore> top = this.scores.ranking(game.id(), window.start(), window.end(), page, size);

		// One lookup for the names of everyone on this page.
		Set<Long> userIds = top.stream().map(RankedScore::userId).filter(Objects::nonNull).collect(Collectors.toSet());
		Map<Long, UserAccount> accounts = this.users.getAll(userIds);

		Optional<PlayerBest> mine = this.scores.standingOf(game.id(), window.start(), window.end(), userId, playerId);

		return new LeaderboardResponse(game.slug(), period, window.start(), window.end(),
				top.map((score) -> toEntry(score, accountOf(score, accounts), userId, playerId)).getContent(),
				top.getNumber(), top.getSize(), top.getTotalElements(), top.getTotalPages(),
				mine.map(PlayerBest::rank).orElse(null), mine.map(PlayerBest::bestScore).orElse(null));
	}

	/**
	 * Where a signed-in player stands on every scored game's boards, for their profile: one small
	 * ranking query per game and period.
	 */
	public PlayerRanks ranksOf(Long userId) {
		Instant now = this.clock.instant();
		List<GameRanks> perGame = this.games.listScoredGames()
			.stream()
			.map((game) -> new GameRanks(new PlayerRanks.Game(game.slug(), game.name()),
					standing(game, LeaderboardPeriod.DAILY, now, userId),
					standing(game, LeaderboardPeriod.WEEKLY, now, userId),
					standing(game, LeaderboardPeriod.ALL_TIME, now, userId)))
			.toList();
		Optional<GameRanks> best = perGame.stream()
			.filter((ranks) -> ranks.allTime() != null)
			.min(Comparator.comparingLong((GameRanks ranks) -> ranks.allTime().rank()));
		return new PlayerRanks(best.map((ranks) -> ranks.allTime().rank()).orElse(null),
				best.map(GameRanks::game).orElse(null), perGame);
	}

	private Standing standing(GameResponse game, LeaderboardPeriod period, Instant now, Long userId) {
		Window window = period.windowAt(now);
		return this.scores.standingOf(game.id(), window.start(), window.end(), userId, null)
			.map((best) -> new Standing(best.rank(), best.bestScore()))
			.orElse(null);
	}

	/** The account behind a score, or {@code null} for a guest's score. */
	private static UserAccount accountOf(RankedScore score, Map<Long, UserAccount> accounts) {
		return (score.userId() != null) ? accounts.get(score.userId()) : null;
	}

	private static Entry toEntry(RankedScore score, UserAccount account, Long userId, UUID playerId) {
		// Ids never leave the server: callers learn a name and avatar, and which entries are their own.
		Player player = (account != null) ? new Player(account.username(), account.displayName(), account.avatar()) : null;
		return new Entry(score.rank(), player, score.score(), score.durationMs(), score.achievedAt(),
				score.belongsTo(userId, playerId));
	}

}
