package com.cyan.arcade.chess;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.cyan.arcade.chess.engine.Move;
import com.cyan.arcade.chess.engine.Position;
import com.cyan.arcade.chess.stockfish.EngineException;
import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;
import com.cyan.arcade.chess.stockfish.UciProcess;

/**
 * A stand-in for Stockfish in the integration tests, speaking real UCI. It does not play chess well:
 * it mates in one when it can, and otherwise plays the first legal move in the rules engine's order,
 * with a fixed score. That keeps the tests fast and deterministic and still makes every answer a
 * legal move, which is all the application may rely on. It can also be made to crash, to answer with
 * an illegal move, or to be missing altogether.
 */
public class FakeStockfish {

	public enum Behaviour {

		/** Answers every search. */
		NORMAL,
		/** The process dies when asked to search. */
		CRASH,
		/** Answers with a move that is not legal. */
		ILLEGAL_MOVE,
		/** Cannot be started, like a missing binary. */
		MISSING

	}

	public volatile Behaviour behaviour = Behaviour.NORMAL;

	/** The score reported for a quiet move, in centipawns for the side to move. */
	public volatile int score = 20;

	/** Searches answered so far. */
	public final AtomicInteger searches = new AtomicInteger();

	/** Engine processes started so far. */
	public final AtomicInteger started = new AtomicInteger();

	private final List<Process> processes = new java.util.concurrent.CopyOnWriteArrayList<>();

	/** Ends every engine process started so far, as if they had all crashed. */
	public void killAll() {
		this.processes.forEach(Process::destroy);
	}

	public void reset() {
		this.behaviour = Behaviour.NORMAL;
		this.score = 20;
	}

	public StockfishEngineAdapter.Launcher launcher() {
		return () -> {
			if (this.behaviour == Behaviour.MISSING) {
				throw new EngineException(EngineException.Kind.UNAVAILABLE, "No engine binary (test)");
			}
			this.started.incrementAndGet();
			Process process = new Process();
			this.processes.add(process);
			return process;
		};
	}

	private final class Process implements UciProcess {

		private final BlockingQueue<String> output = new LinkedBlockingQueue<>();

		private volatile boolean alive = true;

		private volatile Position position = Position.initial();

		private volatile int multiPv = 1;

		@Override
		public void send(String command) {
			if (!this.alive) {
				throw new EngineException(EngineException.Kind.CRASHED, "gone");
			}
			if (command.equals("uci")) {
				this.output.addAll(List.of("id name FakeFish 1", "uciok"));
			}
			else if (command.equals("isready")) {
				this.output.add("readyok");
			}
			else if (command.startsWith("setoption name MultiPV value ")) {
				this.multiPv = Integer.parseInt(command.substring("setoption name MultiPV value ".length()));
			}
			else if (command.startsWith("position ")) {
				this.position = parse(command);
			}
			else if (command.startsWith("go")) {
				search();
			}
		}

		private void search() {
			if (FakeStockfish.this.behaviour == Behaviour.CRASH) {
				this.alive = false;
				return;
			}
			FakeStockfish.this.searches.incrementAndGet();
			List<Move> legal = this.position.legalMoves();
			if (legal.isEmpty()) {
				this.output.add(this.position.inCheck() ? "info depth 0 score mate 0" : "info depth 0 score cp 0");
				this.output.add("bestmove (none)");
				return;
			}
			if (FakeStockfish.this.behaviour == Behaviour.ILLEGAL_MOVE) {
				this.output.add("info depth 12 score cp 0 pv a1a1");
				this.output.add("bestmove h1h8");
				return;
			}
			List<Move> ordered = new ArrayList<>(legal);
			Move mate = legal.stream().filter((move) -> {
				Position after = this.position.play(move);
				return after.inCheck() && after.legalMoves().isEmpty();
			}).findFirst().orElse(null);
			if (mate != null) {
				ordered.remove(mate);
				ordered.add(0, mate);
			}
			int lines = Math.min(this.multiPv, ordered.size());
			for (int rank = 1; rank <= lines; rank++) {
				Move move = ordered.get(rank - 1);
				String score = (move == mate) ? "mate 1" : "cp " + (FakeStockfish.this.score - 10 * (rank - 1));
				Position after = this.position.play(move);
				String reply = after.legalMoves().isEmpty() ? "" : " " + after.legalMoves().get(0).uci();
				this.output.add("info depth 12 seldepth 14 multipv " + rank + " score " + score + " nodes 1000 time 3 pv "
						+ move.uci() + reply);
			}
			this.output.add("bestmove " + ordered.get(0).uci());
		}

		private Position parse(String command) {
			List<String> tokens = Arrays.asList(command.split(" "));
			int moves = tokens.indexOf("moves");
			Position start = tokens.get(1).equals("startpos") ? Position.initial()
					: Position.fromFen(String.join(" ", tokens.subList(2, (moves < 0) ? tokens.size() : moves)));
			if (moves >= 0) {
				for (String uci : tokens.subList(moves + 1, tokens.size())) {
					start = start.play(Move.parse(uci));
				}
			}
			return start;
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
		}

	}

}
