package com.cyan.arcade.chess.stockfish;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import java.util.function.LongSupplier;

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

	private record IdleEngine(UciEngine engine, long returnedAt) {
	}

	private final Deque<IdleEngine> idle = new ArrayDeque<>();

	private final LongSupplier nanoTime;

	private volatile boolean closed;

	/**
	 * @param size engine processes at most
	 * @param maxWaiting requests that may wait for an engine at once
	 */
	public EnginePool(Supplier<UciEngine> factory, int size, int maxWaiting) {
		this(factory, size, maxWaiting, System::nanoTime);
	}

	EnginePool(Supplier<UciEngine> factory, int size, int maxWaiting, LongSupplier nanoTime) {
		this.nanoTime = nanoTime;
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
				if (this.closed) {
					throw new EngineException(EngineException.Kind.UNAVAILABLE, "The engine pool is shut down");
				}
				IdleEngine available = this.idle.pollFirst();
				engine = (available == null) ? null : available.engine();
			}
			if (engine == null || !engine.isHealthy()) {
				if (engine != null) {
					engine.close();
				}
				engine = this.factory.get();
			}
			synchronized (this.idle) {
				if (this.closed) {
					engine.close();
					throw new EngineException(EngineException.Kind.UNAVAILABLE, "The engine pool is shut down");
				}
				return new Lease(engine);
			}
		}
		catch (RuntimeException ex) {
			this.permits.release();
			throw ex;
		}
	}

	private void giveBack(UciEngine engine) {
		try {
			synchronized (this.idle) {
				if (this.closed || !engine.isHealthy()) {
					engine.close();
					return;
				}
				this.idle.addFirst(new IdleEngine(engine, this.nanoTime.getAsLong()));
			}
		}
		finally {
			this.permits.release();
		}
	}

	/** Retire only engines currently idle; borrowed engines and their searches are untouched. */
	public int evictIdle(Duration timeout) {
		if (timeout.isZero() || timeout.isNegative()) {
			return 0;
		}
		long now = this.nanoTime.getAsLong();
		int retired = 0;
		synchronized (this.idle) {
			var iterator = this.idle.iterator();
			while (iterator.hasNext()) {
				IdleEngine candidate = iterator.next();
				if (now - candidate.returnedAt() >= timeout.toNanos()) {
					iterator.remove();
					candidate.engine().close();
					retired++;
				}
			}
		}
		return retired;
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
			this.idle.forEach((entry) -> entry.engine().close());
			this.idle.clear();
		}
	}

}
