# TCG-009 — PostgreSQL integration and acceptance

**Result: PASS — the previously blocked validation is complete.** Resumed on 2026-11-14 (Asia/Bangkok), from branch `release/cyan-arcade-v2`, HEAD `1da6952`.

The earlier attempt, recorded by `1da6952`, was blocked before executing any PostgreSQL tests. This report supersedes that blocked disposition. The pilot remains disabled by default and deployment remains postponed.

## Environment and isolation

- Docker Desktop Linux engine: **29.8.1**, verified before proceeding.
- The 50 integration cases used a fresh Testcontainers `postgres:18-alpine` database at a dynamically mapped port (`57741`), database/user `test`. The fallback application datasource was explicitly overridden to unused loopback port `1`, database/user `tcg009_no_fallback`, preventing a development-database fallback.
- Real API/browser acceptance used a second container, `tcg009-acceptance-20261114`, identified by its exact container ID and `com.cyan.task=tcg009-20261114` label. Its PostgreSQL **18.6** database `tcg009_acceptance`, user `tcg009`, and disposable password were separate from development.
- The acceptance container bound only `127.0.0.1:55439`; storage was disposable tmpfs. Backend: `127.0.0.1:8099`. Frontend: `127.0.0.1:5199`, proxying only to `8099`. JDBC URL, credentials, source/import settings and loopback bindings were explicit launch arguments.
- Both fresh databases successfully applied **38 migrations, through V38**. No migration files were edited.
- No application connected to the original development database or Neon. Neither database was queried to inspect its contents or migration version.

## Exact results

| Validation | PASS | FAIL | SKIPPED | BLOCKED |
| --- | ---: | ---: | ---: | ---: |
| PostgreSQL/JUnit integration tests | **50** | **0** | **0** | **0** |
| Additional real API/database acceptance checks | **18** | **0** | **0** | **0** |
| Browser scenarios/checks using real APIs and PostgreSQL | **7** | **0** | **0** | **0** |

The API/browser counts describe explicit acceptance checks, not additional JUnit tests. Expected refusals and deliberately injected failures are passing negative cases, not unexpected test failures.

| PostgreSQL test class | Passed |
| --- | ---: |
| `YugiohPilotImportTests` | 6 |
| `YugiohPackOpeningTests` | 5 |
| `TcgDatasetImportTests` | 12 |
| `PackOpeningApiTests` | 24 |
| `AdminPackOpeningTests` | 3 |

The targeted set ran once; no full suite was repeated. Command from `backend`:

```powershell
.\mvnw.cmd -o '-Dtest=YugiohPilotImportTests,YugiohPackOpeningTests,TcgDatasetImportTests,PackOpeningApiTests,AdminPackOpeningTests' test
```

The durable [evidence JSON](acceptance/tcg-009/evidence.json) contains per-class Surefire counts, all acceptance check names, import reports, per-player database totals, container identity, catalog digests, screenshot/fixture/log hashes and cleanup results.

## Import and persistence results

- Exported existing regression fixtures through the production dataset mappers. Yu-Gi-Oh! used the existing complete metadata recording and `YugiohPackFixture`; no live provider requests were necessary.
- Yu-Gi-Oh! dry-run: reported **127 new cards, one new set, one new pack**, then rolled back. The catalog contained **zero games** before baseline import.
- Actual pilot import: **1 set, 127 printings, 100 distinct passcodes, 1 nine-card pack, 127 pool rows and 45 odds rows**. Game and pack were both inactive initially.
- Pools: **50 Common, 26 Super Rare, 16 Ultra Rare, 10 Secret Rare and 25 Starlight Rare**.
- Re-import: **0 new/updated cards, sets or packs; 127 unchanged cards**. Full catalog-row comparisons confirmed stable database and printing IDs, pool membership and odds.
- A deliberately duplicated printing was refused as `FAILED`; the catalog remained identical. The integration tests additionally verified import validation/rollback and preservation of dropped cards.
- A later re-import preserved existing player collections, history, replay records and the disposable environment's explicit activation state.

The Arcade Simulated Odds were unchanged: Common **80%**, Super **14%**, Ultra **5%**, Secret **0.99%**, Starlight **0.01%** per slot. All nine slots use the same existing roller. No official Konami probabilities or collation are claimed.

## Real openings, allowances and transactions

- Both activation gates worked: a hidden game was absent from the real game list; enabling only the game still left the pack unavailable. Only then were both rows explicitly activated inside the disposable database.
- Every successful Yu-Gi-Oh! opening returned **nine distinct printing IDs**, each valid for the pack pool and its position's rarity odds.
- Four concurrent/same-key requests returned the same opening and consumed one allowance, producing **one opening and nine collected copies**.
- The API player opened **five free packs**: 45 copies. An exhausted request returned **429** without changing player rows.
- Invalid UUID and unknown-pack requests returned **400/404**, with no partial writes.
- The disposable player bought one existing generic `EXTRA_PACK` at its unchanged **100-coin** price, using a grant made only inside the disposable database. Opening and retry consumed that extra exactly once.
- A real PostgreSQL trigger rejected replay storage after collection writes. The backend returned **500**; snapshots confirmed rollback of opening, collection, replay, inventory and wallet/ledger state. Removing the trigger allowed the same key to succeed once.
- Final API-player result: **6 openings, 54 collected copies, 6 history entries and 6 replay rows**. History contained nine cards per opening. Quantities and pool/rarity joins were checked directly in PostgreSQL.
- The disposable admin opened **7 packs / 63 copies** with null daily limit/remaining count. The integration cases also verified preservation of admin bonus inventory.
- A real backend restart followed by fresh login preserved the API player's **54 copies and six history entries**.

## Pokémon and One Piece regression baseline

Reused the existing mapper-test fixtures and shipped source configurations: Scarlet & Violet (**2 cards**) and Romance Dawn (**7 printings**). Artwork URLs in the disposable exports were replaced with a local data-URI test placeholder; no copyrighted artwork was fetched or hotlinked.

These intentionally small fixtures produce **six-card Pokémon** and **five-card One Piece** packs under the existing mapper's pool-filtering rules. They are regression fixtures, not full production catalogs or claims about physical pack sizes.

Each franchise opened once before pilot import and once afterwards. Pack API responses, sizes and behavior matched; existing player rows were unchanged by pilot import/re-import. Complete game/set/card/rarity/pack/pool/odds snapshots had identical SHA-256 digests before and after:

`31ad2a63154801b57f81653e3e43974ed4c78ded2c1fef25b4f7b1438aa0e85a`

No Pokémon or One Piece source configuration or production behavior was changed. Full production-catalog acceptance remains outside this bounded fixture check.

## Database-backed browser results

All four combinations passed in Chrome using the real frontend, backend and PostgreSQL: **375px/light, 375px/dark, 1280px/light and 1280px/dark**. No API responses were intercepted or mocked, and no external page requests were observed.

Verified franchise → set → pack selection, wrapper without artwork, exact Arcade Simulated Odds labels, nine-card deal/individual flip/reveal-all, text cards and full effect text in details, rarity frames, collection quantities, opening-history card IDs/order, persistence after reload and no horizontal overflow. Screenshots were visually inspected after animations settled.

Three further browser checks passed:

1. Secret/Starlight catalog details showed distinct rarity labels and tier-5 frame/shimmer. These were real catalog selections; no rare pull was forced or odds changed.
2. A real trigger-induced **500** displayed error feedback and rolled back all writes. Clicking retry reused the original idempotency key and produced exactly one additional opening.
3. Real requests exhausted the five-pack allowance; a further request returned **429** without writes, and the UI displayed the allowance message with the open button disabled.

Evidence: [375px light](acceptance/tcg-009/375-light-revealed.png), [375px dark](acceptance/tcg-009/375-dark-revealed.png), [1280px light](acceptance/tcg-009/1280-light-revealed.png), [1280px dark](acceptance/tcg-009/1280-dark-revealed.png), [Starlight detail](acceptance/tcg-009/375-light-starlight-detail.png), [real error feedback](acceptance/tcg-009/375-light-error.png).

Temporary harness corrections were required: a duplicate launcher port argument, child-process detachment, allowing the isolated frontend origin after an initial CORS rejection, and narrowing a locator where rarity text appeared more than once. No application correctness defect was found and no production code/configuration fix was needed. One preliminary browser player completed one opening before the locator correction; that opening is included in the recorded database totals.

## Database totals recorded before cleanup

| Rows/quantity | Count |
| --- | ---: |
| Games / sets / packs | 3 / 3 / 3 |
| Cards / pool rows / odds rows | 136 / 136 / 60 |
| Successful openings / replay rows | 26 / 26 |
| Opening-card rows / collected copies | 220 / 220 |
| Unique user-card rows | 153 |
| Purchases | 1 |

Totals include the two baseline franchises, API/admin players, four final browser scenarios and the preliminary browser opening. Failed/invalid attempts left no extra openings or copies.

## Cleanup and safety

Before removing the database, both pilot rows were disabled again. The real game list excluded Yu-Gi-Oh! and the pack endpoint returned **404**. Then the verified task backend/frontend processes were stopped and the exact task-labelled container was removed. Testcontainers had already removed its own PostgreSQL container and reaper. No task ports remained listening.

Only the resolved task-created directory `backend/target/tcg-009` was recursively removed, after durable evidence was copied here. Existing TCG-008 evidence, other containers and user files were left intact. No local configuration files were edited or required restoration.

All six unrelated local files retained their original hashes: `SudokuService.java`, `ModeLab.java`, `useScoreSubmission.test.ts`, `useScoreSubmission.ts`, `LeaderboardModes.test.tsx`, and untracked `ROADMAP.md`. Existing migrations, source configurations, prices, probabilities and production allowances remained unchanged.

The original development database and Neon were **not connected to or modified**. All grants, purchases, activations and failure triggers were confined to the removed disposable database. No artwork was downloaded or hotlinked. Nothing was pushed, merged or deployed.

## Release recommendation

**TCG-009 validation is complete; no validation blockers remain.** The pilot is suitable for the next controlled product review, with the bounded baseline scope above. This does not authorize public activation, artwork/branding use, shop expansion, development-database migration or deployment. Keep Yu-Gi-Oh! hidden/disabled by default and deployment postponed pending separate approval.
