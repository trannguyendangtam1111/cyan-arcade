package com.cyan.arcade.chess.stockfish;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.BooleanSupplier;

/**
 * One engine process spoken to through UCI, used by one search at a time (the pool sees to that).
 *
 * <p>Start: {@code uci} → {@code uciok} (reading the engine's name), the fixed options (threads,
 * hash), then {@code isready} → {@code readyok}. Every search first syncs with {@code isready}, which
 * also clears anything left over from the last one, then sets every option that differs between
 * searches (strength, number of lines), so no search inherits another's settings. A search that
 * runs past its time, or whose caller gives up, is told to {@code stop}; an engine that does not
 * answer even then is marked unhealthy and the pool replaces it.
 */
public final class UciEngine {

	/** How often a running search checks whether it should stop. */
	private static final Duration POLL = Duration.ofMillis(25);

	/** Stockfish's {@code UCI_Elo} range (version 19); a request outside it is clamped. */
	static final int MIN_ELO = 1320;

	static final int MAX_ELO = 3190;

	private final UciProcess process;

	private final Duration readyTimeout;

	private final Duration stopGrace;

	private final String name;

	private volatile boolean healthy = true;

	private UciEngine(UciProcess process, Duration readyTimeout, Duration stopGrace, String name) {
		this.process = process;
		this.readyTimeout = readyTimeout;
		this.stopGrace = stopGrace;
		this.name = name;
	}

	/**
	 * Does the handshake on a freshly started process.
	 * @throws EngineException ({@code UNAVAILABLE}) when it does not behave like a UCI engine in time;
	 * the process is ended
	 */
	public static UciEngine start(UciProcess process, int threads, int hashMb, Duration readyTimeout,
			Duration stopGrace) {
		try {
			process.send("uci");
			String name = null;
			long deadline = System.nanoTime() + readyTimeout.toNanos();
			while (true) {
				String line = process.readLine(remaining(deadline));
				if (line == null) {
					throw new EngineException(EngineException.Kind.UNAVAILABLE, "No uciok from the engine");
				}
				if (line.startsWith("id name ")) {
					name = line.substring("id name ".length()).trim();
				}
				if (line.equals("uciok")) {
					break;
				}
			}
			UciEngine engine = new UciEngine(process, readyTimeout, stopGrace, (name != null) ? name : "Unknown UCI engine");
			engine.setOption("Threads", Integer.toString(threads));
			engine.setOption("Hash", Integer.toString(hashMb));
			engine.sync();
			return engine;
		}
		catch (EngineException ex) {
			process.destroy();
			throw new EngineException(EngineException.Kind.UNAVAILABLE, "The engine did not start: " + ex.getMessage(), ex);
		}
		catch (InterruptedException ex) {
			process.destroy();
			Thread.currentThread().interrupt();
			throw new EngineException(EngineException.Kind.CANCELLED, "Interrupted while starting the engine", ex);
		}
	}

	/** The engine's name and version, as it gave them: {@code Stockfish 19}. */
	public String name() {
		return this.name;
	}

	/** Whether it can take another search: alive and not left in an unknown state. */
	public boolean isHealthy() {
		return this.healthy && this.process.isAlive();
	}

	/**
	 * Runs one search.
	 * @param timeout how long the search may take before it is told to stop
	 * @param cancelled asked while the search runs; once it says yes the search is stopped
	 * @throws EngineException ({@code CANCELLED}) when the caller gave up; ({@code TIMEOUT},
	 * {@code CRASHED}, {@code PROTOCOL}) when the engine failed, which leaves it unhealthy
	 */
	public SearchResult search(SearchRequest request, Duration timeout, BooleanSupplier cancelled) {
		if (!isHealthy()) {
			throw new EngineException(EngineException.Kind.CRASHED, "The engine is not usable");
		}
		long started = System.nanoTime();
		try {
			sync();
			SearchRequest.Strength strength = request.strength();
			setOption("UCI_LimitStrength", Boolean.toString(strength.elo() != null));
			if (strength.elo() != null) {
				setOption("UCI_Elo", Integer.toString(Math.max(MIN_ELO, Math.min(MAX_ELO, strength.elo()))));
			}
			setOption("Skill Level", Integer.toString(strength.skillLevel()));
			setOption("MultiPV", Integer.toString(request.multiPv()));
			this.process.send(request.positionCommand());
			this.process.send(request.limits().goCommand());
			return collect(request, timeout, cancelled, started);
		}
		catch (InterruptedException ex) {
			this.healthy = false;
			Thread.currentThread().interrupt();
			throw new EngineException(EngineException.Kind.CANCELLED, "Interrupted during a search", ex);
		}
		catch (EngineException ex) {
			if (ex.kind() != EngineException.Kind.CANCELLED) {
				this.healthy = false;
			}
			throw ex;
		}
	}

	private SearchResult collect(SearchRequest request, Duration timeout, BooleanSupplier cancelled, long started)
			throws InterruptedException {
		Map<Integer, SearchResult.Line> exact = new TreeMap<>();
		Map<Integer, SearchResult.Line> bounded = new TreeMap<>();
		int depth = 0;
		long deadline = started + timeout.toNanos();
		long stopDeadline = 0;
		boolean stopped = false;
		boolean callerGaveUp = false;
		while (true) {
			String line = this.process.readLine(POLL);
			long now = System.nanoTime();
			if (line != null) {
				UciParser.Info info = UciParser.parseInfo(line);
				if (info != null && info.multipv() <= request.multiPv()) {
					depth = Math.max(depth, info.depth());
					SearchResult.Line parsed = new SearchResult.Line(info.multipv(), info.depth(), info.seldepth(),
							info.score(), info.pv(), info.nodes());
					if (info.score().isExact()) {
						exact.put(info.multipv(), parsed);
						bounded.remove(info.multipv());
					}
					else {
						bounded.put(info.multipv(), parsed);
					}
					continue;
				}
				if (line.startsWith("bestmove")) {
					UciParser.BestMove best = UciParser.parseBestMove(line);
					if (best == null) {
						throw new EngineException(EngineException.Kind.PROTOCOL, "Malformed bestmove line");
					}
					if (callerGaveUp) {
						throw new EngineException(EngineException.Kind.CANCELLED, "The search was cancelled");
					}
					List<SearchResult.Line> lines = new ArrayList<>();
					for (int rank = 1; rank <= request.multiPv(); rank++) {
						SearchResult.Line chosen = exact.containsKey(rank) ? exact.get(rank) : bounded.get(rank);
						if (chosen != null) {
							lines.add(chosen);
						}
					}
					return new SearchResult(best.move(), best.ponder(), lines, depth, stopped,
							Duration.ofNanos(now - started).toMillis());
				}
				continue;
			}
			if (!stopped && (now > deadline || cancelled.getAsBoolean())) {
				callerGaveUp = now <= deadline;
				this.process.send("stop");
				stopped = true;
				stopDeadline = now + this.stopGrace.toNanos();
			}
			else if (stopped && now > stopDeadline) {
				throw new EngineException(EngineException.Kind.TIMEOUT, "The engine did not stop when told to");
			}
		}
	}

	/** {@code isready} → {@code readyok}, skipping and dropping anything else first. */
	private void sync() throws InterruptedException {
		this.process.discardPending();
		this.process.send("isready");
		long deadline = System.nanoTime() + this.readyTimeout.toNanos();
		while (true) {
			String line = this.process.readLine(remaining(deadline));
			if (line == null) {
				throw new EngineException(EngineException.Kind.TIMEOUT, "No readyok from the engine");
			}
			if (line.equals("readyok")) {
				return;
			}
		}
	}

	private void setOption(String option, String value) {
		this.process.send("setoption name " + option + " value " + value);
	}

	/** Ends the process. */
	public void close() {
		this.healthy = false;
		this.process.destroy();
	}

	private static Duration remaining(long deadline) {
		return Duration.ofNanos(Math.max(1, deadline - System.nanoTime()));
	}

}
