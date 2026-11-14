# TCG-009 — PostgreSQL integration and acceptance

Acceptance attempt: **2026-11-14 (Asia/Bangkok)**. Result: **blocked by Docker availability; database acceptance is incomplete**.

## Starting state and environment

- Workspace: `C:\dev\GameHub`.
- Branch: `release/cyan-arcade-v2`; starting HEAD: `2b60ca7`, matching the request.
- The index was empty. Existing uncommitted changes in `SudokuService.java`, `ModeLab.java`, `useScoreSubmission.test.ts`, `useScoreSubmission.ts`, `LeaderboardModes.test.tsx`, and untracked `ROADMAP.md` were preserved.
- Two focused Docker connectivity checks were made: the normal workspace check and one host-level check to rule out sandbox restrictions. Both failed because `npipe:////./pipe/dockerDesktopLinuxEngine` does not exist. The host-level service check reported `com.docker.service` **Stopped**.
- Docker's engine is unavailable. No disposable PostgreSQL container was started, so PostgreSQL availability and Flyway V38 execution were not established for this attempt. No alternative database was used or probed.
- No system software was installed or modified, and no service-start attempts or broad environment diagnostics were made.

## Exact PostgreSQL test disposition

The 50 cases from TCG-008 were located in the following existing test classes. Counts are the `@Test` methods in the source at the starting HEAD, not newly executed results.

| Test class | Passed | Failed | Skipped | Blocked |
| --- | ---: | ---: | ---: | ---: |
| `YugiohPilotImportTests` | 0 | 0 | 0 | 6 |
| `YugiohPackOpeningTests` | 0 | 0 | 0 | 5 |
| `TcgDatasetImportTests` | 0 | 0 | 0 | 12 |
| `PackOpeningApiTests` | 0 | 0 | 0 | 24 |
| `AdminPackOpeningTests` | 0 | 0 | 0 | 3 |
| **Total** | **0** | **0** | **0** | **50** |

**Zero PostgreSQL tests were executed in TCG-009.** The known missing engine was detected before running Maven; the earlier TCG-008 startup failures were not repeated or counted as new failures. “Blocked” is the acceptance disposition, not a JUnit skip result. Earlier unit tests and mocked frontend checks are not substitutes for these cases.

The existing `TestcontainersConfiguration` declares a fresh `postgres:18-alpine` container through Spring Boot's `@ServiceConnection`. This is the intended integration-test database boundary. It was inspected without starting an application or connecting to a datasource. No existing development connection settings were used as a fallback.

## Import and real API acceptance

All database-dependent acceptance work remains blocked:

| Required check | Result |
| --- | --- |
| Flyway through V38 | Not executed |
| Pokémon and One Piece baseline import and regression comparison | Not executed |
| Yu-Gi-Oh! dry-run, actual import, re-import and stable printing IDs | Not executed |
| Set/card/pack/pool/odds persistence and import rollback | Not executed |
| Nine-card openings through the real backend API | Not executed |
| Collection quantities and opening-history persistence | Not executed |
| Idempotent retries and concurrent duplicate requests | Not executed |
| Free/purchased allowance consumption and admin unlimited behavior | Not executed |
| Invalid/exhausted requests without partial writes; opening rollback | Not executed |
| Hidden defaults and disposable activation gates | Not executed |
| Re-import preserving player data and other franchises | Not executed |

No database row counts or import/opening outcomes were measured. The expected pilot dataset remains **one set, 127 printings representing 100 distinct cards, and one nine-card pack**, as documented in [TCG-008](tcg-008-pilot-pack.md); these are configuration/fixture expectations, not TCG-009 PostgreSQL observations.

## Database-backed browser acceptance

**Not executed: blocked by the unavailable disposable PostgreSQL/backend environment.** No frontend or backend was launched, no browser automation was attempted, and no API responses were intercepted or mocked in this task.

Consequently pack selection, nine-card reveal, text cards, rarity effects, collection/history updates, retry/error feedback, the Arcade Simulated Odds label, both themes and the 375px/1280px layouts remain unaccepted against a real database. The TCG-008 browser results remain explicitly fixture-backed and are not promoted to database-backed acceptance.

## Changes, cleanup and safety

This task adds only this acceptance report. No feature fixes were made because no integration assertions could run. No pack probabilities, application settings, migrations V1–V38, Pokémon/One Piece configurations, wallet balances, shop prices or allowances were changed. Yu-Gi-Oh! remains disabled by default and was not activated anywhere. No artwork was downloaded or hotlinked.

No container, application process, temporary file or local configuration override was created, so no runtime cleanup or configuration restoration was necessary. Existing TCG-008 evidence and other user files were left in place.

The original development database and Neon were **not connected to or modified**. Their contents and migration versions were not independently queried. Nothing was pushed, merged or deployed.

## Resume prerequisite and release recommendation

Restore Docker Desktop's Linux engine availability first. This task does not authorize installing or changing system software. Once `docker info` succeeds, resume TCG-009 using a fresh disposable PostgreSQL container with separate database credentials and a separate loopback port; verify the explicit JDBC target before launching applications. Do not reuse the original development database or Neon.

The focused integration command, from `backend`, is:

```powershell
.\mvnw.cmd -o '-Dtest=YugiohPilotImportTests,YugiohPackOpeningTests,TcgDatasetImportTests,PackOpeningApiTests,AdminPackOpeningTests' test
```

Then complete the real API and database-backed browser checks above, record actual row counts and outcomes before cleanup, and remove only resources created by that resumed task. Review whether any direct TCG correctness fixes are needed based on those results.

**Release recommendation: keep deployment postponed and the pilot hidden/disabled.** PostgreSQL persistence, transactions, allowances and real database-backed browser acceptance are still unverified. This report records a blocked acceptance attempt, not completion or release approval.
