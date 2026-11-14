# TCG-008 — Yu-Gi-Oh! pilot pack

This pilot stays disabled. Deployment is postponed. Do not import or activate it in the original development database or production, and do not access Neon.

## Pack and printing pool

- Stable keys: game `yugioh`, set `betb`, pack `arcade-pilot-booster`. Database IDs are assigned locally; re-imports reuse them.
- Name: **Beyond the Brave Arcade Pilot Pack**. Nine cards, no artwork, existing text card rendering.
- The metadata-only YGOPRODeck recording from 2026-11-14 contains 100 distinct passcodes and 127 English printings: 50 Common, 26 Super Rare, 16 Ultra Rare, 10 Secret Rare, 25 Starlight Rare.
- Each printing retains `<set>:<printed code>:<rarity>` as its external ID. Two rarities under one printed code are separate collectible printings.
- Every printing in the imported set is eligible, grouped by its mapped rarity. Unknown source rarities stop mapping. A promised rarity with no eligible printing fails dataset validation before any writes; weights are never silently adapted to an incomplete pilot pool.
- Re-imports upsert cards and pack, compare/replace pool and odds only when needed, preserve collections/history and preserve explicit activation state. Dry runs roll back all catalog writes (sequences can advance).

## Arcade Simulated Odds

All nine slots use this identical distribution. These are arcade design choices independent of printing counts. They are **not Konami's official pull rates or an official slot layout**.

| Rarity | Integer weight | Probability per slot | Expected cards per pack |
| --- | ---: | ---: | ---: |
| Common | 8000 | 80% | 7.2 |
| Super Rare | 1400 | 14% | 1.26 |
| Ultra Rare | 500 | 5% | 0.45 |
| Secret Rare | 99 | 0.99% | 0.0891 |
| Starlight Rare | 1 | 0.01% | 0.0009 |

For each slot, the existing roller draws an independent integer ticket from 0 through 9999 to select a rarity by these weights, then chooses uniformly among that rarity's eligible printings that have not already appeared in this pack. Only if that rarity's pool is exhausted can a printing repeat. All current pools contain at least ten printings, so nine-card packs contain no duplicate printing IDs. Different rarities of the same card may appear together. Avoiding duplicate printings does not alter rarity probabilities.

There is no guaranteed foil or rare slot. A pack may be all Common, or have several high-rarity cards. The probability of at least one rarity with per-slot chance `p` is `1 - (1-p)^9`: about 8.5652% for Secret Rare and 0.089964% for Starlight Rare (roughly one in 1,112 packs for at least one Starlight). These describe the simulation, not physical booster collation. Text-only cards have no foil artwork; existing tier effects apply, with Secret and Starlight both tier 5 but distinct labels.

## Activation prerequisites

1. Use an isolated PostgreSQL database migrated through V38, never the original V27 development database. Confirm its explicit connection URL before launching anything. Do not edit V1–V38.
2. Enable `APP_TCG_PILOTS_YUGIOH_ENABLED=true` only for the disposable importer; use the `import-tcg` profile with `TCG_IMPORT_SOURCES=yugioh`, first `TCG_IMPORT_DRY_RUN=true`. Review the report: one set, 127 printings and one pack. Then import and repeat to verify no duplicates.
3. Verify the game and pack are inactive after import. Source enablement does not make the game visible. Keep the text-only image/licensing policy and simulated odds notice visible.
4. Only within that disposable database, explicitly enable both rows for interactive checks:

```sql
UPDATE tcg_games SET active = TRUE WHERE slug = 'yugioh';
UPDATE tcg_packs p SET active = TRUE
FROM tcg_sets s, tcg_games g
WHERE p.set_id = s.id AND s.game_id = g.id
  AND g.slug = 'yugioh' AND s.code = 'betb' AND p.code = 'arcade-pilot-booster';
```

5. Check nine-card reveals, rarity labels/effects, text details, collection and history at 375px and desktop, in light/dark themes. Verify replay, allowance exhaustion, existing purchased generic extras, admin unlimited openings and transaction rollback. Disable both rows afterwards or discard the disposable database.

No pilot-specific product is added to the shop. Existing generic extra packs are shared inventory and can be used by an explicitly activated disposable pilot, after free allowances are exhausted. Production prices and limits are unchanged.

## Images and licensing

No card, set, wrapper or card-back artwork is downloaded, hotlinked or redistributed. The client ignores image fields; the source produces null images and uses the arcade's own wrapper/card-back fallbacks. Card data attribution and the non-affiliation notice remain. Text metadata is not a grant of artwork or branding rights; any public release needs a separate product/licensing review.

## Validation

Focused automated coverage includes exact nine-slot weights, all 127 printings, scripted rarity boundaries, a seeded 100,000-pack simulation, fine percentage display, hidden/disabled gates, dry-run/repeated imports, missing pools, nine-card API responses, idempotency, purchased extras, admin allowances, collection/history and rollback after a replay-write failure. Integration tests use the existing Testcontainers PostgreSQL fixture and never fall back to the application datasource.

Run from `backend`:

```powershell
.\mvnw.cmd -o '-Dtest=YugiohPilotTests,YugiohPrintingMapperTests,YgoprodeckClientTests,PackRollerTests,YugiohPackRollerTests,TcgPackOddsTests,ArchitectureTests' test
.\mvnw.cmd -o '-Dtest=YugiohPilotImportTests,YugiohPackOpeningTests,TcgDatasetImportTests,PackOpeningApiTests,AdminPackOpeningTests' test
```

Run from `frontend`: `npm test -- --run src/tcg/yugiohPilot.test.tsx src/tcg/textCards.test.tsx src/tcg/tcg.test.tsx src/tcg/opening/openingMachine.test.ts`, plus `npm run typecheck` and focused lint.

Execution on 2026-11-14:

| Check | Result |
| --- | --- |
| Exact staged backend snapshot | 85 tests passed, including 22 architecture checks |
| Seeded simulation (`Random(8008)`) | 100,000 packs / 900,000 slots; Common 720,131, Super 126,030, Ultra 44,794, Secret 8,952, Starlight 93; every pack nine distinct printings; every rarity within six standard deviations of its configured probability |
| Exact staged frontend snapshot | 60 tests passed, including nine-card opening → collection → history and default franchise exclusion; TypeScript and focused lint passed |
| Browser, isolated frontend/test API | Passed at 375px and 1280px in both themes: wrapper without images, nine-card deal/flip/reveal-all, real recorded card text, all rarity labels/effects, exact fine odds, collection detail and opening history. No horizontal overflow, browser errors or unexpected API requests |
| PostgreSQL import/opening integration | **Blocked, not passed.** All 50 selected cases stopped at application-context startup because Testcontainers could not find a Docker engine. No disposable migration/import/opening ran |

Browser evidence is under ignored `backend/target/tcg-008/`: `browser-report.json` and `{375,1280}-{light,dark}-{sealed,dealt,revealed,detail,history}.png`. Unit, integration, frontend and staged-snapshot logs are in the same directory. Browser checks intercept all backend data; they do not establish real persistence or database transaction correctness.

Docker Desktop's engine was unavailable and starting its service was denied. The installed local PostgreSQL cluster requires credentials; a maintenance-only connection without a password failed. Windows Application Control blocked initializing a separate local cluster. No authentication or policy changes were attempted. The original development database and Neon were not connected to; no migrations were changed or applied there. No application backend was launched. The temporary frontend's proxy pointed to an unused port, and browser requests used test fixtures.

The database assertions are implemented and compile: dry-run, real/repeated import, valid pools, both activation gates, nine-card openings, replay, purchased generic inventory, admin unlimited access, exact collection quantities/history, neighbour catalog/pool/odds preservation, and rollback after a failure saving the replay. They still require execution on disposable PostgreSQL through V38. Pokémon/One Piece source configurations, migrations, shop products/prices and allowance logic have no changes.

## Changed files

Backend production/configuration:

- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/TcgDataset.java`
- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/TcgDatasetImporter.java`
- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohCatalog.java`
- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohConfig.java`
- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohSource.java`
- `backend/src/main/java/com/cyan/arcade/tcg/pack/TcgPackService.java`
- `backend/src/main/resources/application.yml` (comments only; source remains disabled)
- `backend/src/main/resources/tcg/pilots/yugioh.json`

Backend regression tests and recording:

- `backend/src/test/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohPackFixture.java`
- `backend/src/test/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohPackOpeningTests.java`
- `backend/src/test/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohPilotImportTests.java`
- `backend/src/test/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohPilotTests.java`
- `backend/src/test/java/com/cyan/arcade/tcg/opening/YugiohPackRollerTests.java`
- `backend/src/test/java/com/cyan/arcade/tcg/pack/TcgPackOddsTests.java`
- `backend/src/test/resources/tcg/ygoprodeck/cardinfo-beyond-the-brave-full.json`

Frontend:

- `frontend/src/tcg/opening/PackOpening.tsx`
- `frontend/src/tcg/test/tcgMockApi.ts`
- `frontend/src/tcg/test/yugiohPilotFixture.ts`
- `frontend/src/tcg/yugiohPilot.test.tsx`

Documentation: `ARCHITECTURE.md`, `README.md`, `docs/tcg-008-pilot-pack.md`.

## TCG-009 recommendation

Keep the next increment focused on pilot acceptance: complete any blocked disposable database/browser checks, review the exact odds and text-card usability, and decide whether to retain the pilot. Public activation, licensing and any shop expansion require separate explicit scope; they are not defaults of this pack work.
