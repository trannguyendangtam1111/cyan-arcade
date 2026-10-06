package com.cyan.arcade.profile;

import java.util.List;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.leaderboard.PlayerRanks;
import com.cyan.arcade.progression.AchievementStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Players' profiles. Everything under {@code /me} is the signed-in player's own data, and every
 * handler there uses the id from the session, never one supplied by the client, so one player
 * cannot read or change another's profile, history or achievements. The one public view of
 * another player is {@code /{username}/profile}, which is read-only and leaves out what is private.
 */
@RestController
@RequestMapping("/api/users")
class ProfileController {

	static final int MAX_PAGE_SIZE = 50;

	private final ProfileService profileService;

	ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@GetMapping("/me")
	ProfileResponse profile(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.profileOf(user.id());
	}

	/** Changes the signed-in player's display name, bio or avatar; fields left out stay as they are. */
	@PatchMapping("/me")
	ProfileResponse update(@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody UpdateProfileRequest request) {
		return this.profileService.changeProfile(user.id(), request);
	}

	/** Public: what anyone may see of a player. */
	@GetMapping("/{username}/profile")
	PublicProfileResponse publicProfile(@PathVariable String username, @AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.publicProfileOf(username, (user != null) ? user.id() : null);
	}

	@GetMapping("/me/game-history")
	GameHistoryResponse gameHistory(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "10") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return this.profileService.historyOf(user.id(), page, size);
	}

	@GetMapping("/me/stats")
	StatsResponse stats(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.statsOf(user.id());
	}

	/** Where the player stands on every leaderboard: per game, today, this week and of all time. */
	@GetMapping("/me/ranks")
	PlayerRanks ranks(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.ranksOf(user.id());
	}

	@GetMapping("/me/achievements")
	List<AchievementStatus> achievements(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.achievementsOf(user.id());
	}

}
