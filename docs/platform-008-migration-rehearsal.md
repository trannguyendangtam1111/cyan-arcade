# PLATFORM-008 — Database migration and recovery rehearsal (V27 → V38)

Date: 2026-11-14. Branch: `release/cyan-arcade-v2`. Starting HEAD: `56bec80` (expected values match).

**Result: BLOCKED before database access.** No authorized real-data V27 PostgreSQL backup was identified. No restore, migration, data comparison, application startup or recovery was attempted. This is a missing prerequisite, not a migration failure. Public release remains **NO-GO** and deployment remains postponed.

## Preparation and backup authorization

- Read [PLATFORM-007](platform-007-release-consolidation.md) and the [migration/operations runbook](tcg-010-operations.md). The existing reports explicitly leave restored V27-data acceptance outstanding; fresh V38 test databases do not replace it.
- Docker Linux engine verified: `docker info --format '{{.OSType}}|{{.ServerVersion}}'` returned **`linux|29.8.1`**. Initial sandbox named-pipe access was denied; the same read-only check succeeded with sandbox escalation. Docker is not the blocker.
- Reviewed repository database configuration without connecting. Native configuration defaults to `localhost:5435/cyan_arcade`; local `.env` also specifies `DB_PORT=5435`. Compose defaults to port 5433 and permits overrides, so its defaults must not be mistaken for a verified source identity. Hibernate uses `ddl-auto: validate`; Flyway runs at application startup. Yu-Gi-Oh! source and activation defaults are false.
- Searched the workspace and `C:\dev\GameHub-backups` for dump/backup artifacts and authorization records. The existing `DEPLOY-002-20261110-5f5d367c` directory contains a **source-file backup**, confirmed by its `RECOVERY.md` and file manifest. It is not a PostgreSQL snapshot. No authorized `.dump`, `.backup`, `.pgdump` or `.sql.gz` input was found there. This is a bounded search, not a claim about every disk or external backup system.
- No source backup authorization or database access permission was inferred from earlier disposable Testcontainers acceptance. The current instruction explicitly requires stopping if an authorized V27 input is absent.

**Backup source: none accepted. Authorization: absent for original-database access/dump.** Its V27 state remains user-reported, not independently queried. An owner may instead supply an existing backup with explicit permission, origin, capture time, PostgreSQL version and SHA-256, avoiding any source access by this task.

## Exact status and evidence boundaries

| Gate | PASS | FAIL | BLOCKED | Evidence / reason |
| --- | ---: | ---: | ---: | --- |
| Expected branch and HEAD | 1 | 0 | 0 | Local Git inspection |
| Docker Linux engine | 1 | 0 | 0 | `linux\|29.8.1` |
| Static configuration and runbook review | 1 | 0 | 0 | Explicit datasource isolation required; startup invokes Flyway |
| Authorized real V27 backup | 0 | 0 | 1 | No accepted input or source-access authorization |
| Restore and baseline | 0 | 0 | 1 | Depends on backup |
| V28–V38 migration execution | 0 | 0 | 1 | Depends on restored baseline |
| Post-migration integrity / API comparisons | 0 | 0 | 1 | No before/after databases |
| Second restore and V27 application recovery | 0 | 0 | 1 | No accepted backup/recovery instance |
| Focused migration/persistence/architecture checks | 0 | 0 | 1 | Execution stopped at prerequisite gate |
| **Total gate dispositions** | **3** | **0** | **6** | These are gates, not test cases |

**Tests executed: 0. Migrations executed: 0 of 11 pending versions.** V28–V38 ordering, checksums, constraints/indexes, defaults, conversions and runtime compatibility have no new execution result from this task. No claim of a successful or failed upgrade is made.

Users/profiles, wallet/ledger, inventory/purchases, TCG cards/sets/packs, collections/openings, scores/achievements/challenges, Pokémon/One Piece catalogs, table counts/digests, Flyway history and referential integrity are all **unmeasured**. No personal records or credentials were collected. Expected changes remain those listed in PLATFORM-007: Classic defaults, new daily/notes/session structures, nullable historical score snapshots and nullable card images. V31's archive handling must be accounted for if applicable; legitimate schema changes do not require byte-identical whole-table snapshots.

## Proposed backup procedure — approval required, not executed

Requested scope is **read-only source preflight and one consistent database backup**, plus local backup files. No migration, import, activation, source restore, source write or Neon access. Confirm the actual source is the development database at **127.0.0.1:5435 / `cyan_arcade`** before approving; this candidate identity comes from configuration, not a live connection. Do not substitute a different endpoint silently.

Use approved PostgreSQL 18 client binaries and an owner-approved database role. Keep the backup outside Git in a new access-controlled `C:\dev\GameHub-backups\PLATFORM-008-<timestamp>` directory. Passwords are entered interactively, never placed in commands, URLs, committed files or logs. Record the acting owner's approval and retention policy separately.

The following PowerShell procedure is for execution **only after that approval**:

```powershell
$ErrorActionPreference = 'Stop'
$sourceHost = '127.0.0.1'
$sourcePort = '5435'
$sourceDatabase = 'cyan_arcade' # Owner must confirm before execution.
$sourceRole = Read-Host 'Approved source database role'
$backupDirectory = Join-Path 'C:\dev\GameHub-backups' (
    'PLATFORM-008-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
# Restrict this directory to the approved owner/backup operators before continuing.
# Confirm psql/pg_dump/pg_restore are the approved PostgreSQL 18 clients.
psql --version
pg_dump --version
pg_restore --version
```

First save private source metadata, using only read-only SQL:

```powershell
$preflightSql = @'
BEGIN READ ONLY;
SELECT current_database(), current_user, version();
SELECT installed_rank, version, description, checksum, success
FROM public.flyway_schema_history ORDER BY installed_rank;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT schemaname, tableowner, count(*) AS tables
FROM pg_tables WHERE schemaname = 'public'
GROUP BY schemaname, tableowner ORDER BY tableowner;
SELECT grantee, privilege_type, count(*) AS grants
FROM information_schema.table_privileges WHERE table_schema = 'public'
GROUP BY grantee, privilege_type ORDER BY grantee, privilege_type;
COMMIT;
'@
psql -X --host=$sourceHost --port=$sourcePort --dbname=$sourceDatabase `
    --username=$sourceRole --password --set=ON_ERROR_STOP=1 `
    --output=(Join-Path $backupDirectory 'source-metadata.txt') `
    --command=$preflightSql
if ($LASTEXITCODE -ne 0) { throw 'Source preflight failed; stop.' }
```

**Stop for owner review here:** require the approved identity, successful history exactly through V27 with no failed/unexpected entries, and compatible PostgreSQL/client versions. Capture ownership/permissions needed by restore; do not dump role password hashes. If the source has moved beyond V27, stop and obtain a genuine authorized V27 snapshot. Do not manufacture one with down migrations or an empty schema.

Once that review passes, make the full database custom-format dump:

```powershell
$dumpPath = Join-Path $backupDirectory 'development-v27.dump'
pg_dump --host=$sourceHost --port=$sourcePort --dbname=$sourceDatabase `
    --username=$sourceRole --password --format=custom --compress=6 `
    --lock-wait-timeout=5s --file=$dumpPath
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not accept partial output.' }
pg_restore --list --file=(Join-Path $backupDirectory 'archive-list.txt') $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'Archive inspection failed; stop.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath |
    Format-List | Out-File (Join-Path $backupDirectory 'backup-sha256.txt')
```

`pg_dump` takes a consistent logical snapshot and read locks; the lock-wait limit avoids waiting indefinitely on a conflicting DDL lock. Do not start/stop services or quiesce writers without separate approval. Coordinate an owner-approved window without concurrent schema changes. Baseline comparisons will use the restored snapshot, not a moving live database. Record capture start/end, tool/server versions, backup size/hash, authorization and protected storage location. Archive listing proves readability only; actual restore remains necessary. Keep metadata private; publish only sanitized aggregates/digests. Retain the backup rather than treating it as disposable cleanup.

## Resume contract after an input is approved

1. Create only task-labelled disposable resources with unique credentials/storage and an unused loopback port (proposed 55441, availability not checked). Use explicit `DB_URL`/credentials for every process, no inherited defaults, no original/Neon connection. No such resources exist yet.
2. Restore the full archive, deliberately map owner/role privileges, and capture the Phase 2 baseline on this copy. Record any privilege mapping rather than claiming an identical security environment.
3. Apply unmodified V28–V38 from the pinned release candidate to this copy only; keep imports, seeding and scheduled mutations disabled during comparisons. Record migration logs, checksums/order, locks/durations, schema validation and expected row/column differences. Verify existing data with bounded real APIs. Keep Yu-Gi-Oh! gates false and visibility hidden; no pilot import/activation is required.
4. Restore the same accepted backup again into a separate disposable recovery instance. Compare it with the first V27 baseline, including referential integrity and aggregates. Use a separately built, clean V27-compatible application artifact; local main `4798d0f` contains V1–V27 and is a candidate subject to schema/artifact verification. Never run the V38 application against this recovered V27 instance; do not reverse migrations.
5. Run only relevant persistence/migration and architecture checks, report exact results, then remove only task-created containers/processes/storage. Preserve the accepted backup, evidence and unrelated files. A restored-data failure may justify a focused application fix, never an edit to historical V1–V38 SQL.

## Cleanup, preservation and recommendation

No disposable container, database, server process or temporary backup was created, so no resource cleanup was necessary. Original development database and Neon were not connected to or modified. No historical migration or application file changed. The five pre-existing tracked modifications and untracked `ROADMAP.md` retained their starting hashes; only this report is staged for the task commit. No tests/full suites, merge, push or deployment occurred. Pilot settings were not changed; its stored visibility was not queried.

**Remaining blockers:** an authorized real V27 backup (or explicit approval for the procedure above), verified source provenance/history, actual upgrade/preservation evidence and actual recovery/startup evidence. **Next step:** approve the narrowly scoped source backup procedure or identify an existing authorized V27 backup, then resume PLATFORM-008. Do not advance to deployment or classify this blocked rehearsal as release approval.
