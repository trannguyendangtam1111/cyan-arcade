package com.cyan.arcade.economy;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.economy.CoinService.TransactionPage;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in player's coins. Read-only: coins are only ever earned through what the player
 * does, and every handler uses the id from the session.
 */
@RestController
@RequestMapping("/api/users/me")
class CoinController {

	static final int MAX_PAGE_SIZE = 50;

	private final CoinService coins;

	CoinController(CoinService coins) {
		this.coins = coins;
	}

	/**
	 * @param balance coins the player has now
	 * @param earned everything they have ever earned, spending left out
	 */
	record CoinsResponse(long balance, long earned) {
	}

	@GetMapping("/coins")
	CoinsResponse coins(@AuthenticationPrincipal AuthenticatedUser user) {
		return new CoinsResponse(this.coins.balanceOf(user.id()), this.coins.earnedBy(user.id()));
	}

	@GetMapping("/transactions")
	TransactionPage transactions(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "10") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return this.coins.transactionsOf(user.id(), page, size);
	}

}
