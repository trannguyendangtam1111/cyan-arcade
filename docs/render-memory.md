# Render 512 MiB memory incident and verification

Reported incident: 2026-11-03, dashboard events at 15:06 and 15:15 exceeded 512 MB; recovery
was reported at 15:10 and 15:30. These events confirm container memory failure, not which
allocation caused it. Login sessions were held in memory then and ended with each restart; since V37 they are stored
in PostgreSQL and survive one.

## Findings

- The 160 MiB Java heap is only part of the budget. JVM metaspace, code cache, direct buffers,
  native threads/allocator, Stockfish processes and container-charged file/shared-memory cache
  also count. Stockfish Hash=8 limits its transposition table, not its NNUE network or total RSS.
- Production defaults already cap the pool at one Stockfish process/thread, Hikari at three
  connections, the analysis cache at 256 entries and the review worker/queue at one each.
  The pool semaphore bounds loans; this is not evidence of unlimited process creation.
- Confirmed code defects: the native stdout queue was unbounded; cleanup skipped readers/pipes
  when the child had already exited; force-kill was not awaited; continuous info output skipped
  search deadline checks. These were fixed, but are not proven causes of the production events.
- Confirmed retention behavior: a healthy idle engine stayed alive until application shutdown.
  Production now retires only unused engines after 60 seconds, checked every 30 seconds.
  A subsequent request starts it again. No active search or Chess feature is removed.
- A pool shutdown/start/return race was closed. Existing broken-engine replacement and bounded
  waiting behavior remain.
- Review results have no hard count cap; their 30-minute expiry is pruned when another review
  starts. Engine rate-limit account entries similarly prune quiet accounts on capacity checks.
  These are secondary heap-retention candidates under load, not established incident causes.
- Scheduled daily challenge generation and hourly abandoned-session cleanup do not create
  per-request executors. Review worker threads time out; no uncontrolled thread-pool growth
  was found in the inspected paths.

## Small resource changes

The image keeps Xms64m/Xmx160m and Serial GC; no smaller heap or speculative metaspace cap is
applied without measurements. It adds ActiveProcessorCount=1 and MALLOC_ARENA_MAX=2 to reduce
host-CPU-derived worker counts and glibc arena proliferation. Production Tomcat is capped at
12 workers instead of 24, with two spare threads. This reduces the maximum stack allocation
budget, not a guaranteed fixed RSS amount. Allocator contention and request latency must be checked.

Check effective settings after deployment. A Render JAVA_TOOL_OPTIONS value overrides the Docker
ENV default; old overrides will hide the new CPU flag. Use the complete option names:
-XX:ReservedCodeCacheSize=32m and -XX:MaxDirectMemorySize=16m. Literal -XX=32m/-XX=16m are invalid.
Confirm the active profile is prod and the existing startup engine log reports one process,
one engine thread and an 8 MiB hash. Do not copy development pool-size overrides to Render.

## Measure on Render without a shell or database changes

Set MEMORY_DIAGNOSTICS_ENABLED=true in Render for the measurement deployment. Leave ordinary
scheduling enabled. This opt-in component reuses Spring's scheduler; it opens no public metrics
endpoint, adds no service and logs no request, account, environment or connection values.

Every 15 seconds, a numeric memory line includes:
- heapUsedMiB, heapCommittedMiB, heapMaxMiB (expected maximum 160);
- nonHeapMiB, directMiB, effective cpus (expected 1) and javaThreads;
- jvmRssMiB from procfs, plus stockfishProcesses and stockfishRssMiB for descendant engines;
- cgroupMiB, cgroupLimitMiB, cgroupPeakMiB and cgroupOomKills.

Cgroup v2 memory.current/memory.max/memory.peak/memory.events are preferred; v1 usage/limit/peak
paths are a fallback. A value of -1 means unavailable/unlimited, not zero usage.
Child stats can be missed if procfs is restricted or a process exits during sampling.
These are samples: short bursts can occur between lines. Compare timestamps with Render's
memory graph and instance events. Confirm the cgroup scope/limit corresponds to this service;
if unavailable or different, use Render's container metric as authoritative.

Do not add JVM RSS to heap/nonheap: those values overlap. Do not treat summed process RSS as
container usage: shared mappings can be counted more than once. Use cgroup usage for the total,
and JVM/Stockfish readings for attribution. A historical cgroup peak does not fall after idle cleanup.

## Controlled post-deployment sequence

1. Deploy the reviewed commit with diagnostics enabled; keep admin seeding/imports disabled.
   Do not run a load test against public endpoints or create a diagnostic admin automatically.
2. Record idle startup and post-Flyway baseline, no chess engine requests yet. Note that first
   startup/migrations can peak before periodic diagnostics become available.
3. Using an existing authorized test account, request one ordinary hint, then an engine move,
   Coach Mode and a review separately. Record JVM RSS, Stockfish RSS, container peak and latency.
   Stop adding load if memory approaches the limit; a killed instance can lose the final sample.
4. End polling/reviews and wait about 90 seconds. Expect zero idle Stockfish processes and
   a release log. Repeat a hint to confirm restart works and authorization is still enforced.
   Process RSS should fall; charged/reclaimable file cache may not fall immediately.
5. Exercise the intended small demo concurrency, including normal API/session traffic during
   one engine search. Verify at most one effective engine, recovery after cancellation and no
   accumulating output-reader threads or native children. Never compare only post-GC Java heap.
6. Watch active use and idle for at least a representative demo session, then 24 hours. A practical
   target is sustained/peak container use well below the limit (for example around 400 MiB, leaving
   roughly 100 MiB headroom); this is an acceptance target, not a measured guarantee.
7. Turn MEMORY_DIAGNOSTICS_ENABLED=false after investigation if its logs are no longer needed.

If the JVM alone is high, inspect heap committed versus used, nonheap, direct buffers and threads
before changing Xmx. If one Stockfish process causes the jump, reducing an 8 MiB hash further
cannot remove NNUE memory. If child counts exceed one, verify active profile/overrides and lifecycle
logs first. If a single required search still exceeds the combined 512 MiB budget, this instance
is not feasible for the current engine/model under that workload. Discuss a smaller engine/model
or a different memory budget before changing features; do not disable AI silently.

Native Memory Tracking is optional, not enabled here. It adds overhead and measures JVM-managed
native memory, not the Stockfish child or the complete cgroup. The JRE image need not contain jcmd;
do not assume Render Free has shell access. For a separately authorized local container reproduction,
docker stats --no-stream and cgroup counters can complement JVM tools without connecting to production.

## Focused checks

~~~sh
cd backend
./mvnw -B -Dtest=EnginePoolTests,UciEngineTests,NativeUciProcessTests,MemoryDiagnosticsTests,ProductionDeploymentTests test
~~~

The engine/process tests use fakes, not a real Stockfish binary. Cgroup tests use temporary files,
not production counters. Compilation/tests do not establish Linux/Render RSS or startup latency.

References: [Stockfish source](https://github.com/official-stockfish/Stockfish/tree/sf_19),
[JDK 21 memory tracking](https://docs.oracle.com/en/java/javase/21/vm/native-memory-tracking.html),
[Render Free](https://render.com/docs/free).
