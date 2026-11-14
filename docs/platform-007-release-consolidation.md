# PLATFORM-007 — Cyan Arcade release consolidation

Prepared 2026-11-14 from `release/cyan-arcade-v2` at `70c2fd9`.

**Recommendation: NO-GO for public release or deployment; GO for a restored-copy database rehearsal and release preparation.** The platform is an implemented release candidate, with focused acceptance evidence. Upgrading preserved V27 data, approving the public scope and validating the eventual hosting environment remain outstanding. Yu-Gi-Oh! stays disabled and hidden; its technical acceptance does not grant publication rights. Deployment remains postponed.

This investigation used Git metadata, documentation, migration SQL and existing results. No tests, applications, containers or database connections were started. No migration, activation or deployment was performed. This report is the only task change.

## 1. Git release inventory

| Item | Observed state before this report's commit |
| --- | --- |
| Branch / HEAD | Expected branch and HEAD match: `release/cyan-arcade-v2` / `70c2fd957c0af3b782011b444affd5da8eed04f9` |
| Comparison base | Local `main` = `4798d0f`; local `origin/main` also points there |
| Divergence | `git rev-list --left-right --count main...HEAD`: **0 main-only / 56 release-only commits**; merge base equals local main |
| Committed delta | **413 files; 48,077 insertions / 1,379 deletions**. Backend 204 files, frontend 188, docs 17, four root documents; includes tests, fixtures and evidence |
| Index / conflicts | Index initially empty; no unmerged entries. Local main is an ancestor, so no committed divergence conflict is indicated against that ref |
| Remote uncertainty | No fetch or remote CI inspection performed. Remote movement and the eventual PR's mergeability must be checked at merge preparation |

Major workstreams, without a source-by-source audit:

| Workstream | Representative commits / release delta |
| --- | --- |
| Modes and ranked play | `46cc014`: mode-aware scoring/boards, V28–V29; `3884f31`, `edc507b`, `1d9f59c`: 2048, Snake and Tetris modes |
| Daily games and Sudoku | `4dfc278`, `1bce055`, `9796c86`: shared Minesweeper Daily Board and rewards; Sudoku Daily/difficulty boards, history, archive and synchronized notes, V30–V35 |
| Recovery, sessions and profiles | `c130c4d`: committed score-result recovery, V36; `a56e7ba`: JDBC sessions, V37; Classic-only profile scope and mode-aware history |
| Chess and resource use | Match recovery/archive/PGN (`aae1d0c`, `6bde4c8`), bounded/idle Stockfish (`e888f1c`), lazy game routes and hosting memory controls |
| Platform UX and TCG | Achievement progress, challenge eligibility and purchase retry explanations; import reports/dry runs/incomplete-set holdbacks, One Piece EB-05, TCG-001–010 hidden Yu-Gi-Oh! pilot, V38 and guarded activation |

Unrelated local changes are **not part of the release commit inventory** and remain untouched:

- Modified: `backend/src/main/java/com/cyan/arcade/sudoku/SudokuService.java`, `backend/src/test/java/com/cyan/arcade/score/ModeLab.java`.
- Modified: `frontend/src/hooks/useScoreSubmission.test.ts`, `frontend/src/hooks/useScoreSubmission.ts`, `frontend/src/pages/LeaderboardModes.test.tsx`.
- Untracked: `ROADMAP.md`.

All five modified paths also occur in the committed branch delta. Their presence creates candidate-selection and checkout risks, not an observed Git merge conflict. The owner must decide their disposition separately; use a separate clean checkout for eventual merge verification. Do not sweep them into a release commit.

## 2. Feature readiness and evidence

**Candidate** means implemented and eligible for the approved release scope after shared gates below; it does not mean publicly approved. Test-file existence indicates coverage intent, not a newly observed passing run.

| Category | Implemented functionality | Existing evidence | Limitations / readiness |
| --- | --- | --- | --- |
| Ten games and modes | Snake, 2048, Tetris, Minesweeper, Flappy Bird, Brick Breaker, Dino Run, Word Guess, Sudoku, Chess. Snake maps/Adventure; 2048 timed/move-limit/puzzles; Tetris Ultra/Sprint/Challenge; timed Minesweeper and shared Daily Board; Sudoku Daily/practice/archive; local Chess, Coach, hints, archive/PGN | [README features](../README.md#games), game-engine/UI tests and mode/API tests; historical Sudoku candidate report: 22 PostgreSQL + 42 frontend passes [L1] | **Candidate.** Chess is unscored, without online multiplayer; stages/archive replays are unranked. Browser scores have consistency/timing checks, not complete input replay; automation remains possible |
| Authentication and profiles | USER/ADMIN sessions, bcrypt, CSRF, ownership checks, editable identity, public/private profile views; JDBC session persistence and logout/expiry | `AuthApiTests`, `PersistentSessionTests`, profile tests; historical session acceptance has 15 true check groups covering cookies, fixation, roles, CSRF, process restart and logout [L2] | **Candidate.** No password reset, role-management page or guest-score transfer. Rate-limit counters remain per instance; proxy trust must match hosting |
| Boards, XP, achievements, daily challenges | Mode/period boards, deterministic ranking, levels/rewards, measurable achievement progress, daily login/challenges, committed-result recovery; Classic-only profile statistics are labelled | `GameModesTests`, leaderboard/progression/challenge tests; historical recovery evidence records one score/reward set, duplicate refusal and owner-only result recovery [L3]; profile frontend logs: 38 passes and later 15 passes [L4] | **Candidate.** Classic progression eligibility differs from ranked-mode eligibility; not all achievements have measurable progress. Historical V36 rows have no reconstructed reward snapshot |
| Economy, inventory, shop | Transactional wallet/ledger, limited rewards, cosmetics/equipment, extra packs, audited admin grants, purchase request-ID deduplication and retry feedback | [README test/design entry points](../README.md#backend-engineering-challenges), `CoinLedgerTests`, `ShopApiTests`, inventory/shop UI tests; TCG-009 real purchase/extra-pack single-consumption and rollback checks | **Candidate for demo scope.** Rewards inherit browser-score trust limits; no real-money economy is established. No new whole-shop acceptance claimed here |
| Pokémon and One Piece TCG | Imported DB catalogs, simulator odds, atomic openings/collections/history, daily allowances, extras, request-key replay; import validation, reports, dry runs and set holdbacks | [TCG-009](tcg-009-acceptance.md): **50 PostgreSQL tests, 18 real API/DB checks, 7 real browser checks**, all pass, zero fail/skipped/blocked. Neighbour catalog digests and existing player rows preserved through pilot import/re-import | **Technical candidate, public-content scope requires approval.** Regression fixtures were only 2 Pokémon cards / 7 One Piece printings, not full production catalogs. Images depend on external hosts. Legacy keyless opening calls create new openings; replay retention has no automatic expiry |
| Yu-Gi-Oh! pilot | Text-only Beyond the Brave: 127 printings / 100 distinct cards / one nine-card pack; independent import and activation gates; ADMIN/CSRF, prerequisite validation, serialized import/visibility changes and reversible hiding | TCG-009 above; [TCG-010](tcg-010-release-preparation.md): **68 backend (including 22 architecture), 57 frontend, 4 real browser scenarios**, all pass, zero fail/skipped/blocked; TypeScript/focused lint pass | **HOLD — hidden/disabled.** No public approval or established metadata/card-text redistribution permission. Simulated independent slot odds are not official collation. Text-only presentation does not establish rights |
| Administration | Dashboard, audited economy actions, protected AI modes/analysis, explicit admin seeding, guarded pilot readiness/visibility API | `AdminAuthorizationTests`, `AdminEconomyTests`, role/seeder/skin tests; TCG-009 admin allowance checks; TCG-010 authorization/gate/CSRF cases | **Candidate with operator controls.** No general role-management UI. Provision credentials deliberately; no default admin. Pilot readiness cannot approve licensing or a release |

TCG counts above are separate historical runs with overlapping coverage; do not add them into a platform-wide test total. Durable TCG evidence is linked by the acceptance reports under `docs/acceptance/tcg-009` and `tcg-010`.

Other historical evidence inspected locally is **ignored build output, not portable committed release evidence**:

- **[L1]** `backend/target/deploy-003g/DEPLOY-003g-report.md`: candidate `2d830b2`, V1–V29 only; frontend build/typecheck/focused lint also passed. Its earlier V31 blocker is historical, not a current failure verdict.
- **[L2]** `backend/target/platform-003b/evidence.json`: session acceptance check groups.
- **[L3]** `backend/target/platform-002b/http-evidence.json` and `boundary-evidence.json`: score recovery, including a lost response and no repeated rewards.
- **[L4]** `backend/target/platform-004/tests.log`, `platform-004b/tests.log` and the latter's `browser-summary.json`: profile modes/Classic scope and responsive history.

The [backend CI workflow](../.github/workflows/backend-ci.yml) runs Maven `verify` for main pushes / PRs to main and uploads available reports. It does not run frontend verification. A green badge for main is not proof for `70c2fd9`; no current whole-platform CI result is certified here. The older [engineering summary](engineering-summary.md) is historical: its 207/464 counts and several debt statements are not current release totals/status.

## 3. Database status and safe rehearsal

The original development database is **reported V27**, not queried. Repository SQL extends through **V38: eleven pending migrations**. Fresh databases applied all 38 successfully in TCG-009; that proves fresh-schema execution, not preservation/upgrade of an existing V27 dataset. No restored-copy rehearsal evidence was found in the reviewed reports.

| Migration | Change and rehearsal focus |
| --- | --- |
| V28 | Adds non-null mode columns/default `classic` and identifier checks; verify every old score/session remains Classic and visible |
| V29 | Mode leaderboard index; measure build duration, lock wait and storage on representative restored rows |
| V30 | Minesweeper Daily Board/attempt tables, constraints/index; confirm expected empty baseline for a true V27 source |
| V31 | Exclusively locks daily tables, copies any V30 rows to legacy archives, asserts equality, removes copied active rows, then installs shared layouts. On a direct V27 upgrade these new tables should be empty; archive handling for pre-existing V30 rows is a separate case |
| V32 | Adds nullable Daily Board reward columns/check; verify reward-once semantics |
| V33 | Ranked Sudoku Daily-date index; check build cost and existing Daily results |
| V34 | Expands Sudoku mode constraints for unranked ARCHIVE runs; preserve official Daily/practice eligibility |
| V35 | Notes table, cascading run FK, format and revision checks; no backfill of browser-local notes |
| V36 | Nullable score result snapshot; old rows stay null, new commits support result recovery |
| V37 | JDBC session tables/indexes; existing in-memory logins end once at transition; verify new-cookie sessions survive restart and expire/logout correctly |
| V38 | Allows null card images with nonblank/thumbnail consistency checks; preserve existing image-backed cards. Does not import or activate Yu-Gi-Oh! |

Use the existing [controlled-release runbook](tcg-010-operations.md) for detail; the smallest **future, separately authorized** rehearsal is:

1. **Backup input:** an authorized database owner supplies a consistent V27 custom-format backup, checksum, capture time, PostgreSQL version, roles/permissions/extensions and matching old application artifact. Pause writers/jobs for a defined backup/cutover boundary; protect account/session data and retention. This task does not obtain a dump or connect to its source.
2. **Restore isolation:** restore into a newly named disposable PostgreSQL instance with separate credentials, storage and loopback port; explicitly pin every datasource and prohibit fallback to development/Neon. Record resolved target identity before application startup (which normally invokes Flyway). A dump listing alone is insufficient: demonstrate a working restore.
3. **Baseline on the copy:** inspect Flyway history/checksums through V27, failures and schema compatibility. Record counts/digests for users, scores/sessions, XP/achievements/challenges, wallets/ledger, inventory/purchases and TCG catalog/collections/openings/replays. Check representative balances, ownership, FKs, sequences and role permissions. No baseline/repair/clean to conceal drift.
4. **Upgrade only the copy:** use the pinned release artifact with Flyway target V38; disable startup imports, admin seeding and scheduled mutations during comparisons. Keep both Yu-Gi-Oh! gates off and game/pack hidden. Record each migration result/checksum, elapsed time, lock waits and disk use; require successful Flyway validation and Hibernate schema validation.
5. **Validate preserved behavior:** compare baseline rows/digests with documented expected additions/defaults. Exercise bounded real-API/browser checks for sign-in/restart/logout, Classic and mode boards, daily games, notes, score-result recovery, purchase/pack retry and rollback, existing Pokémon/One Piece collection/history. Validate V31 archive equality if rows actually exist. Reuse prior tests; rerun only cases needed for restored-data or newly discovered issues. Record exact pass/fail/blocked counts and resource identity.
6. **Prove recovery:** preserve failed-state evidence, discard only rehearsal resources, and restore the backup into a second clean recovery instance with the old matching app. Confirm baseline integrity and recovery time. Define acceptable downtime/data loss and reconciliation of writes made after backup. Do not invent down migrations or assume an older app is compatible with V38.

**Schema migration and feature activation are separate decisions.** V38 changes representation; imports change catalog content; activation changes visibility under a separate default-off gate. None authorizes the next. Hiding a pilot does not undo schema changes, imports or player transactions. No Yu-Gi-Oh! activation is needed for the platform migration rehearsal.

## 4. Release blockers and decisions

| Type | Open item / required exit evidence | Scope |
| --- | --- | --- |
| Technical | V27→V38 restored-data upgrade and recovery unproven; complete the rehearsal above | Mandatory before target upgrade/cutover |
| Technical | Final clean candidate has no consolidated, revision-bound verification record in this review; resolve ownership of dirty files, then record normal PR backend CI and frontend typecheck/lint/tests/build once | Mandatory before merge approval; no new broad audit |
| Operational | Deployment postponed; target, owner, maintenance window, secrets/admin provisioning, backup retention, recovery objectives, monitoring and rollback approval outstanding | Mandatory before deployment |
| Operational | Hosted TLS/session/CSRF/proxy/AI-asset authorization and real Stockfish/container memory limits need target acceptance; fake engine/process tests do not establish hosted RSS/latency ([memory notes](render-memory.md)) | Mandatory before public service, after deployment authorization |
| Product | Approve audience and demo scope, single-instance limits, score/economy trust and account-recovery limitations; choose whether to exclude external card content pending verification | Mandatory scope decision; password reset/full replay verification need not become this release's feature project |
| Product | Yu-Gi-Oh! audience, text-only experience, refresh/retention policy and import-job ownership undecided | Pilot only; keep excluded, no need to delay an independently approved arcade-only scope |
| Licensing / external | Yu-Gi-Oh! metadata/card-text redistribution, attribution and territories unverified; artwork/logos/backs/hosting uncleared | Pilot public release blocked; passing tests cannot clear it |
| Licensing / external | Confirm intended public Pokémon/One Piece data/image usage and applicable provider conditions; retain Stockfish notices/source obligations for distributed images | Public-content/distribution decision; repository notices are not a new legal clearance |

No new application defect was established by this focused planning review. Unverified items are not recorded as failed tests. Yu-Gi-Oh! public restrictions are separable from platform readiness if the approved release explicitly excludes it.

## 5. Highest-value portfolio documentation gaps

The [README](../README.md), [architecture](../ARCHITECTURE.md), [API](../API.md) and screenshots already explain substantial backend engineering. Preserve that foundation; do not replace it with a broad rewrite.

1. **Correct status drift first:** mark historical engineering results as dated; its in-memory-session, missing-rate-limit and CI recommendations have been superseded. Update the deployment guide's V1–V37 references for V38 and link the restored-data rehearsal instead of implying fresh startup proves upgrade safety.
2. **Add one short evidence map:** connect architecture/module rules, session/CSRF/ownership authorization, wallet and score transactions, pack/purchase idempotency/concurrency, and pure game engines to their existing tests and revision-bound results. Link portable TCG reports; retain selected older summaries if needed, without publishing raw account/cookie artifacts. Avoid a fixed aggregate test/coverage claim.
3. **Clarify the safe local path:** distinguish a new throwaway database from an existing V27 volume; prominently explain automatic Flyway startup and the destructive volume-reset example. Keep default-off imports/admin/pilot controls and optional Stockfish setup explicit.
4. **Refresh demonstration selectively:** existing desktop/mobile screenshots and capture scripts are valuable. Add a short reproducible local demo of sign-in → game result/retry → progression/shop → approved TCG collection, plus one modes/daily screenshot if stale. Use licensed or cleared content; hidden Yu-Gi-Oh! is not a public showcase commitment. A hosted demo/video is optional until deployment is authorized.

## 6. Smallest practical roadmap

| Priority | Work / completion condition | Mandatory or optional |
| --- | --- | --- |
| 1 | **Restored V27→V38 rehearsal:** owner-supplied backup, isolated restore/upgrade, preserved-data comparison, bounded acceptance and second restore; publish compact evidence and exact results | Mandatory; immediate next task |
| 2 | **Close release gates:** approve public scope/owners, triage only rehearsal failures, retain hidden pilot, settle required public-content permissions or exclude affected content; agree recovery and single-instance limits | Mandatory; decisions can proceed alongside rehearsal |
| 3 | **Prepare main integration:** explicitly resolve five dirty files/untracked roadmap with their owner; create clean candidate from committed work, refresh main/remote state when authorized, review delta and conflicts, run ordinary PR checks once and retain commit-bound evidence | Mandatory before a separately authorized merge; this task does not merge/push |
| 4 | **Portfolio documentation pass:** fix drift, link concise evidence and safe local setup; check screenshots against approved scope | Status/safety corrections mandatory before publishing docs; extra diagrams, new screenshots/video optional |
| 5 | **Deployment preparation:** only after deployment is resumed, approve target/settings/secrets, backups/recovery, TLS/proxy/security and resource smoke plan; keep imports/admin seeding/pilot activation off; obtain explicit go/no-go before rollout | Mandatory before deployment; no service creation or Neon access now |

Optional polish: additional games/modes, online Chess, broad score replay, multi-instance infrastructure, wider test automation and visual redesign. None justifies another large audit or feature phase for this consolidation.

**Next task:** perform the isolated restored-copy migration rehearsal with a clearly authorized backup input. Until its evidence and the applicable operational/product/content gates are closed, the release decision remains **NO-GO**. Yu-Gi-Oh! remains a separate **NO-GO** even after database rehearsal succeeds.
