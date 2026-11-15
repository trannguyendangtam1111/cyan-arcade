package com.cyan.arcade.common.deployment;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;

class MemoryDiagnosticsTests {

	@TempDir
	Path root;

	@Test
	void readsUnifiedContainerUsageLimitPeakAndOomEvents() throws Exception {
		Files.writeString(this.root.resolve("memory.current"), "209715200\n");
		Files.writeString(this.root.resolve("memory.max"), "536870912\n");
		Files.writeString(this.root.resolve("memory.peak"), "314572800\n");
		Files.writeString(this.root.resolve("memory.events"), "low 0\noom 2\noom_kill 1\n");
		assertThat(MemoryDiagnostics.cgroup(this.root))
			.isEqualTo(new MemoryDiagnostics.Cgroup(209715200, 536870912, 314572800, 1));
	}

	@Test
	void fallsBackToV1WithoutConfusingMissingDataWithZeroUsage() throws Exception {
		Path memory = Files.createDirectory(this.root.resolve("memory"));
		Files.writeString(memory.resolve("memory.usage_in_bytes"), "209715200\n");
		Files.writeString(memory.resolve("memory.limit_in_bytes"), "536870912\n");
		Files.writeString(memory.resolve("memory.max_usage_in_bytes"), "314572800\n");
		assertThat(MemoryDiagnostics.cgroup(this.root))
			.isEqualTo(new MemoryDiagnostics.Cgroup(209715200, 536870912, 314572800, -1));
		assertThat(MemoryDiagnostics.number(this.root.resolve("missing"))).isEqualTo(-1);
	}

	@Test
	void parsesRssAndHandlesUnlimitedOrMalformedCounters() throws Exception {
		Path status = this.root.resolve("status");
		Files.writeString(status, "Name:\tstockfish\nVmRSS:\t123456 kB\nThreads:\t2\n");
		assertThat(MemoryDiagnostics.keyedNumber(status, "VmRSS:")).isEqualTo(123456);
		Files.writeString(this.root.resolve("memory.max"), "max\n");
		assertThat(MemoryDiagnostics.number(this.root.resolve("memory.max"))).isEqualTo(-1);
		Files.writeString(status, "VmRSS:\tunknown\n");
		assertThat(MemoryDiagnostics.keyedNumber(status, "VmRSS:")).isEqualTo(-1);
	}

}
