package com.cyan.arcade.sudoku;

import java.net.URI;
import java.time.LocalDate;
import java.util.UUID;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.GuestPlayer;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuViews.ArchivePuzzleResponse;
import com.cyan.arcade.sudoku.SudokuViews.BindSessionRequest;
import com.cyan.arcade.sudoku.SudokuViews.DailyHistoryResponse;
import com.cyan.arcade.sudoku.SudokuViews.DailyLeaderboardResponse;
import com.cyan.arcade.sudoku.SudokuViews.HintRequest;
import com.cyan.arcade.sudoku.SudokuViews.HintResponse;
import com.cyan.arcade.sudoku.SudokuViews.MovesRequest;
import com.cyan.arcade.sudoku.SudokuViews.RunResponse;
import com.cyan.arcade.sudoku.SudokuViews.StartArchiveRequest;
import com.cyan.arcade.sudoku.SudokuViews.StartDailyRequest;
import com.cyan.arcade.sudoku.SudokuViews.StartPracticeRequest;
import com.cyan.arcade.sudoku.SudokuViews.StatsResponse;
import com.cyan.arcade.sudoku.SudokuViews.TodayResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sudoku, open to guests as every game is. A signed-in player is recognised from their session; a
 * guest by the same {@code X-Player-Id} their game sessions carry, which they need to play.
 */
@RestController
@RequestMapping("/api/sudoku")
class SudokuController {

	private final SudokuService sudoku;

	private final DailyLeaderboard dailyLeaderboard;

	private final DailyHistory dailyHistory;

	SudokuController(SudokuService sudoku, DailyLeaderboard dailyLeaderboard, DailyHistory dailyHistory) {
		this.sudoku = sudoku;
		this.dailyLeaderboard = dailyLeaderboard;
		this.dailyHistory = dailyHistory;
	}

	/**
	 * The caller's Daily Sudoku over the last 30 UTC dates. Signed-in players only (security answers
	 * anyone else with 401): a guest's id is not proof enough to show their history.
	 */
	@GetMapping("/daily/history")
	DailyHistoryResponse dailyHistory(@AuthenticationPrincipal AuthenticatedUser user) {
		if (user == null) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED,
					"Sign in to see your Daily history");
		}
		return this.dailyHistory.of(user.id());
	}

	/** The Daily leaderboard of one puzzle date (UTC), today's when none is named. Open to everyone. */
	@GetMapping("/daily/leaderboard")
	DailyLeaderboardResponse dailyLeaderboard(
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(DailyLeaderboard.MAX_PAGE_SIZE) int size,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.dailyLeaderboard.board(date, page, size, ownerOrNull(user, playerId));
	}

	@GetMapping("/today")
	TodayResponse today(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.today(ownerOrNull(user, playerId));
	}

	@PostMapping("/daily/runs")
	RunResponse startDaily(@Valid @RequestBody StartDailyRequest request, @AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.startDaily(owner(user, playerId), request.sessionId());
	}

	@PostMapping("/practice/runs")
	ResponseEntity<RunResponse> startPractice(@Valid @RequestBody StartPracticeRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		RunResponse run = this.sudoku.startPractice(owner(user, playerId), request.difficulty(), request.sessionId());
		return ResponseEntity.created(URI.create("/api/sudoku/runs/" + run.id())).body(run);
	}

	/**
	 * A past Daily puzzle by its UTC date: number, difficulty and clues, never the solution. Open to
	 * everyone; 404 {@code NOT_IN_ARCHIVE} for today, a later date or one before the first Daily.
	 */
	@GetMapping("/archive/{date}")
	ArchivePuzzleResponse archivePuzzle(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return this.sudoku.archivePuzzle(date);
	}

	/** Replays a past Daily puzzle, unranked: no session, score, rewards or streak. */
	@PostMapping("/archive/runs")
	ResponseEntity<RunResponse> startArchive(@Valid @RequestBody StartArchiveRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		RunResponse run = this.sudoku.startArchive(owner(user, playerId), request.date());
		return ResponseEntity.created(URI.create("/api/sudoku/runs/" + run.id())).body(run);
	}

	@PostMapping("/runs/{id}/session")
	RunResponse bindSession(@PathVariable UUID id, @Valid @RequestBody BindSessionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.bindSession(owner(user, playerId), id, request.sessionId());
	}

	@PostMapping("/runs/{id}/moves")
	RunResponse move(@PathVariable UUID id, @Valid @RequestBody MovesRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.move(owner(user, playerId), id, request.moves());
	}

	@PostMapping("/runs/{id}/hints")
	HintResponse hint(@PathVariable UUID id, @Valid @RequestBody HintRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.hint(owner(user, playerId), id, request.type(), request.cell());
	}

	@PostMapping("/runs/{id}/pause")
	RunResponse pause(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.pause(owner(user, playerId), id);
	}

	@PostMapping("/runs/{id}/resume")
	RunResponse resume(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.resume(owner(user, playerId), id);
	}

	@GetMapping("/stats")
	StatsResponse stats(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.sudoku.stats(ownerOrNull(user, playerId));
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
			throw new ApiException(HttpStatus.BAD_REQUEST, SudokuService.PLAYER_ID_REQUIRED,
					"Sign in, or play as a guest with the " + GuestPlayer.HEADER + " header");
		}
		return owner;
	}

}
