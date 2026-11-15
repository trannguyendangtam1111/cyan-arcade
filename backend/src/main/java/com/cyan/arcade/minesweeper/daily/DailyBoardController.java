package com.cyan.arcade.minesweeper.daily;

import java.net.URI;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;

import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.minesweeper.daily.DailyBoardService.Started;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.AttemptResponse;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.FlagRequest;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.LeaderboardView;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.RevealRequest;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.TodayResponse;
import jakarta.validation.Valid;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Daily Board, for signed-in players only (the security configuration lets no guest in here).
 * The account is always the one the request is signed in as, and the time the server's.
 */
@RestController
@RequestMapping("/api/minesweeper/daily")
class DailyBoardController {

	private final DailyBoardService daily;

	private final Clock clock;

	DailyBoardController(DailyBoardService daily, Clock clock) {
		this.daily = daily;
		this.clock = clock;
	}

	@GetMapping
	TodayResponse today(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.daily.today(user.id(), this.clock.instant());
	}

	/** 201 with a new attempt; 200 with the one the account already has today. */
	@PostMapping("/attempts")
	ResponseEntity<AttemptResponse> start(@AuthenticationPrincipal AuthenticatedUser user) {
		Started started = this.daily.start(user.id(), this.clock.instant());
		if (!started.created()) {
			return ResponseEntity.ok(started.attempt());
		}
		return ResponseEntity.created(URI.create("/api/minesweeper/daily/attempts/" + started.attempt().id()))
			.body(started.attempt());
	}

	@GetMapping("/attempts/{id}")
	AttemptResponse attempt(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user) {
		return this.daily.attempt(user.id(), id, this.clock.instant());
	}

	@PostMapping("/attempts/{id}/reveal")
	AttemptResponse reveal(@PathVariable UUID id, @Valid @RequestBody RevealRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.daily.reveal(user.id(), id, request.cell(), this.clock.instant());
	}

	@PostMapping("/attempts/{id}/flag")
	AttemptResponse flag(@PathVariable UUID id, @Valid @RequestBody FlagRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.daily.flag(user.id(), id, request.cell(), request.flagged(), this.clock.instant());
	}

	@GetMapping("/leaderboard")
	LeaderboardView leaderboard(
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.daily.leaderboard(user.id(), date, page, size, this.clock.instant());
	}

}
