package com.cyan.arcade.chess.stockfish;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * A fixed number of engine processes, each lent to one search at a time. Engines are started when
 * first needed and kept for the next search; one that crashed, timed out or was interrupted is ended
 * and replaced by a fresh one on a later loan. Callers wait at most a given time for an engine, and
 * only so many may wait at once: beyond that a request is refused at once rather than queued.
 */
public final class EnginePool implements AutoCloseable {

	private final Supplier<UciEngine> factory;

	private final Semaphore permits;

	private final int maxWaiting;

	private final AtomicInteger waiting = new AtomicInteger();

	private final Deque<UciEngine> idle = new ArrayDeque<>();

	private volatile boolean closed;

	/**
	 * @param size engine processes at most
	 * @param maxWaiting requests that may wait for an engine at once
	 */
	public EnginePool(Supplier<UciEngine> factory, int size, int maxWaiting) {
		if (size < 1) {
			throw new IllegalArgumentException("A pool needs at least one engine");
		}
		this.factory = factory;
		this.permits = new Semaphore(size, true);
		this.maxWaiting = Math.max(0, maxWaiting);
	}

	/** An engine on loan; closing it gives it back (or ends it, if it is no longer healthy). */
	public final class Lease implements AutoCloseable {

		private final UciEngine engine;

		private boolean returned;

		private Lease(UciEngine engine) {
			this.engine = engine;
		}

		public UciEngine engine() {
			return this.engine;
		}

		@Override
		public void close() {
			if (this.returned) {
				return;
			}
			this.returned = true;
			giveBack(this.engine);
		}

	}

	/**
	 * Lends an engine, starting one if none is idle.
	 * @throws EngineException ({@code BUSY}) when none is free in time or too many are waiting;
	 * ({@code UNAVAILABLE}) when no engine can be started
	 */
	public Lease acquire(Duration wait) {
		if (this.closed) {
			throw new EngineException(EngineException.Kind.UNAVAILABLE, "The engine pool is shut down");
		}
		if (!this.permits.tryAcquire()) {
			if (this.waiting.incrementAndGet() > this.maxWaiting) {
				this.waiting.decrementAndGet();
				throw new EngineException(EngineException.Kind.BUSY, "Too many searches waiting");
			}
			try {
				if (!this.permits.tryAcquire(wait.toNanos(), TimeUnit.NANOSECONDS)) {
					throw new EngineException(EngineException.Kind.BUSY, "No engine free in time");
				}
			}
			catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
				throw new EngineException(EngineException.Kind.CANCELLED, "Interrupted while waiting for an engine", ex);
			}
			finally {
				this.waiting.decrementAndGet();
			}
		}
		try {
			UciEngine engine;
			synchronized (this.idle) {
				engine = this.idle.pollFirst();
			}
			if (engine == null || !engine.isHealthy()) {
				if (engine != null) {
					engine.close();
				}
				engine = this.factory.get();
			}
			return new Lease(engine);
		}
		catch (RuntimeException ex) {
			this.permits.release();
			throw ex;
		}
	}

	private void giveBack(UciEngine engine) {
		try {
			if (this.closed || !engine.isHealthy()) {
				engine.close();
				return;
			}
			synchronized (this.idle) {
				this.idle.addFirst(engine);
			}
		}
		finally {
			this.permits.release();
		}
	}

	/** Engines started and idle now (for tests and status). */
	public int idleEngines() {
		synchronized (this.idle) {
			return this.idle.size();
		}
	}

	@Override
	public void close() {
		this.closed = true;
		synchronized (this.idle) {
			this.idle.forEach(UciEngine::close);
			this.idle.clear();
		}
	}

}
