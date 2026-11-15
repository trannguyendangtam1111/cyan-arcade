package com.cyan.arcade.score;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Test-only rules for a test-only game, {@value #GAME}, with more than Classic: a ranked time trial
 * (lowest first, a limit of its own above the catalog's) and an unranked practice mode. This tests
 * platform mode handling independently of game implementations. Every run is plausible and completes its mode.
 *
 * <p>Part of every integration test context, but inert: the game is only in the catalog (active)
 * while {@link ModeBoardsAndRewardsTests} runs.
 */
@TestConfiguration(proxyBeanMethods = false)
public class ModeLab {

	public static final String GAME = "mode-lab";

	static final ModeSpec TRIAL = new ModeSpec("trial", "Time Trial", true, ModeSpec.Order.ASC,
			ModeSpec.Unit.MILLISECONDS, 600_000);

	static final ModeSpec PRACTICE = new ModeSpec("practice", "Practice", false, ModeSpec.Order.DESC,
			ModeSpec.Unit.POINTS, null);

	@Bean
	RunRules modeLabRules() {
		return new RunRules() {

			@Override
			public String gameSlug() {
				return GAME;
			}

			@Override
			public List<ModeSpec> modes() {
				return List.of(ModeSpec.CLASSIC, TRIAL, PRACTICE);
			}

			@Override
			public Set<String> details() {
				return Set.of();
			}

			@Override
			public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
				return Optional.empty();
			}

			// Every mode is plausible, said explicitly: a mode without rules of its own is refused.
			@Override
			public Optional<String> problemWith(String mode, UUID sessionId, int score, Map<String, Integer> details,
					Duration elapsed) {
				return Optional.empty();
			}

			// And every run of every mode reached its end, said explicitly too: by default only Classic's do.
			@Override
			public boolean completes(String mode, Map<String, Integer> details) {
				return true;
			}

		};
	}

}
