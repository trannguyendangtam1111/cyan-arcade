# Yu-Gi-Oh! controlled-release runbook

**Preparation only: none of these operations was executed against the original development database or Neon. Do not use either for this task.** The current original database is reported to be V27; that state was not queried. All future target changes need explicit operational authorization and resolution of the [release blockers](tcg-010-release-preparation.md).

## 1. Identify the target and backup

Record the approved environment, host/port/database/user, application commit/artifact, migration checksums, owner and maintenance window. Verify the connection identity independently before starting the application: Spring Boot normally runs Flyway at startup. Do not inherit a default DB URL, an unknown `.env`, a production connection or a Neon URL.

Quiesce application writers and scheduled/import jobs for the planned cutover. Make an access-controlled full custom-format backup with the target's approved PostgreSQL tools/credentials; do not print credentials in logs. Example placeholders, not executable target values:

```text
pg_dump --format=custom --dbname=<approved-target-url> --file=<backup-path>
pg_restore --list <backup-path>
```

Capture PostgreSQL version, roles/permissions and required extensions separately. Hash and retain the backup and metadata under the approved retention policy. Listing a dump is not proof of recovery: restore it to an isolated disposable database with separate credentials/ports and actually validate the restored data. Never restore over the original database for rehearsal.

## 2. Check history and review V28–V38

On the **approved disposable restored copy**, inspect:

```sql
SELECT current_database(), current_user, version();
SELECT installed_rank, version, description, checksum, success
FROM flyway_schema_history ORDER BY installed_rank;
```

Compare every existing checksum with the release artifact, look for failed/unexpected migrations, and verify schema compatibility. Do not baseline an unknown schema, edit applied migrations, enable Flyway clean or use repair to suppress mismatches.

| Migration | Required review before execution |
| --- | --- |
| V28 | Game-session/score mode columns, defaults and constraints; compatibility with existing rows |
| V29 | Score leaderboard index build and lock/runtime impact on a restored data volume |
| V30 | Minesweeper daily board/attempt schema |
| V31 | Archives V30 daily data, checks copy equality, removes copied active rows and adds shared layouts; inspect real data and preservation assertions carefully |
| V32 | Daily-board reward columns and constraints |
| V33 | Partial Sudoku daily index build and lock/runtime impact |
| V34 | Sudoku archive-mode constraints and compatibility with restored runs |
| V35 | Sudoku notes table, foreign key and revision/format constraints |
| V36 | Nullable historical score response snapshots; old reward snapshots cannot be reconstructed |
| V37 | JDBC session tables/indexes; plan the transition from older in-memory sessions and sign-in behavior |
| V38 | Nullable card image plus image/thumbnail constraints; validate existing URL values and text-only rendering |

Review the actual SQL files, PostgreSQL version, permissions, data size, DDL locks, available disk and maintenance timeout policy. This table is a review aid, not approval to run them.

## 3. Rehearse migration on the restored copy

Use a separate application process with an explicit JDBC URL/user/password for the disposable restored copy, separate loopback HTTP port, scheduling disabled and **no startup imports**. Keep both Yu-Gi-Oh! gates false. Pin the release's migration target to V38, retain checksum validation, and capture the migration log/durations.

After migration, verify all successful versions through V38, Hibernate validation, pre/post user/score/collection/history/coin/inventory totals and any migration-specific archives. Exercise authentication/CSRF and existing game flows on that copy. Measure recovery by restoring the pre-upgrade backup into another isolated database. A fresh empty V38 Testcontainers run (TCG-009/010) does not replace this V27-data rehearsal.

If anything fails, stop. Record the error and assess the restored copy; do not change migration files or proceed to a live target. Production backup/restore and a restored-copy rehearsal remain blocked until separately authorized.

## 4. Import while hidden

Before import, snapshot Pokémon and One Piece games, rarities, sets, cards, packs, pools and odds, plus player collections/history/inventory/coin totals. Record stable IDs and canonical row digests. Use the approved provider snapshot/version and refresh policy; do not fetch artwork.

Against the **disposable restored copy first**, run the importer with explicit datasource settings, `APP_TCG_PILOTS_YUGIOH_ENABLED=true`, `TCG_IMPORT_SOURCES=yugioh`, scheduling disabled and a report file. Start with `TCG_IMPORT_DRY_RUN=true`, inspect the report and confirm zero catalog writes. Then import once and repeat. Keep `APP_TCG_PILOTS_YUGIOH_ACTIVATION_ALLOWED=false` throughout import. Do not enable the source in the normal serving process.

Expected initial pilot import: one `betb` set, 127 printings / 100 distinct passcodes, one `arcade-pilot-booster` pack, 127 pool members, nine slots and 45 odds rows. Rarity counts: Common 50, Super 26, Ultra 16, Secret 10, Starlight 25. All image fields must be null. First creation leaves both visibility flags false; repeat import leaves stable IDs and visibility decisions intact and reports 127 unchanged cards, no new/updated sets/packs/cards.

If a pilot already exists, inspect its current visibility **before** import: import deliberately preserves explicit activation/deactivation. Use the admin operation below to hide it before maintenance rather than expecting import to hide an already active game.

An existing TCG-008/009 import may report a set/pack metadata update for TCG-010's clearer descriptions and nonduplicated odds note. This does not change rarity weights. Re-import the reviewed current dataset to satisfy the new disclosure prerequisite, then verify the next import is unchanged.

Compare the neighbour/player snapshots and open bounded Pokémon/One Piece regression packs on the copy. Check nine-card pilot roll/collection/history/retry/allowance/rollback behavior using existing acceptance evidence and focused checks appropriate to the actual restored data. Do not create new products or change prices/limits.

## 5. Inspect and explicitly activate — only after approval

Complete external permission/verification and product/operations sign-off first. Allow activation only in the explicitly approved environment by setting `APP_TCG_PILOTS_YUGIOH_ACTIVATION_ALLOWED=true` for its serving process. This task sets it only in disposable tests; do not enable it in the original development environment or Neon.

Authenticate as ADMIN using the existing session mechanism and obtain the current CSRF cookie. Inspect readiness:

```http
GET /api/admin/tcg/pilots/yugioh
```

Require `activationAllowed=true`, `dataValid=true`, empty `problems`, and the counts above. Readiness checks the shipped release policy and does not certify data/artwork rights. A different dataset, altered weights, incomplete pool or unexpected artwork must be investigated, not bypassed with SQL.

The explicitly approved operation is:

```http
PUT /api/admin/tcg/pilots/yugioh/visibility
Content-Type: application/json
X-XSRF-TOKEN: <current token from the same authenticated session>
Cookie: <same authenticated session cookies>

{"active":true}
```

Record operator ID, decision reason, environment, commit, time, API response, counts and evidence. Confirm both visibility flags, public catalog/pack endpoints and exact per-slot API odds (80 / 14 / 5 / 0.99 / 0.01%). Verify fresh 375px/desktop light/dark pages show text cards and the Arcade Simulated Odds notice, with no official-rate implication. Check one bounded opening and persistence, then confirm neighbour data remains unchanged.

Do not activate by adding rows or directly updating flags. The endpoint uses ADMIN/CSRF checks, a default-off environment gate, prerequisite validation and one transaction. A 409 is a failed prerequisite/gate to resolve, not permission to bypass it. Keep the import process and release decision serialized; re-check readiness after any import.

## 6. Visibility rollback and recovery

Use the same authenticated/CSRF-protected endpoint with `{ "active": false }`. It works even with the activation gate off or invalid pack data, and hides all packs of this pilot together with the game without deleting player data. Verify the game is absent and the pack endpoint returns 404 using a fresh API request/page. Existing client caches may last five minutes and already-running openings may finish; account for them when comparing totals. Turn the activation gate off again.

**Visibility rollback does not reverse V28–V38, undo an import, or reverse earned/collected items.** Never issue guessed down-migration SQL. Schema/application rollback and database restoration require their own approved incident procedure: stop/quiesce writers, preserve the failed state/evidence, restore a verified backup into a separate recovery database, validate it with the matching application version, and reconcile any post-backup writes before an approved cutover. Restoration can lose later writes; it is not an automatic consequence of hiding a game.

## 7. Final decision record

Record Ready / Blocked / Requires product decision / Requires external permission or verification for each checklist item, with owner and evidence. Include backup/restore proof, V27→V38 rehearsal, provider snapshot/version and permission scope, tests, row/digest comparisons, actor/time, visibility and gate state, rollback plan, monitoring and an explicit go/no-go decision. Keep deployment postponed unless a separate release authorization is recorded. Remove only disposable resources created by the rehearsal; preserve target/user data and prior evidence.
