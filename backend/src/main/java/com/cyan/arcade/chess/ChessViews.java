package com.cyan.arcade.chess;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.chess.ChessMatch.Mode;
import com.cyan.arcade.chess.ChessMatch.Status;
import com.cyan.arcade.chess.analysis.Difficulty;
import com.cyan.arcade.chess.analysis.MoveClassifier.MoveClass;
import com.cyan.arcade.chess.engine.Color;
import com.cyan.arcade.chess.engine.Termination;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * What the chess API sends and receives. Everything the board shows comes from here: the browser
 * draws the position and offers the legal moves it is given, and works nothing out by itself. The
 * engine's output reaches it only as checked moves, notation and evaluations, never as UCI.
 */
final class ChessViews {

	private ChessViews() {
	}

	record StartRequest(@NotNull Mode mode) {
	}

	/**
	 * @param revision the match's revision the move was chosen in; an older one is refused
	 * @param move in UCI: {@code e2e4}, {@code e7e8q}
	 */
	record MoveRequest(@NotNull @Min(0) Integer revision,
			@NotNull @Pattern(regexp = "[a-h][1-8][a-h][1-8][qrbn]?") String move) {
	}

	record RevisionRequest(@NotNull @Min(0) Integer revision) {
	}

	/** @param side the side resigning */
	record ResignRequest(@NotNull @Min(0) Integer revision, @NotNull Color side) {
	}

	enum DrawAction {

		OFFER, ACCEPT, DECLINE, CLAIM

	}

	/** @param side the side offering, answering or claiming */
	record DrawRequest(@NotNull @Min(0) Integer revision, @NotNull DrawAction action, @NotNull Color side) {
	}

	/** A game against Stockfish: the side the player takes and how strongly the engine plays. */
	record StartEngineGameRequest(@NotNull Color playerSide, @NotNull Difficulty difficulty) {
	}

	/**
	 * @param depth search depth, up to the configured maximum; the configured default when left out
	 * @param lines principal variations, 1 to the configured maximum
	 */
	record EvaluationRequest(@NotNull @Min(0) Integer revision, @Min(1) @Max(40) Integer depth,
			@Min(1) @Max(5) Integer lines) {
	}

	/**
	 * A match as its players see it.
	 * @param revision goes up with every change; actions send the one they were chosen in
	 * @param fen the position now
	 * @param checkedKing the square of the king in check, or {@code null}
	 * @param legalMoves every move the side to move may make; none once the match is over
	 * @param lastMove the move that led here, or {@code null} at the start
	 * @param history every move, in order
	 * @param captured by side, the pieces it has taken (lower-case FEN letters), in the order taken
	 * @param material by side, the value of its pieces on the board (pawn 1, knight and bishop 3, rook 5,
	 * queen 9)
	 * @param drawOffer the side whose draw offer stands, or {@code null}
	 * @param claimableDraw a draw the side to move may claim now, or {@code null}
	 * @param repetitions how many times the position now has occurred
	 * @param engine for a game against Stockfish, its side and difficulty; {@code null} otherwise
	 * @param hints the caller's move hints in this match
	 * @param result once the match is over
	 */
	record MatchResponse(UUID id, Mode mode, Status status, int revision, String fen, Color turn, int fullmoveNumber,
			int halfmoveClock, boolean check, String checkedKing, List<LegalMove> legalMoves, PlayedMove lastMove,
			List<PlayedMove> history, Map<Color, List<String>> captured, Map<Color, Integer> material,
			Color drawOffer, Termination claimableDraw, int repetitions, boolean canUndo, boolean canRedo,
			EngineView engine, HintAllowance hints, ResultView result, Instant createdAt, Instant updatedAt) {
	}

	/**
	 * @param promotion the piece a pawn becomes ({@code q r b n}), or {@code null}
	 */
	record LegalMove(String from, String to, String promotion, String uci, String san, boolean capture,
			boolean castling, boolean enPassant) {
	}

	/** @param ply 1 for White's first move, 2 for Black's reply, … */
	record PlayedMove(int ply, Color color, String from, String to, String uci, String san) {
	}

	/**
	 * @param winner {@code null} for a draw
	 * @param score {@code 1-0}, {@code 0-1} or {@code 1/2-1/2}
	 */
	record ResultView(Color winner, Termination termination, String score) {
	}

	/** @param setting what the engine is set to, in its own terms ({@code Elo setting 1600}) */
	record EngineView(Color side, Difficulty difficulty, String label, String setting) {
	}

	/**
	 * The caller's hints in a match.
	 * @param allowed whether the caller may ask for hints at all (guests may not)
	 * @param limit hints per match, or {@code null} for no limit (admins)
	 * @param remaining hints left, or {@code null} for no limit
	 */
	record HintAllowance(boolean allowed, int used, Integer limit, Integer remaining) {
	}

	/** A move as the engine suggests it: checked against the position, in UCI and in SAN. */
	record SuggestedMove(String from, String to, String promotion, String uci, String san) {
	}

	/**
	 * A move hint. It changes nothing on the board.
	 * @param revision the revision of the position the hint is for
	 * @param line the engine's expected continuation in SAN, the hint first
	 * @param depth how deep the engine searched
	 */
	record HintResponse(int revision, SuggestedMove move, List<String> line, int depth, String engine,
			HintAllowance hints) {
	}

	/**
	 * An evaluation, always from White's side.
	 * @param kind {@code CENTIPAWNS} or {@code MATE}
	 * @param centipawns White's advantage for {@code CENTIPAWNS}, 0 for a mate
	 * @param mateIn for a mate, moves to mate (0: mate on the board)
	 * @param matingSide for a mate, the side that mates
	 * @param display {@code +0.34}, {@code #3}, {@code #-2}, {@code 1-0}…
	 * @param whiteWinPercent White's chances, 0 to 100, for an evaluation bar
	 * @param favoured the side ahead, or {@code null} for level
	 * @param exact {@code false} when the engine only reported a bound
	 */
	record EvaluationView(String kind, int centipawns, Integer mateIn, Color matingSide, String display,
			double whiteWinPercent, Color favoured, boolean exact) {
	}

	/** One principal variation. */
	record LineView(int rank, EvaluationView evaluation, List<String> san, List<String> uci, int depth) {
	}

	/**
	 * An engine evaluation of a match's current position.
	 * @param complete whether the search reached its depth without being cut short; otherwise the
	 * numbers are provisional
	 * @param finished for a finished game, the result instead of a search
	 */
	record EvaluationResponse(int revision, Color sideToMove, EvaluationView evaluation, SuggestedMove bestMove,
			List<LineView> lines, int depth, int requestedDepth, boolean complete, boolean finished, String engine) {
	}

	/** One reviewed move. */
	record ReviewedMove(int ply, Color color, String uci, String san, String from, String to, String fenBefore,
			String fenAfter, SuggestedMove best, List<String> bestLine, EvaluationView before, EvaluationView after,
			MoveClass classification, Double loss, int depth) {
	}

	/**
	 * A game review and its progress.
	 * @param status {@code QUEUED}, {@code RUNNING}, {@code DONE}, {@code CANCELLED} or {@code FAILED}
	 * @param analyzed positions analysed so far, of {@code total}
	 * @param moves the moves reviewed so far, in order; a move appears once both positions around it
	 * are analysed
	 */
	record ReviewResponse(UUID matchId, String status, int analyzed, int total, List<ReviewedMove> moves, String engine,
			ReviewSettings settings, String error) {
	}

	record ReviewSettings(long movetimeMs, int depth, int minDepth) {
	}

	/** What the engine offers an admin: whether it runs, the difficulties and the limits. */
	record EngineStatus(boolean available, String engine, List<DifficultyView> difficulties, int defaultDepth,
			int maxDepth, int maxLines, int hintsPerGame) {
	}

	record DifficultyView(Difficulty id, String label, String setting, int movetimeMs) {
	}

}
