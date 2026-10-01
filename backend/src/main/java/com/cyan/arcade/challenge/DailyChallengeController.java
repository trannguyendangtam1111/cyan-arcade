package com.cyan.arcade.challenge;

import com.cyan.arcade.common.security.AuthenticatedUser;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/daily-challenges")
class DailyChallengeController {

	private final DailyChallengeService challenges;

	DailyChallengeController(DailyChallengeService challenges) {
		this.challenges = challenges;
	}

	/** Today's challenges. Public: guests can see what there is to win. */
	@GetMapping
	DailyChallengesResponse today() {
		return this.challenges.today();
	}

	/** The same challenges with the caller's own progress. The player comes from the session. */
	@GetMapping("/me")
	MyDailyChallengesResponse mine(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.challenges.todayFor(user.id());
	}

}
