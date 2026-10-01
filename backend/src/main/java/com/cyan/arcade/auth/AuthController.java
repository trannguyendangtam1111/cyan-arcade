package com.cyan.arcade.auth;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Signing up, in and (through Spring Security's logout filter at {@code POST /api/auth/logout}) out.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final AuthService authService;

	private final UserService users;

	AuthController(AuthService authService, UserService users) {
		this.authService = authService;
		this.users = users;
	}

	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	SessionResponse register(@Valid @RequestBody RegisterRequest registration, HttpServletRequest request,
			HttpServletResponse response) {
		return SessionResponse.of(this.authService.register(registration, request, response));
	}

	@PostMapping("/login")
	SessionResponse login(@Valid @RequestBody LoginRequest login, HttpServletRequest request,
			HttpServletResponse response) {
		return SessionResponse.of(this.authService.login(login, request, response));
	}

	/** Tells the app whether someone is signed in, without treating "nobody" as an error. */
	@GetMapping("/session")
	SessionResponse session(@AuthenticationPrincipal AuthenticatedUser user) {
		return (user != null) ? SessionResponse.of(this.users.get(user.id())) : SessionResponse.GUEST;
	}

}
