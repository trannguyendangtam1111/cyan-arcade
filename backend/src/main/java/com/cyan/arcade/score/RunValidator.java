package com.cyan.arcade.score;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.game.GameInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Decides whether a submitted run could have been played: the score within the game's range, and
 * the game's own {@link RunRules}. A refusal tells the player only that the score was rejected;
 * why is written to the server log, where abuse can be looked into, and never sent back.
 */
@Component
class RunValidator {

	static final String SCORE_REJECTED = "SCORE_REJECTED";

	private static final Logger log = LoggerFactory.getLogger(RunValidator.class);

	private final Map<String, RunRules> rulesByGame;

	RunValidator(List<RunRules> rules) {
		this.rulesByGame = rules.stream().collect(Collectors.toMap(RunRules::gameSlug, Function.identity()));
	}

	/**
	 * @param elapsed how long the run lasted, by the server's clock
	 * @return the run's details that its game reports, the only ones rewards may look at
	 * @throws ApiException ({@value #SCORE_REJECTED}) when the run cannot have happened
	 */
	Map<String, Integer> check(GameSession session, GameInfo game, int score, Map<String, Integer> details,
			Duration elapsed) {
		if (!game.allowsScore(score)) {
			throw rejected(session, game, score, "score outside the game's range");
		}
		RunRules rules = this.rulesByGame.get(game.slug());
		if (rules == null) {
			return details;
		}
		Map<String, Integer> reported = details.entrySet()
			.stream()
			.filter((detail) -> rules.details().contains(detail.getKey()))
			.collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
		if (!reported.keySet().containsAll(rules.details())) {
			throw rejected(session, game, score, "details missing");
		}
		Optional<String> problem = rules.problemWith(score, reported, elapsed);
		if (problem.isPresent()) {
			throw rejected(session, game, score, problem.get());
		}
		return reported;
	}

	private static ApiException rejected(GameSession session, GameInfo game, int score, String reason) {
		log.warn("Score rejected: game={} session={} player={} score={} reason={}", game.slug(), session.getId(),
				(session.getUserId() != null) ? "account " + session.getUserId() : "guest", score, reason);
		return new ApiException(HttpStatus.BAD_REQUEST, SCORE_REJECTED, "Score submission rejected.");
	}

}
