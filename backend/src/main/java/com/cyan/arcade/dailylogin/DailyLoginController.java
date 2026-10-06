package com.cyan.arcade.dailylogin;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.dailylogin.DailyLoginResponse.Claimed;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in player's daily login reward. Neither the day nor the amount comes from the request. */
@RestController
@RequestMapping("/api/daily-login")
class DailyLoginController {

	private final DailyLoginService dailyLogin;

	DailyLoginController(DailyLoginService dailyLogin) {
		this.dailyLogin = dailyLogin;
	}

	@GetMapping
	DailyLoginResponse status(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.dailyLogin.statusOf(user.id());
	}

	@PostMapping("/claim")
	Claimed claim(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.dailyLogin.claim(user.id());
	}

}
