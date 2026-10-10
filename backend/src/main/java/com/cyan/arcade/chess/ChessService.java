package com.cyan.arcade.chess;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.function.UnaryOperator;

import com.cyan.arcade.chess.ChessMatch.Mode;
import com.cyan.arcade.chess.ChessMatch.Owner;
import com.cyan.arcade.chess.ChessMatch.Status;
import com.cyan.arcade.chess.ChessViews.DrawAction;
import com.cyan.arcade.chess.ChessViews.EngineView;
import com.cyan.arcade.chess.ChessViews.HintAllowance;
import com.cyan.arcade.chess.ChessViews.LegalMove;
import com.cyan.arcade.chess.ChessViews.MatchResponse;
import com.cyan.arcade.chess.ChessViews.PlayedMove;
import com.cyan.arcade.chess.ChessViews.ResultView;
import com.cyan.arcade.chess.analysis.Difficulty;
import com.cyan.arcade.chess.engine.ChessGame;
import com.cyan.arcade.chess.engine.ChessGame.RuleException;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Piece;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.engine.San;
import com.cyan.arcade.chess.engine.Square;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Chess, played on the server. A match is its list of moves; every request loads it (locked, so a
 * match's actions are judged one at a time), replays the moves by the rules, checks the action
 * against the position they make, and saves the result with the next revision. The browser is never
 * trusted with what is legal, whose turn it is or how the game ended.
 *
 * <p>Every action names the revision it was chosen in, and an older one is refused: a move made in
 * a second tab, or sent twice, can never land on a position its player did not see.
 *
 * <p>A local match is two players at one device, both sides the owner's; taking moves back and
 * replaying them is allowed there because both players see it happen at the same screen. In a game
 * against Stockfish (started by {@link ChessAiService}, admins only) the owner plays one side and the
 * engine's moves come only from the server. No match is scored (the catalog marks Chess as
 * unscored), so no game session, leaderboard or reward is involved.
 */
@Service
class ChessService {

	static final String PLAYER_ID_REQUIRED = "PLAYER_ID_REQUIRED";

	static final String STALE_REVISION = "STALE_REVISION";

	static final String MATCH_OVER = "MATCH_OVER";

	static final String ILLEGAL_MOVE = "ILLEGAL_MOVE";

	static final String NOT_YOUR_SIDE = "NOT_YOUR_SIDE";

	static final String NOTHING_TO_UNDO = "NOTHING_TO_UNDO";

	static final String NOTHING_TO_REDO = "NOTHING_TO_REDO";

	static final String UNDO_NOT_ALLOWED = "UNDO_NOT_ALLOWED";

	static final String MODE_NOT_ALLOWED = "MODE_NOT_ALLOWED";

	static final String DRAW_OFFER_NOT_SUPPORTED = "DRAW_OFFER_NOT_SUPPORTED";

	/** Matches nobody has touched for this long are forgotten. */
	static final Duration KEPT_FOR = Duration.ofDays(30);

	private final ChessMatchStore store;

	private final ChessAiProperties properties;

	private final Clock clock;

	ChessService(ChessMatchStore store, ChessAiProperties properties, Clock clock) {
		this.store = store;
		this.properties = properties;
		this.clock = clock;
	}

	/** A new local match from the starting position. The player's match in progress, if any, is left. */
	@Transactional
	public MatchResponse start(Owner owner, Mode mode) {
		if (mode != Mode.LOCAL) {
			// A game against the engine is admins' and starts from the AI endpoints.
			throw new ApiException(HttpStatus.BAD_REQUEST, MODE_NOT_ALLOWED, "Only local games start here");
		}
		return insert(owner, ChessMatch.start(owner, mode, this.clock.instant()));
	}

	/** A new game against Stockfish (the caller is an admin: {@link ChessAiService} checked). */
	@Transactional
	MatchResponse startAgainstEngine(Owner owner, Color engineSide, Difficulty difficulty) {
		return insert(owner, ChessMatch.againstEngine(owner, engineSide, difficulty, this.clock.instant()));
	}

	private MatchResponse insert(Owner owner, ChessMatch match) {
		Instant now = match.createdAt();
		this.store.deleteUntouchedSince(now.minus(KEPT_FOR));
		this.store.abandonActive(owner, now);
		if (!this.store.insert(match)) {
			// Another request started one at the same moment: that one is the player's match.
			return this.store.findCurrent(owner)
				.map((current) -> view(current, owner))
				.orElseThrow(() -> new ConflictException(STALE_REVISION, "A match could not be started"));
		}
		return view(match, owner);
	}

	/** The player's match in progress, else the last one they finished; empty when there is none. */
	@Transactional(readOnly = true)
	public Optional<MatchResponse> current(Owner owner) {
		return this.store.findCurrent(owner).map((match) -> view(match, owner));
	}

	@Transactional(readOnly = true)
	public MatchResponse get(Owner owner, UUID matchId) {
		return view(owned(owner, matchId), owner);
	}

	/** Plays a move for the side to move. Moves taken back can no longer be replayed. */
	@Transactional
	public MatchResponse move(Owner owner, UUID matchId, int revision, String uci) {
		return act(owner, matchId, revision, (match) -> {
			ChessGame game = match.game();
			requireSide(match, owner, game.position().turn());
			Move move;
			try {
				move = Move.parse(uci);
			}
			catch (IllegalArgumentException ex) {
				// Well formed but not a move at all, such as e2e2.
				throw new ApiException(HttpStatus.BAD_REQUEST, ILLEGAL_MOVE, "That move is not legal here");
			}
			ChessGame next = judged(() -> game.play(move));
			return match.after(next, List.of(), this.clock.instant());
		});
	}

	/**
	 * Plays the engine's move in a game against it, judged by the same rules as a player's. The caller
	 * has checked it is the engine's turn; {@code move} comes from the engine, never from a request.
	 */
	ChessMatch playEngineMove(ChessMatch match, Move move) {
		ChessGame game = match.game();
		ChessGame next = judged(() -> game.play(move));
		ChessMatch played = match.after(next, List.of(), this.clock.instant());
		this.store.save(played);
		return played;
	}

	/** Takes the last move back (local matches only); redo can play it again. */
	@Transactional
	public MatchResponse undo(Owner owner, UUID matchId, int revision) {
		return act(owner, matchId, revision, (match) -> {
			requireLocal(match);
			ChessGame game = match.game();
			if (game.moves().isEmpty()) {
				throw new ConflictException(NOTHING_TO_UNDO, "There is no move to take back");
			}
			Move last = game.moves().get(game.moves().size() - 1);
			ChessGame back = judged(game::takeBack);
			List<Move> undone = new ArrayList<>(match.undone());
			undone.add(last);
			return match.after(back, undone, this.clock.instant());
		});
	}

	/** Plays the move taken back last again, by the rules like any move (local matches only). */
	@Transactional
	public MatchResponse redo(Owner owner, UUID matchId, int revision) {
		return act(owner, matchId, revision, (match) -> {
			requireLocal(match);
			if (match.undone().isEmpty()) {
				throw new ConflictException(NOTHING_TO_REDO, "There is no move to replay");
			}
			List<Move> undone = new ArrayList<>(match.undone());
			Move again = undone.remove(undone.size() - 1);
			ChessGame game = match.game();
			ChessGame next = judged(() -> game.play(again));
			return match.after(next, undone, this.clock.instant());
		});
	}

	@Transactional
	public MatchResponse resign(Owner owner, UUID matchId, int revision, Color side) {
		return act(owner, matchId, revision, (match) -> {
			requireSide(match, owner, side);
			ChessGame game = match.game();
			return match.after(judged(() -> game.resign(side)), match.undone(), this.clock.instant());
		});
	}

	/**
	 * Offers, accepts or declines a draw for a side, or claims one for the side to move. The engine
	 * takes no offers, so against it only claims are possible.
	 */
	@Transactional
	public MatchResponse draw(Owner owner, UUID matchId, int revision, DrawAction action, Color side) {
		return act(owner, matchId, revision, (match) -> {
			requireSide(match, owner, side);
			if (match.mode() == Mode.AI && action != DrawAction.CLAIM) {
				throw new ConflictException(DRAW_OFFER_NOT_SUPPORTED, "Stockfish does not answer draw offers");
			}
			ChessGame game = match.game();
			ChessGame next = judged(() -> switch (action) {
				case OFFER -> game.offerDraw(side);
				case ACCEPT -> game.acceptDraw(side);
				case DECLINE -> game.declineDraw(side);
				case CLAIM -> game.claimDraw(side);
			});
			return match.after(next, match.undone(), this.clock.instant());
		});
	}

	// --- Rules of the match --------------------------------------------------------------------------

	/** The caller's match; someone else's is as good as missing (an id alone tells nothing). */
	ChessMatch owned(Owner owner, UUID matchId) {
		return this.store.find(matchId)
			.filter((match) -> match.belongsTo(owner))
			.orElseThrow(() -> new NotFoundException("Chess match", matchId));
	}

	/** The same, locked until the transaction ends. */
	ChessMatch ownedForUpdate(Owner owner, UUID matchId) {
		return this.store.findForUpdate(matchId)
			.filter((match) -> match.belongsTo(owner))
			.orElseThrow(() -> new NotFoundException("Chess match", matchId));
	}

	/** Refuses an action on a match that is over or no longer at the revision it was chosen in. */
	static void requireCurrent(ChessMatch match, int revision) {
		if (match.status() != Status.ACTIVE) {
			throw new ConflictException(MATCH_OVER, "This match is over");
		}
		if (match.revision() != revision) {
			throw new ConflictException(STALE_REVISION, "The match has changed since; showing it as it is now");
		}
	}

	/** Loads the caller's match locked, checks it is on and at the revision the action was chosen in, acts and saves. */
	private MatchResponse act(Owner owner, UUID matchId, int revision, UnaryOperator<ChessMatch> action) {
		ChessMatch match = ownedForUpdate(owner, matchId);
		requireCurrent(match, revision);
		ChessMatch next = action.apply(match);
		this.store.save(next);
		return view(next, owner);
	}

	/**
	 * The sides the caller plays. In a local match the owner plays both; against Stockfish only the
	 * side the engine does not play. A match between accounts would give each account its seat here.
	 */
	static Set<Color> sidesOf(ChessMatch match, Owner owner) {
		if (!match.belongsTo(owner)) {
			return EnumSet.noneOf(Color.class);
		}
		return switch (match.mode()) {
			case LOCAL -> EnumSet.allOf(Color.class);
			case AI -> EnumSet.of(match.engineSide().opposite());
		};
	}

	static void requireSide(ChessMatch match, Owner owner, Color side) {
		if (!sidesOf(match, owner).contains(side)) {
			throw new ApiException(HttpStatus.FORBIDDEN, NOT_YOUR_SIDE, "You do not play " + side);
		}
	}

	private static void requireLocal(ChessMatch match) {
		if (match.mode() != Mode.LOCAL) {
			throw new ConflictException(UNDO_NOT_ALLOWED, "Moves can only be taken back in a local match");
		}
	}

	/** Runs an action by the rules, turning a refusal into the API's answer. */
	static ChessGame judged(Supplier<ChessGame> action) {
		try {
			return action.get();
		}
		catch (RuleException ex) {
			throw switch (ex.rejection()) {
				case ILLEGAL_MOVE -> new ApiException(HttpStatus.BAD_REQUEST, ILLEGAL_MOVE, "That move is not legal here");
				case GAME_OVER -> new ConflictException(MATCH_OVER, "This match is over");
				case NOTHING_TO_TAKE_BACK -> new ConflictException(NOTHING_TO_UNDO, "There is no move to take back");
				case NO_DRAW_OFFER -> new ConflictException(ex.rejection().name(), "There is no draw offer to answer");
				case DRAW_ALREADY_OFFERED -> new ConflictException(ex.rejection().name(), "A draw has been offered already");
				case DRAW_NOT_CLAIMABLE -> new ConflictException(ex.rejection().name(), "No draw can be claimed in this position");
				case NOT_YOUR_TURN -> new ConflictException(ex.rejection().name(), "Only the side to move can do that");
			};
		}
	}

	/**
	 * The caller's hints in a match: none for a guest, a fixed number per match for a player, no limit
	 * for an admin. The role is the server's, from the caller's session.
	 */
	HintAllowance hintsOf(ChessMatch match, Owner owner) {
		if (!owner.isSignedIn()) {
			return new HintAllowance(false, match.hintsUsed(), 0, 0);
		}
		if (owner.isAdmin()) {
			return new HintAllowance(true, match.hintsUsed(), null, null);
		}
		int limit = this.properties.hintsPerGame();
		return new HintAllowance(true, match.hintsUsed(), limit, Math.max(0, limit - match.hintsUsed()));
	}

	// --- The view ------------------------------------------------------------------------------------

	MatchResponse view(ChessMatch match, Owner owner) {
		ChessGame game = match.game();
		Position position = game.position();
		boolean on = match.status() == Status.ACTIVE && !game.isOver();

		List<LegalMove> legal = on ? position.legalMoves().stream().map((move) -> legalMove(position, move)).toList()
				: List.of();

		List<PlayedMove> history = new ArrayList<>(game.moves().size());
		Map<Color, List<String>> captured = new EnumMap<>(Color.class);
		captured.put(Color.WHITE, new ArrayList<>());
		captured.put(Color.BLACK, new ArrayList<>());
		for (int index = 0; index < game.moves().size(); index++) {
			Position before = game.positions().get(index);
			Move move = game.moves().get(index);
			history.add(new PlayedMove(index + 1, before.turn(), Square.name(move.from()), Square.name(move.to()),
					move.uci(), game.sans().get(index)));
			Piece taken = before.capturedBy(move);
			if (taken != null) {
				captured.get(before.turn()).add(String.valueOf(taken.type().letter()));
			}
		}

		Map<Color, Integer> material = new EnumMap<>(Color.class);
		material.put(Color.WHITE, 0);
		material.put(Color.BLACK, 0);
		for (int square = 0; square < 64; square++) {
			Piece piece = position.pieceAt(square);
			if (piece != null) {
				material.merge(piece.color(), piece.type().value(), Integer::sum);
			}
		}

		ResultView result = game.result()
			.map((outcome) -> new ResultView(outcome.winner(), outcome.termination(), outcome.score()))
			.orElse(null);
		boolean local = match.mode() == Mode.LOCAL;
		EngineView engine = (match.mode() == Mode.AI) ? new EngineView(match.engineSide(), match.difficulty(),
				match.difficulty().label(), match.difficulty().setting()) : null;
		return new MatchResponse(match.id(), match.mode(), match.status(), match.revision(), position.toFen(),
				position.turn(), position.fullmoveNumber(), position.halfmoveClock(), position.inCheck(),
				position.inCheck() ? Square.name(position.kingSquare(position.turn())) : null, legal,
				history.isEmpty() ? null : history.get(history.size() - 1), history, captured, material,
				on ? game.drawOffer() : null, on ? game.claimableDraw().orElse(null) : null, game.repetitions(),
				on && local && !game.moves().isEmpty(), on && local && !match.undone().isEmpty(), engine,
				hintsOf(match, owner), result, match.createdAt(), match.updatedAt());
	}

	private static LegalMove legalMove(Position position, Move move) {
		return new LegalMove(Square.name(move.from()), Square.name(move.to()),
				(move.promotion() != null) ? String.valueOf(move.promotion().letter()) : null, move.uci(),
				San.of(position, move), position.capturedBy(move) != null, position.isCastling(move),
				position.isEnPassant(move));
	}

}
