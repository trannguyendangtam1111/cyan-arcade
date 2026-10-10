package com.cyan.arcade.chess;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Where the backend looks for the Stockfish binary: the default path is meant from {@code backend/},
 * whether the application was started there or, as IDEs do, from the repository root.
 */
class EnginePathTests {

	private static final String DEFAULT = "../tools/stockfish/dist/stockfish";

	@TempDir
	Path repository;

	@Test
	void theDefaultIsFoundFromTheBackendDirectory() throws IOException {
		Path binary = install("stockfish");
		Path backend = Files.createDirectories(this.repository.resolve("backend"));

		assertThat(ChessAiConfig.enginePath(backend, DEFAULT)).isEqualTo(binary);
	}

	@Test
	void theDefaultIsFoundFromTheRepositoryRootToo() throws IOException {
		Path binary = install("stockfish");
		Files.createDirectories(this.repository.resolve("backend"));

		assertThat(ChessAiConfig.enginePath(this.repository, DEFAULT)).isEqualTo(binary);
	}

	@Test
	void aWindowsBinaryIsFoundWithoutItsExtension() throws IOException {
		install("stockfish.exe");
		Files.createDirectories(this.repository.resolve("backend"));

		assertThat(ChessAiConfig.enginePath(this.repository, DEFAULT))
			.isEqualTo(this.repository.resolve("tools/stockfish/dist/stockfish"));
	}

	@Test
	void aPathFromTheWorkingDirectoryComesFirst() throws IOException {
		Path here = install("stockfish");
		Path elsewhere = this.repository.resolve("backend/tools/stockfish/dist/stockfish");
		Files.createDirectories(elsewhere.getParent());
		Files.writeString(elsewhere, "binary");

		assertThat(ChessAiConfig.enginePath(this.repository, "tools/stockfish/dist/stockfish")).isEqualTo(here);
	}

	@Test
	void withoutABinaryThePathFromTheWorkingDirectoryIsNamed() {
		assertThat(ChessAiConfig.enginePath(this.repository, DEFAULT))
			.isEqualTo(this.repository.resolve(DEFAULT).normalize());
	}

	@Test
	void anAbsolutePathIsTakenAsItIs() {
		Path absolute = this.repository.resolve("opt/stockfish/stockfish").toAbsolutePath();

		assertThat(ChessAiConfig.enginePath(this.repository, absolute.toString())).isEqualTo(absolute);
	}

	private Path install(String name) throws IOException {
		Path binary = this.repository.resolve("tools/stockfish/dist").resolve(name);
		Files.createDirectories(binary.getParent());
		Files.writeString(binary, "binary");
		return binary;
	}

}
