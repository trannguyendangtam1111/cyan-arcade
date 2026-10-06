package com.cyan.arcade.admin;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI mode is for admins. The games' AIs are algorithms that run in the browser, so what this
 * guards is the AI itself being handed out:
 * <ul>
 * <li>the app asks here before it loads a game's AI, and only shows AI mode when the answer is yes;
 * <li>in Docker, nginx serves the AI code ({@code /assets/ai/**}) only if this answers yes for the
 * request's own session ({@code auth_request}), so a player cannot download it by its address.
 * </ul>
 * A player gets {@code 403}, a guest {@code 401}.
 */
@RestController
@RequestMapping("/api/ai")
@PreAuthorize("hasRole('ADMIN')")
class AiAccessController {

	@GetMapping("/access")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void access() {
		// Reaching this method is the answer: only an admin gets this far.
	}

}
