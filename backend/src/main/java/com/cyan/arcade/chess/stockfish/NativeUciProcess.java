package com.cyan.arcade.chess.stockfish;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * A Stockfish process. Its output is read by a daemon thread into a queue, so the engine never
 * blocks on a full pipe and a caller can wait for a line with a timeout. Error output is discarded:
 * the protocol is on standard output only.
 */
public final class NativeUciProcess implements UciProcess {

	/** Put in the queue when the output ends: nothing more will come. */
	private static final String END = new String("<end of output>");

	/** Longest line kept; anything longer is not UCI and is cut. */
	private static final int MAX_LINE = 16_384;

	private final Process process;

	private final BufferedWriter input;

	private final BlockingQueue<String> output = new LinkedBlockingQueue<>();

	private volatile boolean ended;

	private NativeUciProcess(Process process) {
		this.process = process;
		this.input = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.US_ASCII));
		Thread reader = new Thread(this::pump, "stockfish-output-" + process.pid());
		reader.setDaemon(true);
		reader.start();
	}

	/**
	 * Starts the engine binary.
	 * @throws EngineException ({@code UNAVAILABLE}) when it is missing or cannot be run
	 */
	public static NativeUciProcess start(Path binary) {
		if (!Files.isRegularFile(binary)) {
			throw new EngineException(EngineException.Kind.UNAVAILABLE, "No engine binary at " + binary.toAbsolutePath());
		}
		try {
			Process process = new ProcessBuilder(binary.toAbsolutePath().toString())
				.redirectError(ProcessBuilder.Redirect.DISCARD)
				.start();
			return new NativeUciProcess(process);
		}
		catch (IOException ex) {
			throw new EngineException(EngineException.Kind.UNAVAILABLE, "Cannot start the engine at " + binary, ex);
		}
	}

	private void pump() {
		try (BufferedReader reader = new BufferedReader(
				new InputStreamReader(this.process.getInputStream(), StandardCharsets.US_ASCII))) {
			String line;
			while ((line = reader.readLine()) != null) {
				this.output.add((line.length() > MAX_LINE) ? line.substring(0, MAX_LINE) : line);
			}
		}
		catch (IOException ex) {
			// The process went away; END below says so.
		}
		finally {
			this.output.add(END);
		}
	}

	@Override
	public void send(String command) {
		try {
			this.input.write(command);
			this.input.write('\n');
			this.input.flush();
		}
		catch (IOException ex) {
			throw new EngineException(EngineException.Kind.CRASHED, "The engine stopped reading commands", ex);
		}
	}

	@Override
	public String readLine(Duration timeout) throws InterruptedException {
		if (this.ended) {
			throw new EngineException(EngineException.Kind.CRASHED, "The engine has exited");
		}
		String line = this.output.poll(timeout.toNanos(), TimeUnit.NANOSECONDS);
		if (line == END) {
			this.ended = true;
			throw new EngineException(EngineException.Kind.CRASHED, "The engine has exited");
		}
		return line;
	}

	@Override
	public void discardPending() {
		String line;
		while ((line = this.output.poll()) != null) {
			if (line == END) {
				this.ended = true;
				return;
			}
		}
	}

	@Override
	public boolean isAlive() {
		return !this.ended && this.process.isAlive();
	}

	@Override
	public void destroy() {
		if (!this.process.isAlive()) {
			return;
		}
		try {
			send("quit");
		}
		catch (EngineException | UncheckedIOException ex) {
			// Already gone.
		}
		try {
			if (!this.process.waitFor(500, TimeUnit.MILLISECONDS)) {
				this.process.destroyForcibly();
			}
		}
		catch (InterruptedException ex) {
			this.process.destroyForcibly();
			Thread.currentThread().interrupt();
		}
	}

}
