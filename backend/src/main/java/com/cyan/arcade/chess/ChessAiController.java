package com.cyan.arcade.chess;

import java.net.URI;
import java.util.UUID;

import com.cyan.arcade.chess.ChessViews.EngineStatus;
import com.cyan.arcade.chess.ChessViews.EvaluationRequest;
import com.cyan.arcade.chess.ChessViews.EvaluationResponse;
import com.cyan.arcade.chess.ChessViews.MatchResponse;
import com.cyan.arcade.chess.ChessViews.ReviewResponse;
import com.cyan.arcade.chess.ChessViews.RevisionRequest;
import com.cyan.arcade.chess.ChessViews.StartEngineGameRequest;
import com.cyan.arcade.common.security.AuthenticatedUser;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Chess's AI mode: games against Stockfish, evaluations and game reviews. Admins only, three times
 * over: the security rules on {@code /api/ai/**}, this controller's {@code @PreAuthorize}, and the
 * services' own check of the session's role. A player gets {@code 403}, a guest {@code 401}. The
 * engine is never reachable as such: requests name a match, and the server decides the position.
 */
@RestController
@RequestMapping("/api/ai/chess")
@PreAuthorize("hasRole('ADMIN')")
class ChessAiController {

	private final ChessAiService ai;

	private final ChessReviewService reviews;

	ChessAiController(ChessAiService ai, ChessReviewService reviews) {
		this.ai = ai;
		this.reviews = reviews;
	}

	@GetMapping("/engine")
	EngineStatus engine(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.ai.status(ChessController.owner(user, null));
	}

	@PostMapping("/matches")
	ResponseEntity<MatchResponse> start(@Valid @RequestBody StartEngineGameRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		MatchResponse match = this.ai.startEngineGame(ChessController.owner(user, null), request.playerSide(),
				request.difficulty());
		return ResponseEntity.created(URI.create("/api/chess/matches/" + match.id())).body(match);
	}

	@PostMapping("/matches/{id}/engine-move")
	MatchResponse engineMove(@PathVariable UUID id, @Valid @RequestBody RevisionRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.ai.engineMove(ChessController.owner(user, null), id, request.revision());
	}

	@PostMapping("/matches/{id}/evaluation")
	EvaluationResponse evaluate(@PathVariable UUID id, @Valid @RequestBody EvaluationRequest request,
			@AuthenticationPrincipal AuthenticatedUser user) {
		return this.ai.evaluate(ChessController.owner(user, null), id, request.revision(), request.depth(),
				request.lines());
	}

	@PostMapping("/matches/{id}/review")
	ResponseEntity<ReviewResponse> startReview(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user) {
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(this.reviews.start(ChessController.owner(user, null), id));
	}

	@GetMapping("/matches/{id}/review")
	ReviewResponse review(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user) {
		return this.reviews.get(ChessController.owner(user, null), id);
	}

	@DeleteMapping("/matches/{id}/review")
	ReviewResponse cancelReview(@PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser user) {
		return this.reviews.cancel(ChessController.owner(user, null), id);
	}

}
