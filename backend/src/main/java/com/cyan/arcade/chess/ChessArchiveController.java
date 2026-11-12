package com.cyan.arcade.chess;

import java.util.UUID;

import com.cyan.arcade.chess.ChessViews.ArchivePage;
import com.cyan.arcade.chess.ChessViews.MatchResponse;
import com.cyan.arcade.common.security.AuthenticatedUser;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Separate account-only read API: guest headers and ADMIN roles never grant access to another owner. */
@RestController
@RequestMapping("/api/chess/archive")
@PreAuthorize("isAuthenticated()")
class ChessArchiveController {

	private final ChessArchiveService archive;

	ChessArchiveController(ChessArchiveService archive) {
		this.archive = archive;
	}

	@GetMapping
	ResponseEntity<ArchivePage> list(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(this.archive.list(ChessController.owner(user, null), page, size));
	}

	@GetMapping("/{id}")
	ResponseEntity<MatchResponse> get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(this.archive.get(ChessController.owner(user, null), id));
	}

	@GetMapping(value = "/{id}/pgn", produces = "application/x-chess-pgn;charset=UTF-8")
	ResponseEntity<String> pgn(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"chess-" + id + ".pgn\"")
			.body(this.archive.pgn(ChessController.owner(user, null), id));
	}

}
