package com.cyan.arcade.admin;

import java.util.List;

import com.cyan.arcade.admin.AdminDtos.GrantRequest;
import com.cyan.arcade.admin.AdminDtos.GrantResponse;
import com.cyan.arcade.admin.AdminDtos.StatsResponse;
import com.cyan.arcade.admin.AdminDtos.UserSummary;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The administrator's pages: who they are, what being an admin lets them do, how the arcade is
 * doing, and the few controlled things they can change. Admins only, both in the security
 * configuration ({@code /api/admin/**}) and here.
 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
class AdminController {

	/** What an admin may do that a player may not. */
	enum Privilege {

		/** Let a game play itself, in the games that have an AI. */
		AI_MODE,

		/** Open card packs without the daily allowance. */
		UNLIMITED_PACKS,

		/** Give players coins, each grant recorded with who gave it and why. */
		GRANT_COINS

	}

	/**
	 * @param playerDailyPackLimit the allowance players have, for comparison; {@code null} when even
	 * players have none
	 */
	record OverviewResponse(Long id, String username, Role role, List<Privilege> privileges,
			Integer playerDailyPackLimit) {
	}

	private final AdminService admin;

	private final int dailyPackLimit;

	AdminController(AdminService admin, @Value("${app.tcg.daily-pack-limit:10}") int dailyPackLimit) {
		this.admin = admin;
		this.dailyPackLimit = dailyPackLimit;
	}

	@GetMapping("/overview")
	OverviewResponse overview(@AuthenticationPrincipal AuthenticatedUser admin) {
		return new OverviewResponse(admin.id(), admin.username(), admin.role(), List.of(Privilege.values()),
				(this.dailyPackLimit > 0) ? this.dailyPackLimit : null);
	}

	@GetMapping("/stats")
	StatsResponse stats() {
		return this.admin.stats();
	}

	@GetMapping("/users")
	List<UserSummary> users(@RequestParam @NotBlank @Size(max = 20) String query) {
		return this.admin.searchUsers(query);
	}

	@PostMapping("/users/{id}/coins")
	@ResponseStatus(HttpStatus.CREATED)
	GrantResponse grantCoins(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable Long id,
			@Valid @RequestBody GrantRequest request) {
		return this.admin.grant(admin.id(), id, request.amount(), request.reason(), request.requestId());
	}

}
