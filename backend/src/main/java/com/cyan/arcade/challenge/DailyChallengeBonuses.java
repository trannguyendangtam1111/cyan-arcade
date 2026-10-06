package com.cyan.arcade.challenge;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinTransactionType;
import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.progression.Bonus;
import com.cyan.arcade.progression.BonusSource;
import com.cyan.arcade.progression.CompletedRun;

import org.springframework.stereotype.Component;

/**
 * Completes the daily challenges of games. Progression asks every {@link BonusSource} what a
 * finished run earned; this one answers with the challenges of today that the run completed.
 */
@Component
class DailyChallengeBonuses implements BonusSource {

	static final String REFERENCE_TYPE = "DAILY_CHALLENGE";

	private final DailyChallengeStore store;

	private final GameService games;

	private final Clock clock;

	DailyChallengeBonuses(DailyChallengeStore store, GameService games, Clock clock) {
		this.store = store;
		this.games = games;
		this.clock = clock;
	}

	@Override
	public List<Bonus> award(CompletedRun run) {
		// The day that counts is the one on which the run ends, by the server's clock, in UTC.
		Instant now = this.clock.instant();
		List<DailyChallenge> challenges = this.store.findByDate(LocalDate.ofInstant(now, ZoneOffset.UTC))
			.stream()
			.filter(DailyChallenge::isAboutAGame)
			.toList();
		if (challenges.isEmpty()) {
			return List.of();
		}
		Map<Long, GameInfo> gamesById = this.games
			.gamesById(challenges.stream().map(DailyChallenge::gameId).collect(Collectors.toSet()));

		List<Bonus> bonuses = new ArrayList<>();
		for (DailyChallenge challenge : challenges) {
			GameInfo game = gamesById.get(challenge.gameId());
			boolean sameGame = game != null && game.slug().equals(run.gameSlug());
			// "complete" is false when the player already had it, so it is rewarded once a day at most.
			if (sameGame && challenge.isMetBy(run) && this.store.complete(run.userId(), challenge.id(), now)) {
				bonuses.add(bonusFor(challenge));
			}
		}
		return bonuses;
	}

	/** What completing a challenge earns, whatever completed it. */
	static Bonus bonusFor(DailyChallenge challenge) {
		return new Bonus(CoinTransactionType.DAILY_CHALLENGE, challenge.title(), challenge.xpReward(),
				challenge.coinReward(), CoinReference.of(REFERENCE_TYPE, challenge.id()));
	}

}
