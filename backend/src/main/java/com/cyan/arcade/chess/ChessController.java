package com.cyan.arcade.chess;

import java.net.URI;
import java.util.UUID;

import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessViews.CoachRequest;
import com.cyan.arcade.chess.ChessViews.CoachResponse;
import com.cyan.arcade.chess.ChessViews.DrawRequest;
import com.cyan.arcade.chess.ChessViews.HintResponse;
import com.cyan.arcade.chess.ChessViews.MatchResponse;
import com.cyan.arcade.chess.ChessViews.MoveRequest;
import com.cyan.arcade.chess.ChessViews.ResignRequest;
import com.cyan.arcade.chess.ChessViews.RevisionRequest;
import com.cyan.arcade.chess.ChessViews.StartRequest;
import com.cyan.arcade.chess.ChessViews.VariationRequest;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.common.security.GuestPlayer;
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
 * Chess matches, open to guests like every game. A signed-in player is recognised from their
 * session; a guest by the {@code X-Player-Id} header the app sends with game requests. Nothing a
 * request says about roles, results or whose turn it is is taken on trust.
 */
@RestController
@RequestMapping("/api/chess/matches")
class ChessController {

	private final ChessService chess;

	private final ChessAiService ai;

	private final ChessCoachService coach;

	ChessController(ChessService chess, ChessAiService ai, ChessCoachService coach) {
		this.chess = chess;
		this.ai = ai;
		this.coach = coach;
	}

	@PostMapping
	ResponseEntity<MatchResponse> start(@Valid @RequestBody StartRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		MatchResponse match = this.chess.start(owner(user, playerId), request.mode());
		return ResponseEntity.created(URI.create("/api/chess/matches/" + match.id())).body(match);
	}

	/** The caller's match in progress, else their last finished one; {@code 204} when there is none. */
	@GetMapping("/current")
	ResponseEntity<MatchResponse> current(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		Owner owner = ownerOrNull(user, playerId);
		if (owner == null) {
			return ResponseEntity.noContent().build();
		}
		return this.chess.current(owner).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
	}

	@GetMapping("/{id}")
	MatchResponse get(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.chess.get(owner(user, playerId), id);
	}

	@PostMapping("/{id}/moves")
	MatchResponse move(@PathVariable UUID id, @Valid @RequestBody MoveRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.chess.move(owner(user, playerId), id, request.revision(), request.move());
	}

	@PostMapping("/{id}/undo")
	MatchResponse undo(@PathVariable UUID id, @Valid @RequestBody RevisionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.chess.undo(owner(user, playerId), id, request.revision());
	}

	@PostMapping("/{id}/redo")
	MatchResponse redo(@PathVariable UUID id, @Valid @RequestBody RevisionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.chess.redo(owner(user, playerId), id, request.revision());
	}

	/**
	 * "Continue from here": a variation of this match from its position after {@code ply} moves, as a
	 * new analysis match. The match itself is only read: its moves, result and revision stay.
	 */
	@PostMapping("/{id}/variations")
	ResponseEntity<MatchResponse> variation(@PathVariable UUID id, @Valid @RequestBody VariationRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		MatchResponse variation = this.chess.variation(owner(user, playerId), id, request.ply());
		return ResponseEntity.created(URI.create("/api/chess/matches/" + variation.id())).body(variation);
	}

	@PostMapping("/{id}/resign")
	MatchResponse resign(@PathVariable UUID id, @Valid @RequestBody ResignRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.chess.resign(owner(user, playerId), id, request.revision(), request.side());
	}

	@PostMapping("/{id}/draw")
	MatchResponse draw(@PathVariable UUID id, @Valid @RequestBody DrawRequest request,
			@AuthenticationPrincipal AuthenticatedUser user,
			@RequestHeader(name = GuestPlayer.HEADER, required = false) UUID playerId) {
		return this.chess.draw(owner(user, playerId), id, request.revision(), request.action(), request.side());
	}

	/**
	 * A move hint from Stockfish for the current position. Signed-in players only (the security rules
	 * ask for a session): a player has a few per match, an admin as many as the server allows.
	 */
	@PostMapping("/{id}/hint")
	HintResponse hint(@PathVariable UUID id, @Valid @RequestBody RevisionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.ai.hint(owner(user, null), id, request.revision());
	}

	/**
	 * Coach Mode: Stockfish's judgement of a move the caller played in this match. Signed-in players
	 * only (the security rules ask for a session), for their own moves; it changes nothing.
	 */
	@PostMapping("/{id}/coach")
	CoachResponse coach(@PathVariable UUID id, @Valid @RequestBody CoachRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.coach.judge(owner(user, null), id, request.ply(), request.uci());
	}

	static Owner ownerOrNull(AuthenticatedUser user, UUID playerId) {
		if (user != null) {
			return new Owner(user.id(), null, user.role());
		}
		return (playerId != null) ? new Owner(null, playerId) : null;
	}

	static Owner owner(AuthenticatedUser user, UUID playerId) {
		Owner owner = ownerOrNull(user, playerId);
		if (owner == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ChessService.PLAYER_ID_REQUIRED,
					"Sign in, or play as a guest with the " + GuestPlayer.HEADER + " header");
		}
		return owner;
	}

}
