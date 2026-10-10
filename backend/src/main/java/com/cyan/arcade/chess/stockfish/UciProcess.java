package com.cyan.arcade.chess.stockfish;

import java.time.Duration;

/**
 * A running UCI engine as a stream of lines: commands in, output out. The real one is a Stockfish
 * process ({@link NativeUciProcess}); tests use a scripted one, so the protocol handling is tested
 * without an engine.
 */
public interface UciProcess {

	/** Sends one command line. */
	void send(String command);

	/**
	 * The next output line.
	 * @return the line, or {@code null} if none arrived within the timeout
	 * @throws EngineException ({@code CRASHED}) once the process has ended and its output is used up
	 */
	String readLine(Duration timeout) throws InterruptedException;

	/** Drops output not read yet. */
	void discardPending();

	boolean isAlive();

	/** Ends the process, forcibly if it does not quit by itself. Safe to call more than once. */
	void destroy();

}
