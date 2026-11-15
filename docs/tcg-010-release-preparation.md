# TCG-010 — Yu-Gi-Oh! release preparation

Scope: Beyond the Brave only, **127 printings / 100 cards / one nine-card pack**. No activation, migration or deployment of the original development database or Neon is authorized. Public release is **blocked** pending the external and operational items below.

## Readiness checklist

| Item | Status | Evidence / remaining work |
| --- | --- | --- |
| Existing pack persistence, retries, allowances and rollback | **Ready** | [TCG-009](tcg-009-acceptance.md): 50 PostgreSQL tests, 18 API checks and seven real browser checks; bounded franchise fixtures |
| Explicit administrative activation and reversal | **Ready** | ADMIN + CSRF + service authorization; separate activation gate defaults off; prerequisite validation; transactional visibility changes |
| Text cards, full details, long names/codes and Pendulum scale | **Ready** | Focused TCG-010 tests and mobile verification recorded below |
| Configured simulated odds and per-slot explanation | **Ready** | Percentages come from the pack API; no percentage list is copied into the pilot's prose |
| Public pilot launch, audience, retention and text-only experience | **Requires product decision** | Record an owner, audience and release/rollback decision; no additional set or shop product is in scope |
| Provider metadata/card-text redistribution scope | **Requires external permission or verification** | Verify this application's intended distribution, caching, public access and any commercial use; no blanket permission was established |
| Artwork, logos, card backs and future image hosting | **Blocked** | No image rights clearance exists in this repository; no artwork may be downloaded, hotlinked or hosted for this release |
| Attribution wording and rights-holder requirements | **Requires external permission or verification** | Current notices are retained, but sufficiency must be confirmed for the approved usage and territories |
| Refresh cadence, durable provider snapshots and quota ownership | **Requires product decision** | Approve a versioned cache/retention policy and one import-job owner; current per-run cache is not cross-run coordination |
| Target backup/restore, V27→V38 rehearsal and operations approval | **Blocked** | Fresh V38 acceptance does not validate a restored target with real V27 data; follow the [runbook](tcg-010-operations.md) only with separate authorization |
| Deployment or public activation | **Blocked** | Deployment is postponed; source and activation settings remain false by default |

“Ready” describes an implemented technical capability, not permission to publish the provider's data or rights-holder content. The activation API cannot verify licensing or approve a release.

## Administrative mechanism

- `GET /api/admin/tcg/pilots/yugioh`: read-only readiness response with `activationAllowed`, `dataValid`, independent game/pack visibility, counts and prerequisite problems. A missing import produces a clear not-ready response.
- `PUT /api/admin/tcg/pilots/yugioh/visibility`, JSON `{ "active": true }` or `{ "active": false }`: explicitly sets both game and pack visibility in one transaction. The desired-state request is idempotent; there is no public button or arbitrary-franchise parameter.
- Existing `/api/admin/**` authentication/ADMIN checks and CSRF protection apply. Controller and service also enforce `hasRole('ADMIN')`. Missing/invalid bodies return 400; unauthorized callers receive 401/403.
- `app.tcg.pilots.yugioh.activation-allowed=false` is a separate default-off release gate (`APP_TCG_PILOTS_YUGIOH_ACTIVATION_ALLOWED` for an explicitly approved environment). Setting the import source's `enabled` flag does not grant activation permission. A disabled activation gate returns 409 / `PILOT_ACTIVATION_DISABLED`.
- Activation requires exactly the configured set/pack, 127 valid printing IDs and 100 passcodes, correct rarity tiers, complete text-only cards, configured attribution/disclosure, exactly the configured nine-slot weights, and every promised rarity/pool. Pool membership must equal the pilot's printings with no foreign cards. Invalid data returns 409 / `PILOT_NOT_READY` without visibility writes.
- Expected identifiers, rarity tiers, weights and disclosure are read from the **shipped** `tcg/pilots/yugioh.json`. A custom import configuration is not a way to change this release policy. The fixed 127/100 scope requires deliberate code/review changes before expansion.
- Deactivation bypasses the activation gate and data validation, so a broken catalog can still be hidden. Nothing deletes cards, collections, history, replay records or inventory. Missing games return 404.
- Yu-Gi-Oh! imports and administrative inspections/changes share a transaction-scoped PostgreSQL advisory lock. This prevents activation against a partially imported catalog. The lock does not affect Pokémon or One Piece imports. Re-imports preserve explicit active/inactive decisions.
- The application logs the acting admin ID and requested visibility. Operators must separately record why the release decision was made. Direct SQL changes bypass these safeguards and are not the supported activation procedure.
- Readiness is a point-in-time check. Import only reviewed datasets during a controlled maintenance window, then check readiness again. Already-running openings may finish during a visibility change. Existing browser tabs can retain catalog data for up to the current five-minute query cache; fresh API requests enforce visibility, and operators must verify using a fresh page/session.

## Focused presentation changes

Text-card tiles put the printed code on its own wrapping monospace line and the name on up to three lines; their accessible name and detail dialog retain the full name. Image-backed tiles retain their existing presentation. Text-card faces allow three title lines and slightly larger effect previews; the dialog provides the unabridged effect with wrapping for long identifiers.

Finite nonnegative integer `pendulumScale` metadata is displayed, including zero; absent or malformed values are omitted rather than guessed. The no-artwork Yu-Gi-Oh! wrapper uses the arcade's own layers emblem, cyan/gold styling and “Text cards / No official artwork” label. Set/game descriptions explain the text-only pilot.

The pack page explains that **each of the API-reported number of card slots** draws a rarity independently, with no guaranteed rare, and describes existing duplicate avoidance. Its table displays the API's configured percentages. The pilot's prose contains no copied percentage list. The configuration's weights remain 8000/1400/500/99/1: **80%, 14%, 5%, 0.99%, 0.01%** per slot. These are **Arcade Simulated Odds**, not Konami's official rates or collation. Costs, allowances and roller behavior are unchanged.

## Provider and rights review — 2026-11-14

Primary sources consulted: [YGOPRODeck API guide](https://ygoprodeck.com/api-guide/), [Konami EU website terms](https://www.yugioh-card.com/eu/website-terms/) and [Konami's notice concerning unauthorized card-image use](https://www.konami.com/yugioh/information/22081). These pages are evidence for a readiness review, not a legal conclusion or a license for this project. The attempted YGOPRODeck `/terms-of-service/` URL returned 404; no separate blanket redistribution grant was verified.

The provider guide requests local storage to minimize API calls, states a 20-request/second limit with a one-hour block when exceeded, and describes provider-side caching. Its image guidance disallows continual hotlinking and directs clients to re-host images. That operational direction is not evidence of rights-holder permission to redistribute artwork.

The importer currently spaces requests by at least 250ms, caches answers per client/run, and persists imported metadata for normal application reads. Browsing/opening packs does not call the provider. This is not a persistent cross-run provider-response cache or coordinated multi-job quota. Before release, choose and verify a refresh schedule, durable approved snapshot/version policy, retry/backoff behavior and single-job ownership. Provider-side caching does not replace local caching or permission review.

Konami's site terms identify protected website material; its image-use notice reinforces that provider access cannot settle image rights. Text-only presentation avoids fetching artwork but does **not** establish permission for names, effects, database contents or branding. Seek confirmation of allowed metadata fields, redistribution/public display scope, attribution, territories, retention and takedown handling. No outreach was sent by this task. Future image hosting requires separate rights clearance and infrastructure approval, including hosting/CDN, cache rules and removal procedures.

## Validation and scope

| Final check | PASS | FAIL | SKIPPED | BLOCKED |
| --- | ---: | ---: | ---: | ---: |
| Exact staged backend snapshot, including 22 architecture checks | 68 | 0 | 0 | 0 |
| Exact staged frontend snapshot | 57 | 0 | 0 | 0 |
| Focused real API/browser scenarios | 4 | 0 | 0 | 0 |

TypeScript and focused frontend lint also passed. Backend tests used fresh PostgreSQL Testcontainers databases with a deliberately unusable fallback datasource. They cover unauthorized callers, controller/service authorization, CSRF, default-off gate, missing import/set/pack, wrong weights/disclosure/tiers, missing pools/text, foreign cards/artwork, reversible activation, repeated operations, re-import visibility/player preservation, and existing catalog visibility. No migrations were changed.

The browser used the exact staged backend plus a separate PostgreSQL container at `127.0.0.1:55440/tcg010_review`, backend `8100` and frontend `5200`; no responses were mocked/intercepted. Four scenarios (375/1280px × light/dark) verified the longest real card name, full printed code without ellipsis/overflow, full effect text in details, the real recorded Pendulum scale, the improved wrapper and actual API percentages. The pilot was activated and then hidden again exclusively through the new ADMIN/CSRF API, retaining 127 printings; the public game list excluded it and its pack returned 404 afterwards.

[Structured evidence](acceptance/tcg-010/evidence.json), [mobile code/name tiles](acceptance/tcg-010/375-light-long-tile.png), [dark pack/disclosure](acceptance/tcg-010/375-dark-pack.png), [desktop text-card tiles](acceptance/tcg-010/1280-light-long-tile.png). Screenshots were visually inspected. Implementation commits: `1086a27` (administration) and `88f5342` (presentation).

TCG-009 remains the evidence for unchanged opening, allowance and inventory behavior; its unrelated acceptance suites were not repeated here. No original development or Neon connection occurred. All six unrelated local-file hashes were preserved. The original V27 database was not migrated, and no restored production backup was rehearsed; those operational blockers remain.

Cleanup completed after hiding the pilot through the admin API: task backend/frontend stopped, the exact labelled container removed, and all three Testcontainers IDs from the staged run verified absent. Task temporary files and the dependency junction were removed while preserving the original dependencies, existing TCG-009 evidence and unrelated files. Repository source/activation defaults remain false. No push, merge or deployment occurred.

## Decision

**Not publicly release-ready.** Finish provider/rights verification, product approval and a separately authorized restored-copy migration rehearsal. Keep both source and activation gates off in normal environments. The next step is to assign owners to the blockers and review the runbook; it is not to execute it against the original development database or Neon.

## Changed files

- `API.md`
- `ARCHITECTURE.md`
- `README.md`
- `THIRD_PARTY_NOTICES.md`
- `backend/src/main/java/com/cyan/arcade/tcg/administration/YugiohPilotController.java`
- `backend/src/main/java/com/cyan/arcade/tcg/administration/YugiohPilotService.java`
- `backend/src/main/java/com/cyan/arcade/tcg/administration/YugiohPilotStore.java`
- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/TcgDatasetImporter.java`
- `backend/src/main/java/com/cyan/arcade/tcg/dataimport/yugioh/YugiohSource.java`
- `backend/src/main/java/com/cyan/arcade/tcg/game/PilotCatalogLock.java`
- `backend/src/main/java/com/cyan/arcade/tcg/game/TcgGameStore.java`
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/tcg/pilots/yugioh.json`
- `backend/src/test/java/com/cyan/arcade/tcg/administration/YugiohActivationGateTests.java`
- `backend/src/test/java/com/cyan/arcade/tcg/administration/YugiohActivationTests.java`
- `backend/src/test/java/com/cyan/arcade/tcg/administration/YugiohReadinessTests.java`
- `docs/acceptance/tcg-010/1280-light-long-tile.png`
- `docs/acceptance/tcg-010/375-dark-pack.png`
- `docs/acceptance/tcg-010/375-light-long-tile.png`
- `docs/acceptance/tcg-010/evidence.json`
- `docs/tcg-008-pilot-pack.md`
- `docs/tcg-010-operations.md`
- `docs/tcg-010-release-preparation.md`
- `frontend/src/tcg/components/CardDetail.tsx`
- `frontend/src/tcg/components/CardTile.tsx`
- `frontend/src/tcg/components/PackArt.tsx`
- `frontend/src/tcg/components/TextCardFace.tsx`
- `frontend/src/tcg/pages/TcgPackPage.tsx`
- `frontend/src/tcg/test/yugiohPilotFixture.ts`
- `frontend/src/tcg/textCard.ts`
- `frontend/src/tcg/textCards.test.tsx`
- `frontend/src/tcg/yugiohPilot.test.tsx`
