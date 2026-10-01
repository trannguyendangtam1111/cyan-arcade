package com.cyan.arcade.tcg.opening;

import com.cyan.arcade.common.security.AuthenticatedUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Opening packs and looking back at opened ones. Every handler acts for the signed-in player, who
 * comes from the session.
 */
@RestController
@RequestMapping("/api/tcg")
class PackOpeningController {

	static final int MAX_PAGE_SIZE = 50;

	private final PackOpeningService openings;

	PackOpeningController(PackOpeningService openings) {
		this.openings = openings;
	}

	/**
	 * Opens a pack. The request has no body on purpose: which pack is in the path, who is asking is
	 * in the session, and which cards come out is for the server alone to decide.
	 */
	@PostMapping("/packs/{id}/open")
	@ResponseStatus(HttpStatus.CREATED)
	OpenPackResponse open(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
		return this.openings.open(user.id(), id);
	}

	@GetMapping("/openings")
	OpeningHistoryResponse history(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "10") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return this.openings.historyOf(user.id(), page, size);
	}

	@GetMapping("/allowance")
	AllowanceResponse allowance(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.openings.allowanceOf(user.id());
	}

}
