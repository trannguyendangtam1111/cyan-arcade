package com.cyan.arcade.chess.stockfish;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.function.BooleanSupplier;

/**
 * The application's one way to Stockfish: a bounded pool of engine processes behind a search call.
 * It knows UCI and processes, nothing of matches, players or rules; the chess module asks it for a
 * search and checks every move it gets back.
 *
 * <p>Nothing here is ever faked: when no engine can be started, every call fails with
 * {@code UNAVAILABLE}.
 */
public final class StockfishEngineAdapter implements AutoCloseable {

	private final EnginePool pool;

	private final Duration acquireTimeout;

	private final Duration stopGrace;

	private volatile String engineName;

	/**
	 * @param launcher starts one engine process
	 * @param size engine processes at most
	 * @param maxWaiting searches that may wait for an engine at once
	 */
	public StockfishEngineAdapter(Launcher launcher, int size, int maxWaiting, int threads, int hashMb,
			Duration acquireTimeout, Duration readyTimeout, Duration stopGrace) {
		this.acquireTimeout = acquireTimeout;
		this.stopGrace = stopGrace;
		this.pool = new EnginePool(() -> UciEngine.start(launcher.launch(), threads, hashMb, readyTimeout, stopGrace),
				size, maxWaiting);
	}

	/** Starts one engine process. */
	@FunctionalInterface
	public interface Launcher {

		UciProcess launch();

	}

	/** Starts the binary at a path; on Windows a missing {@code .exe} suffix is added. */
	public static Launcher binaryAt(Path path) {
		return () -> NativeUciProcess.start(resolve(path));
	}

	public static Path resolve(Path path) {
		if (!Files.exists(path)) {
			Path exe = path.resolveSibling(path.getFileName() + ".exe");
			if (Files.exists(exe)) {
				return exe;
			}
		}
		return path;
	}

	/**
	 * Borrows an engine, for a caller that must do more around the search than the search itself
	 * (hold a lock, say). Close the lease to give the engine back.
	 */
	public EnginePool.Lease acquire() {
		EnginePool.Lease lease = this.pool.acquire(this.acquireTimeout);
		this.engineName = lease.engine().name();
		return lease;
	}

	/**
	 * Runs a search on a borrowed engine.
	 * @param budget how long the search may take before it is stopped; the engine then has its
	 * stop grace to answer
	 */
	public SearchResult search(EnginePool.Lease lease, SearchRequest request, Duration budget,
			BooleanSupplier cancelled) {
		return lease.engine().search(request, budget, cancelled);
	}

	/** Borrows an engine, searches, gives it back. */
	public SearchResult search(SearchRequest request, Duration budget, BooleanSupplier cancelled) {
		try (EnginePool.Lease lease = acquire()) {
			return search(lease, request, budget, cancelled);
		}
	}

	/**
	 * The engine's name and version ({@code Stockfish 19}), as its handshake gave it, from an engine
	 * that runs now: one is borrowed without waiting, so a dead idle engine is replaced and an engine
	 * is started if none is idle. When every engine is busy, they are running, and the name already
	 * known is the answer.
	 * @throws EngineException ({@code UNAVAILABLE}) when no engine can be started
	 */
	public String engineName() {
		try (EnginePool.Lease lease = this.pool.acquire(Duration.ZERO)) {
			this.engineName = lease.engine().name();
			return this.engineName;
		}
		catch (EngineException ex) {
			String known = this.engineName;
			if (ex.kind() == EngineException.Kind.BUSY && known != null) {
				return known;
			}
			throw ex;
		}
	}

	/** The name if an engine has started already, without starting one. */
	public String knownEngineName() {
		return this.engineName;
	}

	/** How long an engine is given to answer {@code stop}. */
	public Duration stopGrace() {
		return this.stopGrace;
	}

	@Override
	public void close() {
		this.pool.close();
	}

}
