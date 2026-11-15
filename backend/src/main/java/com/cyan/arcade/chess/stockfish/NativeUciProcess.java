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
import java.util.concurrent.ArrayBlockingQueue;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.concurrent.TimeUnit;

/**
 * A Stockfish process. Its output is read by a daemon thread into a queue, so the engine never
 * blocks on a full pipe and a caller can wait for a line with a timeout. Error output is discarded:
 * the protocol is on standard output only.
 */
public final class NativeUciProcess implements UciProcess {

	private static final Logger log = LoggerFactory.getLogger(NativeUciProcess.class);

	/** Bound retained protocol lines as well as the length of each line. */
	static final int MAX_PENDING_LINES = 128;

	/** Put in the queue when the output ends: nothing more will come. */
	private static final String END = new String("<end of output>");

	/** Longest line kept; anything longer is not UCI and is cut. */
	private static final int MAX_LINE = 16_384;

	private final Process process;

	private final BufferedWriter input;

	private final BlockingQueue<String> output = new ArrayBlockingQueue<>(MAX_PENDING_LINES);

	private final Thread reader;

	private volatile boolean ended;

	private volatile boolean closing;

	NativeUciProcess(Process process) {
		this.process = process;
		this.input = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.US_ASCII));
		this.reader = new Thread(this::pump, "stockfish-output");
		this.reader.setDaemon(true);
		this.reader.start();
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
				if (!this.closing) {
					this.output.put((line.length() > MAX_LINE) ? line.substring(0, MAX_LINE) : line);
				}
			}
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
		catch (IOException ex) {
			// The process went away; END below says so.
		}
		finally {
			this.output.offer(END);
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
		if (line == END || (line == null && !this.process.isAlive())) {
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
	public synchronized void destroy() {
		// Clear temporarily so even an interrupted search can reap its child, then restore it.
		boolean interrupted = Thread.interrupted();
		this.closing = true;
		this.ended = true;
		// Drain output during graceful quit instead of leaving the engine blocked on stdout.
		this.output.clear();
		try {
			if (this.process.isAlive()) {
				try {
					send("quit");
				}
				catch (EngineException | UncheckedIOException ex) {
					// Already gone.
				}
				if (!this.process.waitFor(500, TimeUnit.MILLISECONDS)) {
					this.process.destroyForcibly();
					if (!this.process.waitFor(1000, TimeUnit.MILLISECONDS)) {
						log.warn("Stockfish did not exit within the forced-termination deadline");
					}
				}
			}
		}
		catch (InterruptedException ex) {
			interrupted = true;
			this.process.destroyForcibly();
			try {
				this.process.waitFor(1000, TimeUnit.MILLISECONDS);
			}
			catch (InterruptedException again) {
				interrupted = true;
			}
		}
		finally {
			this.reader.interrupt();
			for (java.io.Closeable stream : new java.io.Closeable[] {
					this.input, this.process.getInputStream(), this.process.getErrorStream() }) {
				try {
					stream.close();
				}
				catch (IOException ex) {
					// A closed pipe must not prevent closing the remaining streams.
				}
			}
			try {
				this.reader.join(1000);
			}
			catch (InterruptedException ex) {
				interrupted = true;
			}
			this.output.clear();
			this.output.offer(END);
			if (interrupted) {
				Thread.currentThread().interrupt();
			}
		}
	}

	int pendingLines() {
		return this.output.size();
	}

	boolean readerAlive() {
		return this.reader.isAlive();
	}

}
