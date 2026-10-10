package com.cyan.arcade.chess.stockfish;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * A scripted UCI engine for tests: it answers the handshake and {@code isready} like Stockfish, and
 * {@code go} with whatever the test scripts, so the protocol code is tested without a real engine.
 */
class FakeUciProcess implements UciProcess {

	final BlockingQueue<String> output = new LinkedBlockingQueue<>();

	final List<String> received = Collections.synchronizedList(new ArrayList<>());

	/** The answer to {@code go}, given the last {@code position} command and the {@code go} command. */
	volatile Function<String[], List<String>> onGo = (commands) -> List.of(
			"info depth 10 seldepth 12 multipv 1 score cp 25 nodes 1000 time 5 pv e2e4 e7e5",
			"bestmove e2e4 ponder e7e5");

	/** The answer to {@code stop}; empty for an engine that ignores it. */
	volatile List<String> onStop = List.of("bestmove e2e4");

	volatile boolean answersUci = true;

	volatile boolean alive = true;

	volatile boolean destroyed;

	private volatile String lastPosition = "";

	@Override
	public void send(String command) {
		if (!this.alive) {
			throw new EngineException(EngineException.Kind.CRASHED, "gone");
		}
		this.received.add(command);
		if (command.equals("uci") && this.answersUci) {
			this.output.add("id name Fake Engine 1");
			this.output.add("option name Skill Level type spin default 20 min 0 max 20");
			this.output.add("uciok");
		}
		else if (command.equals("isready")) {
			this.output.add("readyok");
		}
		else if (command.startsWith("position ")) {
			this.lastPosition = command;
		}
		else if (command.startsWith("go")) {
			this.output.addAll(this.onGo.apply(new String[] { this.lastPosition, command }));
		}
		else if (command.equals("stop")) {
			this.output.addAll(this.onStop);
		}
	}

	@Override
	public String readLine(Duration timeout) throws InterruptedException {
		if (!this.alive && this.output.isEmpty()) {
			throw new EngineException(EngineException.Kind.CRASHED, "gone");
		}
		return this.output.poll(timeout.toNanos(), TimeUnit.NANOSECONDS);
	}

	@Override
	public void discardPending() {
		this.output.clear();
	}

	@Override
	public boolean isAlive() {
		return this.alive;
	}

	@Override
	public void destroy() {
		this.alive = false;
		this.destroyed = true;
	}

	/** The commands received that start with a prefix. */
	List<String> sent(String prefix) {
		synchronized (this.received) {
			return this.received.stream().filter((command) -> command.startsWith(prefix)).toList();
		}
	}

}
