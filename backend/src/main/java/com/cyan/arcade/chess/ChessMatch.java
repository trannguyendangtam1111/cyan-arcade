package com.cyan.arcade.chess;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.chess.analysis.Difficulty;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.engine.Result;
import com.cyan.arcade.chess.engine.Termination;
import com.cyan.arcade.common.security.Role;

/**
 * A chess match as the server keeps it: its moves (the truth, replayed on every request), the
 * moves taken back that may be replayed, a pending draw offer, the result once over, who it
 * belongs to, and a revision that goes up with every change.
 *
 * @param undone moves taken back and not played again, the latest last
 * @param winner with {@code termination}, the recorded result; both {@code null} while it is on
 * @param engineSide for a game against Stockfish, the side the engine plays; {@code null} otherwise
 * @param difficulty for a game against Stockfish, how strongly it plays; {@code null} otherwise
 * @param hintsUsed move hints given in this match
 */
record ChessMatch(UUID id, Mode mode, Status status, List<Move> moves, List<Move> undone, Color drawOffer,
		Color winner, Termination termination, int revision, Long userId, UUID playerId, Instant createdAt,
		Instant updatedAt, Instant finishedAt, Color engineSide, Difficulty difficulty, int hintsUsed) {

	/** How the match is played. */
	enum Mode {

		/** Two players on one device. */
		LOCAL,
		/** One player against Stockfish (admins only). */
		AI

	}

	enum Status {

		ACTIVE, FINISHED,

		/** Left for a new match before it ended. */
		ABANDONED

	}

	/**
	 * Who is asking: an account (with its role, from the server's session) or a guest's browser id.
	 * Only the ids decide whose a match is.
	 *
	 * @param role the account's role, or {@code null} for a guest
	 */
	record Owner(Long userId, UUID playerId, Role role) {

		Owner(Long userId, UUID playerId) {
			this(userId, playerId, null);
		}

		boolean isAdmin() {
			return this.role == Role.ADMIN;
		}

		boolean isSignedIn() {
			return this.userId != null;
		}

	}

	ChessMatch {
		moves = List.copyOf(moves);
		undone = List.copyOf(undone);
	}

	static ChessMatch start(Owner owner, Mode mode, Instant now) {
		return new ChessMatch(UUID.randomUUID(), mode, Status.ACTIVE, List.of(), List.of(), null, null, null, 0,
				owner.userId(), owner.playerId(), now, now, null, null, null, 0);
	}

	/** A new game against Stockfish, which plays {@code engineSide}. */
	static ChessMatch againstEngine(Owner owner, Color engineSide, Difficulty difficulty, Instant now) {
		return new ChessMatch(UUID.randomUUID(), Mode.AI, Status.ACTIVE, List.of(), List.of(), null, null, null, 0,
				owner.userId(), owner.playerId(), now, now, null, engineSide, difficulty, 0);
	}

	boolean belongsTo(Owner owner) {
		if (this.userId != null) {
			return this.userId.equals(owner.userId());
		}
		return owner.userId() == null && this.playerId.equals(owner.playerId());
	}

	boolean isActive() {
		return this.status == Status.ACTIVE;
	}

	/**
	 * The game its record makes: the moves replayed from the starting position by the rules.
	 * @throws IllegalStateException when the record does not hold together
	 */
	ChessGame game() {
		Result result = (this.termination != null) ? new Result(this.winner, this.termination) : null;
		return ChessGame.restore(Position.initial(), this.moves, this.drawOffer, result);
	}

	/** The match after an action: the game as it now stands, the moves that may be replayed, the next revision. */
	ChessMatch after(ChessGame game, List<Move> undone, Instant now) {
		Result result = game.result().orElse(null);
		Status status = (result != null) ? Status.FINISHED : this.status;
		return new ChessMatch(this.id, this.mode, status, game.moves(), (result != null) ? List.of() : undone,
				game.drawOffer(), (result != null) ? result.winner() : null,
				(result != null) ? result.termination() : null, this.revision + 1, this.userId, this.playerId,
				this.createdAt, now, (result != null) ? now : null, this.engineSide, this.difficulty, this.hintsUsed);
	}

}
