# Engineering summary: production polish

A record of the production-readiness pass over the whole project: what was looked at, what was fixed, the decisions that shape the code, and what is left.

## What was audited

| Area | How |
| ---- | --- |
| Database | Every foreign key checked against the indexes that exist (a catalog query over `pg_constraint` and `pg_index`); constraints, nullability and migrations V1 to V10 read through |
| Queries | Every SQL statement Hibernate issued during the full test run logged and scanned for N+1 patterns; the card module's SQL read by hand |
| Backend code | Unused methods, transaction boundaries, sources of the current time, every endpoint, error handling, security configuration |
| Security | Authentication, session and CSRF handling, password storage, ownership of scores, collections and histories, input validation, CORS, Actuator exposure, response headers |
| Frontend code | Unused exports, purity of the game engines, duplicated components and inline styles, bundle sizes |
| Accessibility | Contrast of every text on a colored background, focus visibility, the skip link, labels of interactive elements |
| Responsiveness | Every page measured for horizontal overflow at 375, 768, 800 and 1024 pixels |
| Tests | Coverage measured on both sides (JaCoCo, V8) and the gaps in the most important logic closed |
| Docker | Compose services, ports, health checks, nginx routing, caching and headers |

## What was fixed

**Backend**
- Username lookups compared `upper(username)`, which the unique index on `lower(username)` cannot serve, so every login scanned the users table. They now compare `lower()`.
- Password guessing was unlimited. Failed logins are now counted per username and address, and further attempts get `429` before the password is checked.
- Every call to the public "start a game" endpoint left a row forever if the game was never finished. An hourly job removes runs left unfinished for a day, using a new partial index.
- Timestamps came from both `Instant.now()` and the `Clock` bean, so "today" could differ between features. Everything now uses the clock.
- Scheduling is switched on in one place, unused accessors were removed, and a comment that had stopped being true was corrected.

**Frontend**
- White text sat on colors too light for it: the cyan primary button, the games' Play buttons, the lighter 2048 tiles and the card game's buttons. A shared `--accent-ink` now picks dark or white by the WCAG formula. Tetris's accent moved one shade darker so its text reaches 4.5:1.
- With the fifth navigation item ("Cards"), the header overflowed between 768 and 1024 pixels. The logo now shows its emblem only in that range.
- A revealed rare card's burst ring kept its enlarged size after fading and made the page scroll sideways. The main area now clips sideways overflow.
- On owned cards, the copy-count badge covered the card's HP. It now sits on the card's corner.
- Three copies of the same pager became one component, and seven copies of the inline accent style became one function.
- The sign-in form's input had no focus ring, and the skip link's target could not take focus. Both fixed.
- The login page now explains a throttled login, and two unused constants were removed.

**Tests and tooling**
- New tests (at the end of this pass the suites held 207 backend and 464 frontend tests) cover login throttling (unit and HTTP), the session cleanup job, the dataset import job reading files, unlimited packs, input hooks, the query client's retry policy, the route error page, contrast, and source-level architecture rules for the frontend.
- Coverage reports on both sides: JaCoCo in `mvnw verify`, and `npm run coverage`.

**Docker**
- A `docker-compose.yml` with `postgres`, `backend` and `frontend`. Ports for the database and the backend are bound to 127.0.0.1, every setting has a default in `.env.example`, and services restart unless stopped.
- nginx sends security headers (a Content Security Policy among them), caches by kind of file, and hides Actuator except the health check.

## Important architectural decisions

- **Modular monolith, boundaries enforced by tests.** One deployable backend and one SPA. ArchUnit keeps feature packages free of cycles, keeps controllers away from entities, keeps passwords inside `auth` and `user`, and isolates the card game. Source-level tests do the same in the frontend.
- **Pure game engines.** Rules are seeded, deterministic functions with no React, timers or DOM. The human player, the AI and the tests share them, and replay-based score checks could be added later.
- **Sessions, not tokens.** An `HttpOnly` session cookie with CSRF protection: the simplest safe choice for a browser app on the same origin as its API.
- **The server decides what matters.** Who the player is comes from the session. Scores go through server-issued game sessions, and card packs are rolled on the server with a `SecureRandom`. No endpoint accepts a user id or a card.
- **One place per rule.** All XP comes from `progression`, with other features adding bonuses through an interface. Card selection is one pure function, `PackRoller`.
- **The card game is a module, not a game.** It has its own tables and its own endpoints, and imports datasets so that any card game can be added as data. It uses SQL (`JdbcClient`) because its work is set-shaped: upserts, atomic counters, aggregates.
- **Concurrency in the database.** Row locks for finishing a game, `ON CONFLICT` for one-time rewards and card counts, and an advisory lock for the daily pack limit. Each is backed by a test with simultaneous requests.
- **Real PostgreSQL in tests**, never an in-memory substitute.

## Remaining technical debt

- Login sessions and login-throttle counts live in each backend's memory: they are lost on restart and not shared between instances.
- Scores, and the numbers games report about a run, are range-checked but not replayed, so a determined client can submit an implausible score within range.
- Starting game sessions as a guest is not rate-limited. The cleanup job bounds how long unfinished rows live, not how fast they arrive.
- No password reset or email, and guest scores are not moved to a new account.
- The main JavaScript bundle is about 136 kB gzipped. Games and the card game are split off, but the leaderboard, profile and sign-in pages are not.
- Behind the proxy, login throttling is effectively per username, so someone can keep a player's login blocked by failing on purpose.
- `info` is still exposed by the backend itself, only hidden by nginx.

## Recommended next steps

1. **Deploy behind HTTPS** (`SESSION_COOKIE_SECURE=true`). Move login sessions to Spring Session with JDBC and the throttle counts to the database or Redis, so restarts and several instances behave.
2. **Rate-limit the public endpoints** (session starts, registration) at nginx or with a filter.
3. **Verify scores by replay**: record the seed and inputs of a run and replay them through the same pure engine on the server.
4. **Password reset** with email, and claiming guest scores at registration.
5. **Split the remaining routes** into chunks and add an end-to-end smoke test (Playwright) to CI.
6. **Set up CI** to run `mvnw verify`, the frontend checks and `docker compose build` on every push.
