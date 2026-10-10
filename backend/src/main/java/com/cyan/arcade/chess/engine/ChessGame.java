package com.cyan.arcade.chess.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * A game of chess from its first position: every move played, each position it passed through, a
 * pending draw offer and, once it is over, the result. Immutable: every action returns the next
 * game, and a refused action throws {@link RuleException} and changes nothing.
 *
 * <p>The game ends by itself on checkmate, stalemate, insufficient material, the fifth occurrence of
 * a position and the 75-move rule (FIDE Laws 9.6, unless the last move mated). A threefold repetition
 * or fifty moves without a capture or pawn move give the side to move the right to claim a draw
 * (9.2, 9.3). Players may also resign, or agree to a draw: an offer stands until the other side
 * accepts, declines, or moves.
 */
public final class ChessGame {

	/** Why an action was refused. */
	public enum Rejection {

		ILLEGAL_MOVE, GAME_OVER, NOTHING_TO_TAKE_BACK, NO_DRAW_OFFER, DRAW_ALREADY_OFFERED, DRAW_NOT_CLAIMABLE,
		NOT_YOUR_TURN

	}

	/** An action the rules do not allow in this game. */
	public static final class RuleException extends RuntimeException {

		private final Rejection rejection;

		RuleException(Rejection rejection, String message) {
			super(message);
			this.rejection = rejection;
		}

		public Rejection rejection() {
			return this.rejection;
		}

	}

	/** Positions in a row without a capture or pawn move after which the game is drawn by itself. */
	static final int SEVENTY_FIVE_MOVES = 150;

	/** The same, after which the side to move may claim a draw. */
	static final int FIFTY_MOVES = 100;

	private final List<Position> positions;

	private final List<Move> moves;

	private final List<String> sans;

	private final Color drawOffer;

	private final Result result;

	private ChessGame(List<Position> positions, List<Move> moves, List<String> sans, Color drawOffer, Result result) {
		this.positions = List.copyOf(positions);
		this.moves = List.copyOf(moves);
		this.sans = List.copyOf(sans);
		this.drawOffer = drawOffer;
		this.result = result;
	}

	/** A new game from the usual starting position. */
	public static ChessGame start() {
		return from(Position.initial());
	}

	/** A new game from any legal position (tests and puzzles); it may be over already, as stalemate. */
	public static ChessGame from(Position start) {
		return new ChessGame(List.of(start), List.of(), List.of(), null, automaticResult(List.of(start)));
	}

	/**
	 * The game a list of moves makes from a position.
	 * @throws RuleException when a move is illegal where it is played, or comes after the end
	 */
	public static ChessGame replay(Position start, List<Move> moves) {
		ChessGame game = from(start);
		for (Move move : moves) {
			game = game.play(move);
		}
		return game;
	}

	// --- Where it stands -----------------------------------------------------------------------------

	/** The position now. */
	public Position position() {
		return this.positions.get(this.positions.size() - 1);
	}

	public Position startPosition() {
		return this.positions.get(0);
	}

	/** Every position, the first one included: one more than the moves. */
	public List<Position> positions() {
		return this.positions;
	}

	public List<Move> moves() {
		return this.moves;
	}

	/** The moves in standard algebraic notation. */
	public List<String> sans() {
		return this.sans;
	}

	public Optional<Result> result() {
		return Optional.ofNullable(this.result);
	}

	public boolean isOver() {
		return this.result != null;
	}

	/** The side whose draw offer stands, or {@code null}. */
	public Color drawOffer() {
		return this.drawOffer;
	}

	/** How many times the position now has occurred in this game, this time included. */
	public int repetitions() {
		return repetitions(this.positions);
	}

	/** A draw the side to move may claim now: threefold repetition first, else the fifty-move rule. */
	public Optional<Termination> claimableDraw() {
		if (isOver()) {
			return Optional.empty();
		}
		if (repetitions() >= 3) {
			return Optional.of(Termination.THREEFOLD_REPETITION);
		}
		if (position().halfmoveClock() >= FIFTY_MOVES) {
			return Optional.of(Termination.FIFTY_MOVE_RULE);
		}
		return Optional.empty();
	}

	// --- Actions -------------------------------------------------------------------------------------

	/** Plays a move for the side to move. A draw offer made by the other side lapses. */
	public ChessGame play(Move move) {
		requireOn();
		Position before = position();
		if (!before.isLegal(move)) {
			throw new RuleException(Rejection.ILLEGAL_MOVE, "Illegal move " + move.uci());
		}
		String san = San.of(before, move);
		Position after = before.play(move);
		List<Position> positions = new ArrayList<>(this.positions);
		positions.add(after);
		List<Move> moves = new ArrayList<>(this.moves);
		moves.add(move);
		List<String> sans = new ArrayList<>(this.sans);
		sans.add(san);
		Color offer = (this.drawOffer == before.turn()) ? this.drawOffer : null;
		Result result = automaticResult(positions);
		return new ChessGame(positions, moves, sans, (result == null) ? offer : null, result);
	}

	public ChessGame resign(Color side) {
		requireOn();
		return finish(Result.win(side.opposite(), Termination.RESIGNATION));
	}

	/** Offers a draw; offering when the other side has offered one agrees to it. */
	public ChessGame offerDraw(Color side) {
		requireOn();
		if (this.drawOffer == side) {
			throw new RuleException(Rejection.DRAW_ALREADY_OFFERED, side + " has offered a draw already");
		}
		if (this.drawOffer == side.opposite()) {
			return acceptDraw(side);
		}
		return new ChessGame(this.positions, this.moves, this.sans, side, null);
	}

	public ChessGame acceptDraw(Color side) {
		requireOn();
		requireOfferTo(side);
		return finish(Result.draw(Termination.AGREEMENT));
	}

	public ChessGame declineDraw(Color side) {
		requireOn();
		requireOfferTo(side);
		return new ChessGame(this.positions, this.moves, this.sans, null, null);
	}

	/** The side to move claims a draw by threefold repetition or the fifty-move rule. */
	public ChessGame claimDraw(Color side) {
		requireOn();
		if (side != position().turn()) {
			throw new RuleException(Rejection.NOT_YOUR_TURN, "Only the side to move may claim a draw");
		}
		Termination claim = claimableDraw()
			.orElseThrow(() -> new RuleException(Rejection.DRAW_NOT_CLAIMABLE, "No draw can be claimed here"));
		return finish(Result.draw(claim));
	}

	/** Takes the last move back, while the game is on. A pending draw offer goes with it. */
	public ChessGame takeBack() {
		requireOn();
		if (this.moves.isEmpty()) {
			throw new RuleException(Rejection.NOTHING_TO_TAKE_BACK, "No move to take back");
		}
		int last = this.moves.size() - 1;
		return new ChessGame(this.positions.subList(0, last + 1), this.moves.subList(0, last),
				this.sans.subList(0, last), null, null);
	}

	/**
	 * The game as it was recorded: the moves replayed, and a result that came from a player (a
	 * resignation, an agreement or a claim) put back. A recorded result must be one these moves allow.
	 * @throws IllegalStateException when the record does not hold together
	 */
	public static ChessGame restore(Position start, List<Move> moves, Color drawOffer, Result recorded) {
		ChessGame game;
		try {
			game = replay(start, moves);
		}
		catch (RuleException ex) {
			throw new IllegalStateException("Recorded moves do not replay: " + ex.getMessage(), ex);
		}
		if (game.isOver()) {
			if (recorded == null || !recorded.equals(game.result)) {
				throw new IllegalStateException("Recorded result " + recorded + " is not " + game.result);
			}
			return game;
		}
		if (recorded != null) {
			if (recorded.termination().automatic()) {
				throw new IllegalStateException("The position does not end the game: " + recorded);
			}
			if (recorded.termination().claimable() && game.claimableDraw().isEmpty()) {
				throw new IllegalStateException("No draw could be claimed: " + recorded);
			}
			return game.finish(recorded);
		}
		return new ChessGame(game.positions, game.moves, game.sans, drawOffer, null);
	}

	// --- Rules ---------------------------------------------------------------------------------------

	private ChessGame finish(Result result) {
		return new ChessGame(this.positions, this.moves, this.sans, null, result);
	}

	private void requireOn() {
		if (isOver()) {
			throw new RuleException(Rejection.GAME_OVER, "The game is over");
		}
	}

	private void requireOfferTo(Color side) {
		if (this.drawOffer != side.opposite()) {
			throw new RuleException(Rejection.NO_DRAW_OFFER, "No draw offer to answer");
		}
	}

	/** What the last position decides by itself, if anything. */
	private static Result automaticResult(List<Position> positions) {
		Position position = positions.get(positions.size() - 1);
		if (position.legalMoves().isEmpty()) {
			return position.inCheck() ? Result.win(position.turn().opposite(), Termination.CHECKMATE)
					: Result.draw(Termination.STALEMATE);
		}
		if (position.insufficientMaterial()) {
			return Result.draw(Termination.INSUFFICIENT_MATERIAL);
		}
		if (repetitions(positions) >= 5) {
			return Result.draw(Termination.FIVEFOLD_REPETITION);
		}
		if (position.halfmoveClock() >= SEVENTY_FIVE_MOVES) {
			return Result.draw(Termination.SEVENTY_FIVE_MOVE_RULE);
		}
		return null;
	}

	/**
	 * How often the last position occurs. Only positions since the last capture or pawn move can be
	 * the same (those cannot be undone), so the search stops there.
	 */
	private static int repetitions(List<Position> positions) {
		int last = positions.size() - 1;
		Position position = positions.get(last);
		String key = position.repetitionKey();
		int earliest = Math.max(0, last - position.halfmoveClock());
		int count = 0;
		for (int index = last; index >= earliest; index -= 2) {
			if (positions.get(index).repetitionKey().equals(key)) {
				count++;
			}
		}
		return count;
	}

}
