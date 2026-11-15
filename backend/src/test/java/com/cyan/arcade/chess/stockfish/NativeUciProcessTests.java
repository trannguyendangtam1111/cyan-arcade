package com.cyan.arcade.chess.stockfish;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import static org.assertj.core.api.Assertions.assertThat;

/** No native binary: exercise the real queue, reader and teardown around a stub Process. */
@Timeout(5)
class NativeUciProcessTests {

	@Test
	void outputIsBoundedAndClosingStopsAProducerBlockedOnCapacity() throws Exception {
		StubProcess child = new StubProcess("info depth 1 score cp 0 pv e2e4\n".repeat(2000));
		NativeUciProcess process = new NativeUciProcess(child);
		try {
			long deadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
			while (process.pendingLines() < NativeUciProcess.MAX_PENDING_LINES && System.nanoTime() < deadline) {
				Thread.sleep(5);
			}
			assertThat(process.pendingLines()).isEqualTo(NativeUciProcess.MAX_PENDING_LINES);
		}
		finally {
			process.destroy();
		}
		assertThat(process.readerAlive()).isFalse();
		assertThat(child.alive).isFalse();
		assertThat(child.forced).isTrue();
		assertThat(child.waitedAfterForce).isTrue();
		assertThat(child.inputClosed).isTrue();
		assertThat(process.pendingLines()).isLessThanOrEqualTo(1);
	}

	@Test
	void alreadyExitedChildrenStillHaveTheirReaderAndStreamsCleanedUp() {
		StubProcess child = new StubProcess("info depth 1\n".repeat(2000));
		child.alive = false;
		NativeUciProcess process = new NativeUciProcess(child);
		process.destroy();
		process.destroy();
		assertThat(process.readerAlive()).isFalse();
		assertThat(child.inputClosed).isTrue();
	}

	@Test
	void cleanupPreservesTheCallersInterruptedStatus() {
		StubProcess child = new StubProcess("");
		NativeUciProcess process = new NativeUciProcess(child);
		Thread.currentThread().interrupt();
		try {
			process.destroy();
			assertThat(Thread.currentThread().isInterrupted()).isTrue();
			assertThat(child.waitedAfterForce).isTrue();
		}
		finally {
			Thread.interrupted();
		}
	}

	private static class StubProcess extends Process {
		private final InputStream output;
		private boolean alive = true;
		private boolean forced;
		private boolean waitedAfterForce;
		private boolean inputClosed;

		StubProcess(String lines) {
			this.output = new ByteArrayInputStream(lines.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
		}

		@Override
		public OutputStream getOutputStream() {
			return new ByteArrayOutputStream() {
				@Override
				public void close() {
					StubProcess.this.inputClosed = true;
				}
			};
		}

		@Override
		public InputStream getInputStream() {
			return this.output;
		}

		@Override
		public InputStream getErrorStream() {
			return InputStream.nullInputStream();
		}

		@Override
		public int waitFor() {
			this.alive = false;
			return 0;
		}

		@Override
		public boolean waitFor(long timeout, TimeUnit unit) {
			if (this.forced) {
				this.waitedAfterForce = true;
				this.alive = false;
			}
			return !this.alive;
		}

		@Override
		public int exitValue() {
			if (this.alive) throw new IllegalThreadStateException();
			return 0;
		}

		@Override
		public void destroy() {
			this.alive = false;
		}

		@Override
		public Process destroyForcibly() {
			this.forced = true;
			return this;
		}

		@Override
		public boolean isAlive() {
			return this.alive;
		}
	}

}
