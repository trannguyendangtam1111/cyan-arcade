package com.cyan.arcade.chess;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.cyan.arcade.chess.stockfish.StockfishEngineAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;

/**
 * Wires Stockfish in: the binary to start and the bounded engine pool around it. Engines start on
 * first use, not with the application, so the arcade runs (without chess engine features) where
 * Stockfish is not installed; such a server says so in its log at startup, and every engine request
 * fails with {@code 503 ENGINE_UNAVAILABLE}.
 */
@Configuration
@EnableConfigurationProperties(ChessAiProperties.class)
class ChessAiConfig {

	private static final Logger log = LoggerFactory.getLogger(ChessAiConfig.class);

	private final ChessAiProperties properties;

	ChessAiConfig(ChessAiProperties properties) {
		this.properties = properties;
	}

	@Bean
	StockfishEngineAdapter.Launcher stockfishLauncher() {
		return StockfishEngineAdapter.binaryAt(enginePath());
	}

	private Path enginePath() {
		return enginePath(Path.of("").toAbsolutePath(), this.properties.engine().path());
	}

	/**
	 * The engine binary for the configured path. An absolute path is taken as it is. A relative one is
	 * meant from {@code backend/}, where {@code ./mvnw spring-boot:run} starts the application, but an
	 * IDE often starts it from the repository root: so a relative path that names no binary from the
	 * working directory is also looked for from its {@code backend/} directory. When neither has it,
	 * the path from the working directory, for the startup warning to name.
	 */
	static Path enginePath(Path workingDirectory, String configured) {
		Path path = Path.of(configured);
		if (path.isAbsolute()) {
			return path;
		}
		Path direct = workingDirectory.resolve(path).normalize();
		Path fromBackend = workingDirectory.resolve("backend").resolve(path).normalize();
		for (Path candidate : List.of(direct, fromBackend)) {
			if (Files.isRegularFile(StockfishEngineAdapter.resolve(candidate))) {
				return candidate;
			}
		}
		return direct;
	}

	@Bean(destroyMethod = "close")
	StockfishEngineAdapter stockfish(StockfishEngineAdapter.Launcher launcher) {
		ChessAiProperties.Engine engine = this.properties.engine();
		return new StockfishEngineAdapter(launcher, engine.poolSize(), engine.maxWaiting(), engine.threads(),
				engine.hashMb(), engine.acquireTimeout(), engine.readyTimeout(), engine.stopGrace());
	}

	@EventListener(ApplicationReadyEvent.class)
	void reportEngine() {
		Path binary = StockfishEngineAdapter.resolve(enginePath());
		if (Files.isRegularFile(binary)) {
			log.info("Chess engine: {} (up to {} processes, {} thread(s) and {} MB hash each)", binary.toAbsolutePath(),
					this.properties.engine().poolSize(), this.properties.engine().threads(),
					this.properties.engine().hashMb());
		}
		else {
			log.warn("Chess engine not found at {}: hints, games against Stockfish and analysis will answer 503. "
					+ "Set STOCKFISH_PATH, or run tools/stockfish/install.sh.", binary.toAbsolutePath());
		}
	}

}
