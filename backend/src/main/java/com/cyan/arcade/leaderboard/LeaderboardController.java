package com.cyan.arcade.leaderboard;

import java.util.UUID;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.GuestPlayer;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Leaderboards: public and read-only. A request chooses the game, the period and the page; the
 * period's boundaries, the ranks and who the caller is all come from the server.
 */
@RestController
@RequestMapping("/api/leaderboards")
class LeaderboardController {

	static final int DEFAULT_PAGE_SIZE = 20;

	static final int MAX_PAGE_SIZE = 100;

	private final LeaderboardService leaderboardService;

	LeaderboardController(LeaderboardService leaderboardService) {
		this.leaderboardService = leaderboardService;
	}

	@GetMapping("/{gameSlug}")
	LeaderboardResponse leaderboard(@PathVariable String gameSlug,
			@RequestParam(defaultValue = "ALL_TIME") LeaderboardPeriod period,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) @Min(1) @Max(MAX_PAGE_SIZE) int size,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.leaderboardService.leaderboard(gameSlug, period, page, size, (user != null) ? user.id() : null,
				playerId);
	}

}
