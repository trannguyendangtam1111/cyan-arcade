# PLATFORM-008 — Database migration and recovery rehearsal (V27 → V38)

**PASS for the isolated migration and recovery rehearsal. Public release remains NO-GO; deployment is postponed and Yu-Gi-Oh! remains disabled/hidden.** No migration or write was issued against the source database or Neon.

Completed 2026-11-14 (Asia/Bangkok), branch `release/cyan-arcade-v2`, resumed from `ccf0359`. That commit recorded the missing-backup blocker; this report supersedes its BLOCKED disposition after explicit user authorization. See [PLATFORM-007](platform-007-release-consolidation.md), the [operations runbook](tcg-010-operations.md) and [sanitized evidence](acceptance/platform-008/evidence.json).

## Authorization, backup and isolation

The user explicitly authorized read-only preflight and a consistent backup of **`127.0.0.1:5435/cyan_arcade`**, a new protected directory under `C:\dev\GameHub-backups`, and continued rehearsal only on disposable restored copies. No source writes/migrations, Neon, deployment, merge or push were authorized.

- Docker Linux engine: **29.8.1**. The exact source container's port mapping identified the approved endpoint; its internal loopback client was used. Preflight confirmed database `cyan_arcade`, PostgreSQL **18.6**, successful Flyway **V1–V27**, and `transaction_read_only=on`.
- **pg_dump 18.6**, custom format, compression level 6, consistent logical snapshot, five-second lock-wait limit. `PGOPTIONS` enforced read-only source transactions and bounded waits. Passwords were reused internally without printing them. Source access ended after backup creation.
- Retained directory: **`C:\dev\GameHub-backups\PLATFORM-008-20261114-125856`**. ACL inheritance is disabled; only the acting Windows user and SYSTEM have access. No existing backup was overwritten.
- Archive: `development-v27.dump`, **493,824 bytes / 215 archive entries**. SHA-256, reverified after restores and at cleanup:

  `7951BE05317B64E8DC289D0888CCCB6F4B8EEABCBA77573A63E4415F3926CCC8`

- Archive listing succeeded, followed by **two full `pg_restore --exit-on-error` restores**. Restoration and subsequent data/application checks provide stronger evidence than listing alone.

| Environment | PostgreSQL / HTTP | Data and application |
| --- | --- | --- |
| Upgrade | `127.0.0.1:55441/platform008_upgrade` / `8101` | `platform008-upgrade-20261114`; full V27 archive, then clean artifact from `ccf0359` (production code unchanged from `70c2fd9`), Flyway target 38 |
| Recovery | `127.0.0.1:55442/platform008_recovery` / `8102` | `platform008-recovery-20261114`; same original archive, clean application from `4798d0f`, Flyway target 27 |

Both used PostgreSQL **18.6** (`postgres:18-alpine`), label `com.cyan.task=platform008-20261114`, separate tmpfs storage and disposable credentials. Only the archive was mounted read-only. Datasources were explicit, without development/Neon fallback. Imports, admin seeding, scheduled mutations and JDBC cleanup cron were disabled. Yu-Gi-Oh! source/activation gates stayed false; no pilot import/activation occurred.

Restores deliberately used **`--no-owner --no-acl`**, assigning objects to the disposable role. Source ownership metadata was retained privately. This validates schema/data recovery and application behavior under mapped ownership, **not exact source grant restoration or production least-privilege settings**.

## Baseline and preservation

The first restore contained **30 public tables / 19,796 rows**, including Flyway history. Before application startup or probe writes, canonical SHA-256 row aggregates, counts, sequences, schema definitions and foreign-key orphan checks were recorded. Committed evidence contains aggregates/digests, not personal rows, passwords or cookies.

| Existing data | V27 baseline | Immediately after V38 migration |
| --- | ---: | ---: |
| Users / profiles | 55 users | 55, original fields preserved |
| Wallets / ledger | 29 / 217 rows | Same; balances and ledger net both **12,750**, zero negative/unreconciled wallets |
| Purchases / inventory | 12 / 17 | Same |
| TCG games / sets / packs | 2 / 46 / 46 | Same |
| TCG cards / pools / odds | 7,802 / 7,802 / 854 | Same |
| Collections / openings / opening cards / replay rows | 587 / 120 / 1,173 / 6 | Same |
| Game sessions / scores | 101 / 101 | Same, original fields preserved |
| Achievements | 88 | Same |
| Challenges / completions / progress | 372 / 38 / 8 | Same |
| Sudoku runs / daily puzzles; Word Guess runs; Chess matches | 11 / 4; 17; 134 | Same |
| Foreign-key checks / orphan rows | 44 / 0 | 50 / 0 |

Pokémon retained **4,779 cards / 26 sets / 26 packs**; One Piece retained **3,023 / 20 / 20**. These are real restored catalogs, rather than TCG-009's small fixtures.

All **29 pre-existing business tables** retained counts and canonical hashes of original columns. Only Flyway history changed among the 30 original tables. All sequence values were unchanged. Score/session hashing excluded new `mode` and `result_snapshot` columns; defaults/nulls were checked separately. Original profile fields, catalog IDs, inventory quantities, opening snapshots, scores and rewards were preserved. No unexpected conversion, deletion or partial migration was found.

## Migration results and expected differences

Flyway validated all 38 migration checksums, started at V27 and applied **V28–V38 in order, all successful**. V1–V27 history/checksums remained identical. Hibernate validation and release startup succeeded. Startup took **23.874 seconds**; recorded SQL execution times sum to **390 ms**, not a production downtime estimate.

| Migration | Execution ms | Verified effect |
| --- | ---: | --- |
| V28 | 51 | All 101 old scores and 101 sessions read `classic`; defaults/non-null checks installed |
| V29 | 23 | Mode leaderboard index installed |
| V30 | 60 | Daily Board tables created |
| V31 | 70 | Legacy archive/shared-layout schema installed; active/archive tables empty for this direct V27 upgrade |
| V32 | 15 | Daily reward columns/check installed |
| V33 | 18 | Ranked Sudoku Daily-date index installed |
| V34 | 30 | ARCHIVE mode and unranked/session constraints installed; old runs preserved |
| V35 | 29 | Notes table, FK, format/revision checks installed |
| V36 | 20 | All 101 historical score snapshots remain null |
| V37 | 52 | JDBC session tables/indexes installed; real persistence exercised |
| V38 | 22 | Card images nullable; all existing images preserved; nonblank/thumbnail guards installed |

At the migration boundary: **37 tables / 19,807 rows**; seven new tables empty; Flyway history 27→38; indexes **85→102**; PostgreSQL constraint catalog entries **366→463**. All original indexes remained. Expected constraint changes were V34 widening and V38 image NOT NULL removal; other original definitions remained. All constraints/indexes were validated/ready. No SQL file was edited, repaired, baselined or reversed.

V31's populated-V30 archive branch is outside this genuine V27 dataset: those tables did not exist before upgrade. That is a coverage boundary, not lost data. Schema migration did not import or activate any franchise.

## Application, API and focused tests

**63 real API/restart checks passed**, without mocks or provider requests:

- Both versions: health, ten-game catalog, Classic leaderboard, daily challenges, Pokémon/One Piece catalogs, packs by set and representative pack details.
- Restored USER: authentication, own profile, wallet/transactions, inventory, collections, opening/game history, achievements, challenges and allowance APIs. Wallet, collection and opening values agreed with database aggregates.
- Selected TCG/economy responses matched V27/V38; no additive-field exception was needed in these comparisons.
- A V38 cookie survived a real process restart; wallet/collection values persisted. CSRF-protected logout removed JDBC authentication/session storage.
- Yu-Gi-Oh! was absent in both databases and returned public **404**.

After preservation snapshots, the harness intentionally replaced **one existing USER password in each disposable copy** with a temporary test credential, avoiding collection/reuse of a person's password. Session rows were the other planned probe writes; logout removed the V38 session. No users, packs, purchases, scores or rewards were created. Post-smoke hashes found no business-table changes beyond the documented password replacement.

| Focused JUnit execution | PASS | FAIL | ERRORS | SKIPPED |
| --- | ---: | ---: | ---: | ---: |
| Initial architecture, score-session and JDBC-session classes | 47 | 1 | 0 | 0 |
| Intermediate session retry using unchanged snapshot | 8 | 1 | 0 | 0 |
| Corrected JDBC-session class only | 9 | 0 | 0 | 0 |
| **Final unique cases: architecture 22 + score 17 + persistence 9** | **48** | **0 unresolved** | **0** | **0** |

There were **66 invocations: 64 passes / 2 failures**, both failures the same stale assertion before correction. This was not one clean 48-test execution. No full backend/frontend suite ran. Testcontainers databases were disposable, with an explicitly unusable fallback datasource at loopback port 1.

The verified test defect expected the latest Flyway version to equal `37`, although setup correctly reached V38. `PersistentSessionTests` now asserts successful V37 installation and no pending migrations, retaining session-schema/data checks while permitting later legitimate migrations. Its corrected nine cases passed. No production-code or historical-migration fix was needed.

Temporary harness corrections included binary-file creation, a wrong snapshot-copy working directory (causing the intermediate stale test retry), V38's intended NOT NULL removal, the actual pack/set relationship/required parameter, and the required `{bcrypt}` prefix. Invalid harness requests produced diagnostic 400/500 responses before correction; they are not included among successful API checks or treated as migration failures.

## Recovery

**PASS.** The accepted archive restored independently in **1.230 seconds**; first restore **0.735 seconds** (restore-command timings only). All **30 V27 table counts/hashes**, sequence values and Flyway history matched the original restored baseline exactly; **44 FK checks / zero orphans**. Recovery did not reverse migrations.

The clean **`4798d0f` V27 application** validated 27 migrations, reported V27 up to date with no migration necessary, passed Hibernate validation, started and served the API checks. History remained V27 afterward. **The V38 application never ran against recovered V27.** Copy-only credential changes occurred after recovery integrity snapshots.

## Cleanup, risks and next step

Both task applications and labelled containers/tmpfs stores were removed. All **seven** recorded Testcontainers/reaper IDs were absent; ports **55441, 55442, 8101, 8102** closed. The exact `backend/target/platform-008` directory was checked for path identity/reparse points and removed. Temporary disposable credentials/cookies were deleted. The approved protected archive, manifests, aggregate snapshots and raw logs are intentionally retained; sanitized evidence is committed.

All six unrelated files retained starting hashes: `SudokuService.java`, `ModeLab.java`, `useScoreSubmission.test.ts`, `useScoreSubmission.ts`, `LeaderboardModes.test.tsx`, untracked `ROADMAP.md`. V1–V38 are unchanged. No source write/migration, Neon access, activation, merge, push or deployment occurred. This does not claim that independent activity on the running source stopped; task source operations were read-only.

Remaining risks and warnings:

- Disposable startup warned that the Daily Board secret was unset; no boards were generated. A real target needs a stable configured secret. Stockfish was unavailable in isolated builds; engine endpoints were outside migration smoke scope.
- Exact role/grant recovery, target permissions, retention, recovery objectives, maintenance boundaries and reconciliation of later writes still require operational approval. Restoring this archive can lose post-backup writes.
- Local timings do not establish hosted downtime, capacity, concurrent-writer behavior or a recovery SLA. Hosted resource/security acceptance and product/content decisions remain outstanding.

**Final disposition:** backup/restore, V27→V38 preservation, **11 schema checks / 63 real API-restart checks / 48 unique focused tests**, and V27 recovery **PASS**, with **0 unresolved failures / 0 blocked execution checks**. The rehearsal blocker is closed for this backup and these artifacts. Public release remains **NO-GO** pending product/content, clean-candidate CI and operational gates. **Next step:** prepare the clean main-integration candidate and revision-bound normal PR checks, preserving unrelated changes and keeping deployment/Yu-Gi-Oh! postponed.
