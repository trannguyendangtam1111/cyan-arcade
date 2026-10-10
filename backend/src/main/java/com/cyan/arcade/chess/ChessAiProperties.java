package com.cyan.arcade.chess;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Stockfish and what Chess may ask of it ({@code app.chess}). The defaults suit a small server: two
 * single-threaded engines with a small hash, short searches, one game review at a time.
 *
 * @param hintsPerGame move hints a player (not an admin) gets per match
 * @param requestsPerMinute engine requests (hints, engine moves, evaluations, reviews) one account
 * may make in a minute
 */
@ConfigurationProperties("app.chess")
record ChessAiProperties(@DefaultValue Engine engine, @DefaultValue Hints hints, @DefaultValue Evaluation evaluation,
		@DefaultValue Review review, @DefaultValue Cache cache,
		@DefaultValue("3") int hintsPerGame, @DefaultValue("30") int requestsPerMinute) {

	ChessAiProperties {
		if (hintsPerGame < 0 || requestsPerMinute < 1) {
			throw new IllegalArgumentException("app.chess.hints-per-game must be >= 0 and requests-per-minute >= 1");
		}
	}

	/**
	 * The engine processes.
	 *
	 * @param path the Stockfish binary; on Windows {@code .exe} may be left off
	 * @param poolSize engine processes at most, each searching for one request at a time
	 * @param maxWaiting requests that may wait for a free engine; more are refused at once
	 * @param acquireTimeout how long a request waits for a free engine
	 * @param threads search threads per engine (UCI {@code Threads})
	 * @param hashMb transposition table per engine, in MB (UCI {@code Hash})
	 * @param readyTimeout how long a starting engine may take to answer (it loads its network then)
	 * @param stopGrace how long an engine told to stop may take to answer before it is ended
	 */
	record Engine(@DefaultValue("../tools/stockfish/dist/stockfish") String path, @DefaultValue("2") int poolSize,
			@DefaultValue("4") int maxWaiting, @DefaultValue("3s") Duration acquireTimeout, @DefaultValue("1") int threads,
			@DefaultValue("32") int hashMb, @DefaultValue("30s") Duration readyTimeout, @DefaultValue("2s") Duration stopGrace) {

		Engine {
			path = (path == null || path.isBlank()) ? "../tools/stockfish/dist/stockfish" : path;
			if (poolSize < 1 || poolSize > 16 || threads < 1 || threads > 8 || hashMb < 1 || hashMb > 1024 || maxWaiting < 0) {
				throw new IllegalArgumentException(
						"app.chess.engine: pool-size 1..16, threads 1..8, hash-mb 1..1024, max-waiting >= 0");
			}
		}

	}

	/** @param movetime how long a hint is searched; @param depth the deepest a hint goes */
	record Hints(@DefaultValue("600ms") Duration movetime, @DefaultValue("18") int depth) {
	}

	/**
	 * Admin position evaluations.
	 *
	 * @param defaultDepth depth when the request names none
	 * @param maxDepth the deepest a request may ask for
	 * @param maxMovetime the time cap of any evaluation, whatever the depth
	 * @param maxLines principal variations a request may ask for
	 */
	record Evaluation(@DefaultValue("16") int defaultDepth, @DefaultValue("22") int maxDepth,
			@DefaultValue("3s") Duration maxMovetime, @DefaultValue("3") int maxLines) {

		Evaluation {
			if (defaultDepth < 1 || maxDepth < defaultDepth || maxDepth > 40 || maxLines < 1 || maxLines > 5) {
				throw new IllegalArgumentException("app.chess.evaluation: 1 <= default-depth <= max-depth <= 40, max-lines 1..5");
			}
		}

	}

	/**
	 * Game reviews.
	 *
	 * @param movetime time per position
	 * @param depth the deepest a position is searched
	 * @param minDepth below this depth a move is left unrated
	 * @param maxPlies longest game that may be reviewed
	 * @param concurrent reviews running at once (each uses one engine at a time)
	 * @param queue reviews that may wait to run; more are refused
	 * @param keptFor how long a finished review's progress record is kept
	 * @param abandonedAfter a running review nobody has asked about for this long is cancelled
	 */
	record Review(@DefaultValue("250ms") Duration movetime, @DefaultValue("16") int depth, @DefaultValue("8") int minDepth,
			@DefaultValue("300") int maxPlies, @DefaultValue("1") int concurrent, @DefaultValue("4") int queue,
			@DefaultValue("30m") Duration keptFor, @DefaultValue("1m") Duration abandonedAfter) {

		Review {
			if (depth < 1 || minDepth < 1 || maxPlies < 1 || concurrent < 1 || queue < 0) {
				throw new IllegalArgumentException("app.chess.review: depth, min-depth, max-plies, concurrent >= 1, queue >= 0");
			}
		}

	}

	/** Engine results kept for reuse: at most {@code maxEntries}, each for {@code ttl}. */
	record Cache(@DefaultValue("5000") int maxEntries, @DefaultValue("6h") Duration ttl) {
	}

}
