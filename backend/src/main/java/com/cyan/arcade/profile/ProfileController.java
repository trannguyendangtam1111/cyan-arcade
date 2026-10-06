package com.cyan.arcade.profile;

import java.util.List;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.progression.AchievementStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in player's own data. Every path is under {@code /me} and every handler uses the id
 * from the session, never one supplied by the client, so one player cannot read or change
 * another's profile, history or achievements.
 */
@RestController
@RequestMapping("/api/users/me")
class ProfileController {

	static final int MAX_PAGE_SIZE = 50;

	private final ProfileService profileService;

	ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@GetMapping
	ProfileResponse profile(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.profileOf(user.id());
	}

	@PatchMapping
	ProfileResponse update(@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody UpdateProfileRequest request) {
		return this.profileService.changeAvatar(user.id(), request.avatar());
	}

	@GetMapping("/game-history")
	GameHistoryResponse gameHistory(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "10") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return this.profileService.historyOf(user.id(), page, size);
	}

	@GetMapping("/stats")
	StatsResponse stats(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.statsOf(user.id());
	}

	@GetMapping("/achievements")
	List<AchievementStatus> achievements(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.profileService.achievementsOf(user.id());
	}

}
