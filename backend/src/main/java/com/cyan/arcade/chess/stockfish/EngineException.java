package com.cyan.arcade.chess.stockfish;

/** Why the engine could not answer. The message is for the server log, not for players. */
public class EngineException extends RuntimeException {

	public enum Kind {

		/** No engine could be started: the binary is missing, not executable, or not a UCI engine. */
		UNAVAILABLE,
		/** Every engine is busy and the wait for one ran out, or too many requests are waiting. */
		BUSY,
		/** The search did not finish in time, even after being told to stop. */
		TIMEOUT,
		/** The engine process ended or stopped answering. */
		CRASHED,
		/** The engine said something that is not UCI. */
		PROTOCOL,
		/** The caller gave up on the search. */
		CANCELLED

	}

	private final Kind kind;

	public EngineException(Kind kind, String message) {
		super(message);
		this.kind = kind;
	}

	public EngineException(Kind kind, String message, Throwable cause) {
		super(message, cause);
		this.kind = kind;
	}

	public Kind kind() {
		return this.kind;
	}

}
