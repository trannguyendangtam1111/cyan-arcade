package com.cyan.arcade.challenge;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import com.cyan.arcade.challenge.DailyChallengesResponse.Game;
import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads today's challenges. "Today" is always the server's UTC date; nothing here takes a date
 * from the caller.
 */
@Service
@Transactional(readOnly = true)
public class DailyChallengeService {

	private final DailyChallengeStore store;

	private final GameService games;

	private final Clock clock;

	DailyChallengeService(DailyChallengeStore store, GameService games, Clock clock) {
		this.store = store;
		this.games = games;
		this.clock = clock;
	}

	public DailyChallengesResponse today() {
		LocalDate today = LocalDate.now(this.clock);
		List<DailyChallenge> challenges = this.store.findByDate(today);
		Map<Long, GameInfo> gamesById = gamesOf(challenges);

		return new DailyChallengesResponse(today, endOf(today),
				challenges.stream()
					.filter((challenge) -> gamesById.containsKey(challenge.gameId()))
					.map((challenge) -> new DailyChallengesResponse.Challenge(challenge.id(), challenge.title(),
							challenge.description(), toGame(gamesById.get(challenge.gameId())), challenge.target(),
							challenge.xpReward(), challenge.date()))
					.toList());
	}

	/** Today's challenges, each with whether and when this player completed it. */
	public MyDailyChallengesResponse todayFor(Long userId) {
		LocalDate today = LocalDate.now(this.clock);
		List<DailyChallenge> challenges = this.store.findByDate(today);
		Map<Long, GameInfo> gamesById = gamesOf(challenges);
		Map<Long, Instant> completedAt = this.store.completionsOf(userId, today);

		List<MyDailyChallengesResponse.Challenge> mine = challenges.stream()
			.filter((challenge) -> gamesById.containsKey(challenge.gameId()))
			.map((challenge) -> new MyDailyChallengesResponse.Challenge(challenge.id(), challenge.title(),
					challenge.description(), toGame(gamesById.get(challenge.gameId())), challenge.target(),
					challenge.xpReward(), challenge.date(), completedAt.containsKey(challenge.id()),
					completedAt.get(challenge.id())))
			.toList();
		int completed = (int) mine.stream().filter(MyDailyChallengesResponse.Challenge::completed).count();
		return new MyDailyChallengesResponse(today, endOf(today), completed, mine);
	}

	private Map<Long, GameInfo> gamesOf(List<DailyChallenge> challenges) {
		return this.games.gamesById(challenges.stream().map(DailyChallenge::gameId).collect(Collectors.toSet()));
	}

	private static Game toGame(GameInfo game) {
		Objects.requireNonNull(game);
		return new Game(game.slug(), game.name());
	}

	/** The first moment of the next day, which is when the next set of challenges takes over. */
	private static Instant endOf(LocalDate day) {
		return day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
	}

}
