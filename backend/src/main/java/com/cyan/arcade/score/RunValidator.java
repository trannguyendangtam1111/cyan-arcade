package com.cyan.arcade.score;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.game.GameInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Decides whether a submitted run could have been played: its mode one the game still declares,
 * the score within that mode's range, and the game's own {@link RunRules} for that mode. A refusal
 * tells the player only that the score was rejected; why is written to the server log, where abuse
 * can be looked into, and never sent back.
 */
@Component
class RunValidator {

	static final String SCORE_REJECTED = "SCORE_REJECTED";

	private static final Logger log = LoggerFactory.getLogger(RunValidator.class);

	private final GameModes modes;

	RunValidator(GameModes modes) {
		this.modes = modes;
	}

	/**
	 * @param elapsed how long the run lasted, by the server's clock
	 * @return the run's details that its game reports for its mode, the only ones rewards may look at
	 * @throws ApiException ({@value #SCORE_REJECTED}) when the run cannot have happened
	 */
	Map<String, Integer> check(GameSession session, GameInfo game, int score, Map<String, Integer> details,
			Duration elapsed) {
		String mode = session.getMode();
		// The mode was checked when the run started; it can only be missing if the game has since stopped offering it.
		ModeSpec spec = this.modes.declared(game.slug(), mode)
			.orElseThrow(() -> rejected(session, game, score, "mode '" + mode + "' no longer declared"));
		if (!allowsScore(spec, game, score)) {
			throw rejected(session, game, score, "score outside the mode's range");
		}
		Optional<RunRules> found = this.modes.rulesOf(game.slug());
		if (found.isEmpty()) {
			return details;
		}
		RunRules rules = found.get();
		Set<String> expected = rules.details(mode);
		Map<String, Integer> reported = details.entrySet()
			.stream()
			.filter((detail) -> expected.contains(detail.getKey()))
			.collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
		if (!reported.keySet().containsAll(expected)) {
			throw rejected(session, game, score, "details missing");
		}
		Optional<String> problem = rules.problemWith(mode, session.getId(), score, reported, elapsed);
		if (problem.isPresent()) {
			throw rejected(session, game, score, problem.get());
		}
		return reported;
	}

	/** A mode with a limit of its own uses it; any other uses the game's ({@code games.max_score}). */
	private static boolean allowsScore(ModeSpec spec, GameInfo game, int score) {
		return (spec.maxScore() != null) ? score >= 0 && score <= spec.maxScore() : game.allowsScore(score);
	}

	private static ApiException rejected(GameSession session, GameInfo game, int score, String reason) {
		log.warn("Score rejected: game={} mode={} session={} player={} score={} reason={}", game.slug(),
				session.getMode(), session.getId(),
				(session.getUserId() != null) ? "account " + session.getUserId() : "guest", score, reason);
		return new ApiException(HttpStatus.BAD_REQUEST, SCORE_REJECTED, "Score submission rejected.");
	}

}
