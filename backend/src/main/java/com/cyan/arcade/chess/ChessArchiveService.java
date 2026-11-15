package com.cyan.arcade.chess;

import java.util.List;
import java.util.UUID;

import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessViews.ArchivePage;
import com.cyan.arcade.chess.ChessViews.ArchivedMatch;
import com.cyan.arcade.chess.ChessViews.MatchResponse;
import com.cyan.arcade.common.error.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads retained matches only; existing thirty-day cleanup and current-match selection are unchanged. */
@Service
@Transactional(readOnly = true)
class ChessArchiveService {

	private final ChessMatchStore store;
	private final ChessService chess;

	ChessArchiveService(ChessMatchStore store, ChessService chess) {
		this.store = store;
		this.chess = chess;
	}

	ArchivePage list(Owner owner, int page, int size) {
		requireAccount(owner);
		if (page < 0 || page > 1000 || size < 1 || size > 50) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PAGE", "Page must be 0–1000 and size 1–50.");
		}
		List<ArchivedMatch> rows = this.store.archive(owner.userId(), size + 1, page * size);
		return new ArchivePage(rows.subList(0, Math.min(rows.size(), size)), page, size, rows.size() > size);
	}

	MatchResponse get(Owner owner, UUID id) {
		requireAccount(owner);
		return this.chess.get(owner, id);
	}

	String pgn(Owner owner, UUID id) {
		requireAccount(owner);
		return ChessPgn.export(this.chess.owned(owner, id));
	}

	private static void requireAccount(Owner owner) {
		if (!owner.isSignedIn()) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "SIGN_IN_REQUIRED", "Sign in to browse your match archive.");
		}
	}

}
