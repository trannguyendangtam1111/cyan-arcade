package com.cyan.arcade.chess;

import com.cyan.arcade.chess.stockfish.EngineException;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;

/**
 * Engine failures as the API answers them. Players are told only that the engine is unavailable,
 * busy or failed; what happened is logged (without positions or players' data).
 */
final class EngineErrors {

	static final String ENGINE_UNAVAILABLE = "ENGINE_UNAVAILABLE";

	static final String ENGINE_BUSY = "ENGINE_BUSY";

	static final String ENGINE_FAILED = "ENGINE_FAILED";

	static final String ANALYSIS_CANCELLED = "ANALYSIS_CANCELLED";

	private static final Logger log = LoggerFactory.getLogger(EngineErrors.class);

	private EngineErrors() {
	}

	/** @param what what was asked of the engine, for the log ({@code hint}, {@code engine move}…) */
	static ApiException toApi(EngineException ex, String what) {
		return switch (ex.kind()) {
			case UNAVAILABLE -> {
				log.warn("Chess engine unavailable for {}: {}", what, ex.getMessage());
				yield new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ENGINE_UNAVAILABLE,
						"The chess engine is not available right now.");
			}
			case BUSY -> {
				log.info("Chess engine busy for {}", what);
				yield new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ENGINE_BUSY,
						"The chess engine is busy. Try again in a moment.");
			}
			case CANCELLED -> new ConflictException(ANALYSIS_CANCELLED, "The analysis was cancelled.");
			case TIMEOUT, CRASHED, PROTOCOL -> {
				log.warn("Chess engine failed during {} ({}): {}", what, ex.kind(), ex.getMessage());
				yield new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ENGINE_FAILED,
						"The chess engine did not answer properly. Nothing was changed; try again.");
			}
		};
	}

}
