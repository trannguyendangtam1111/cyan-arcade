package com.cyan.arcade.common.deployment;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.BufferPoolMXBean;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Opt-in numeric-only diagnostics: no environment, request, account or connection details. */
@Component
@Profile("prod")
@ConditionalOnProperty(name = "app.memory.diagnostics-enabled", havingValue = "true")
class MemoryDiagnostics {

	private static final Logger log = LoggerFactory.getLogger(MemoryDiagnostics.class);

	record Cgroup(long used, long limit, long peak, long oomKills) {
	}

	@Scheduled(initialDelay = 10000, fixedDelay = 15000)
	void logMemory() {
		var memory = ManagementFactory.getMemoryMXBean();
		var heap = memory.getHeapMemoryUsage();
		long stockfishRssKiB = 0;
		int stockfishCount = 0;
		try (var descendants = ProcessHandle.current().descendants()) {
			for (ProcessHandle child : descendants.toList()) {
				Path status = Path.of("/proc", Long.toString(child.pid()), "status");
				try {
					if (Files.readString(status).startsWith("Name:\tstockfish")) {
						stockfishCount++;
						stockfishRssKiB += Math.max(0, keyedNumber(status, "VmRSS:"));
					}
				}
				catch (IOException | SecurityException ex) {
					// A child may exit between enumeration and reading.
				}
			}
		}
		long direct = ManagementFactory.getPlatformMXBeans(BufferPoolMXBean.class).stream()
			.filter((pool) -> pool.getName().equals("direct")).mapToLong(BufferPoolMXBean::getMemoryUsed).sum();
		Cgroup cgroup = cgroup(Path.of("/sys/fs/cgroup"));
		long rssKiB = keyedNumber(Path.of("/proc/self/status"), "VmRSS:");
		log.info("memory heapUsedMiB={} heapCommittedMiB={} heapMaxMiB={} nonHeapMiB={} directMiB={} cpus={} "
				+ "jvmRssMiB={} stockfishRssMiB={} stockfishProcesses={} javaThreads={} "
				+ "cgroupMiB={} cgroupLimitMiB={} cgroupPeakMiB={} cgroupOomKills={}",
				mib(heap.getUsed()), mib(heap.getCommitted()), mib(heap.getMax()),
				mib(memory.getNonHeapMemoryUsage().getUsed()), mib(direct), Runtime.getRuntime().availableProcessors(),
				rssKiB < 0 ? -1 : rssKiB / 1024,
				stockfishRssKiB / 1024, stockfishCount, ManagementFactory.getThreadMXBean().getThreadCount(),
				mib(cgroup.used()), mib(cgroup.limit()), mib(cgroup.peak()), cgroup.oomKills());
	}

	static Cgroup cgroup(Path root) {
		long used = number(root.resolve("memory.current"));
		if (used >= 0) {
			return new Cgroup(used, number(root.resolve("memory.max")), number(root.resolve("memory.peak")),
					keyedNumber(root.resolve("memory.events"), "oom_kill"));
		}
		Path memory = root.resolve("memory");
		return new Cgroup(number(memory.resolve("memory.usage_in_bytes")),
				number(memory.resolve("memory.limit_in_bytes")), number(memory.resolve("memory.max_usage_in_bytes")), -1);
	}

	static long number(Path path) {
		try {
			return Long.parseLong(Files.readString(path).trim());
		}
		catch (IOException | NumberFormatException | SecurityException ex) {
			return -1;
		}
	}

	static long keyedNumber(Path path, String key) {
		try {
			for (String line : Files.readAllLines(path)) {
				if (line.startsWith(key + " ") || line.startsWith(key + "\t")) {
					return Long.parseLong(line.substring(key.length()).trim().split("\\s+")[0]);
				}
			}
		}
		catch (IOException | NumberFormatException | SecurityException ex) {
			// Missing/unreadable procfs or cgroup files are reported as unavailable.
		}
		return -1;
	}

	private static long mib(long bytes) {
		return bytes < 0 ? -1 : bytes / (1024 * 1024);
	}

}
