package com.cyan.arcade.score;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Test-only rules for a game with a second mode: a timed trial whose score is milliseconds, ranked
 * lowest first, with a limit of its own and a detail list of its own. No real game declares one yet.
 * Records every mode-aware judgement it is asked for.
 */
class TwoModeRunRules implements RunRules {

	static final ModeSpec TRIAL = new ModeSpec("trial", "Time Trial", true, ModeSpec.Order.ASC,
			ModeSpec.Unit.MILLISECONDS, 600_000);

	/** Each mode-aware judgement: the mode, the session and the details it was given. */
	record Judged(String mode, UUID sessionId, int score, Map<String, Integer> details) {
	}

	final List<Judged> judged = new ArrayList<>();

	private final String gameSlug;

	private final List<ModeSpec> modes;

	TwoModeRunRules(String gameSlug, ModeSpec... modes) {
		this.gameSlug = gameSlug;
		this.modes = List.of(modes);
	}

	TwoModeRunRules(String gameSlug) {
		this(gameSlug, ModeSpec.CLASSIC, TRIAL);
	}

	@Override
	public String gameSlug() {
		return this.gameSlug;
	}

	@Override
	public List<ModeSpec> modes() {
		return this.modes;
	}

	/** Classic's details. */
	@Override
	public Set<String> details() {
		return Set.of("lines");
	}

	@Override
	public Set<String> details(String mode) {
		return TRIAL.id().equals(mode) ? Set.of("pieces") : details();
	}

	/** Classic: no more lines than the score. */
	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		return (details.get("lines") > score) ? Optional.of("more lines than points") : Optional.empty();
	}

	@Override
	public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
			Duration elapsed) {
		this.judged.add(new Judged(mode, sessionId, score, details));
		if (TRIAL.id().equals(mode)) {
			// A trial cannot be finished faster than its pieces can be placed, one per 100 ms.
			return (score < details.get("pieces") * 100) ? Optional.of("faster than possible") : Optional.empty();
		}
		return RunRules.super.problemWith(mode, sessionId, score, details, elapsed);
	}

}
