package com.cyan.arcade.score;

import java.net.URI;
import java.util.UUID;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.GuestPlayer;
import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Both endpoints are open to guests; a signed-in caller is recognised from their session. */
@RestController
@RequestMapping("/api/game-sessions")
class GameSessionController {

	private final GameSessionService gameSessionService;

	GameSessionController(GameSessionService gameSessionService) {
		this.gameSessionService = gameSessionService;
	}

	@PostMapping
	ResponseEntity<GameSessionResponse> start(@Valid @RequestBody StartGameSessionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		GameSessionResponse session = this.gameSessionService.start(request.gameSlug(), idOf(user), playerId);
		return ResponseEntity.created(URI.create("/api/game-sessions/" + session.id())).body(session);
	}

	@PostMapping("/{id}/finish")
	ScoreResponse finish(@PathVariable UUID id, @Valid @RequestBody FinishGameSessionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.gameSessionService.finish(id, request.score(), request.detailsOrEmpty(), idOf(user));
	}

	private static Long idOf(AuthenticatedUser user) {
		return (user != null) ? user.id() : null;
	}

}
