package com.cyan.arcade.wordle;

import java.net.URI;
import java.util.UUID;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.GuestPlayer;
import com.cyan.arcade.wordle.WordleRun.Owner;
import com.cyan.arcade.wordle.WordleViews.DailyResponse;
import com.cyan.arcade.wordle.WordleViews.GuessRequest;
import com.cyan.arcade.wordle.WordleViews.HintRequest;
import com.cyan.arcade.wordle.WordleViews.RunResponse;
import com.cyan.arcade.wordle.WordleViews.StartDailyRequest;
import com.cyan.arcade.wordle.WordleViews.StatsResponse;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Word Guess, open to guests as every game is. A signed-in player is recognised from their session;
 * a guest by the same {@code X-Player-Id} their game sessions carry, which they need to play.
 */
@RestController
@RequestMapping("/api/wordle")
class WordleController {

	private final WordleService wordle;

	WordleController(WordleService wordle) {
		this.wordle = wordle;
	}

	@GetMapping("/daily")
	DailyResponse daily(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.wordle.daily(ownerOrNull(user, playerId));
	}

	@PostMapping("/daily/runs")
	RunResponse startDaily(@Valid @RequestBody StartDailyRequest request, @AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.wordle.startDaily(owner(user, playerId), request.sessionId());
	}

	@PostMapping("/practice/runs")
	ResponseEntity<RunResponse> startPractice(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		RunResponse run = this.wordle.startPractice(owner(user, playerId));
		return ResponseEntity.created(URI.create("/api/wordle/runs/" + run.id())).body(run);
	}

	@PostMapping("/runs/{id}/guesses")
	RunResponse guess(@PathVariable UUID id, @Valid @RequestBody GuessRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.wordle.guess(owner(user, playerId), id, request.word());
	}

	@PostMapping("/runs/{id}/hints")
	RunResponse hint(@PathVariable UUID id, @Valid @RequestBody HintRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		Character letter = (request.letter() != null) ? request.letter().charAt(0) : null;
		return this.wordle.hint(owner(user, playerId), id, request.type(), letter);
	}

	@GetMapping("/stats")
	StatsResponse stats(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.wordle.stats(ownerOrNull(user, playerId));
	}

	private static Owner ownerOrNull(AuthenticatedUser user, UUID playerId) {
		if (user != null) {
			return new Owner(user.id(), null);
		}
		return (playerId != null) ? new Owner(null, playerId) : null;
	}

	private static Owner owner(AuthenticatedUser user, UUID playerId) {
		Owner owner = ownerOrNull(user, playerId);
		if (owner == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, WordleService.PLAYER_ID_REQUIRED,
					"Sign in, or play as a guest with the " + GuestPlayer.HEADER + " header");
		}
		return owner;
	}

}
