# Neon + Render + Vercel portfolio deployment

This is a single-instance demo. Follow these steps manually; preparation does not deploy services
or apply migrations. Activate the production profile on Render. Local Vite proxy and native
development settings are preserved; the Docker image uses the conservative memory budget below.

## 1. Prepare a fresh Neon database

Create a PostgreSQL 18 database in a region near Render. Use the direct endpoint initially so
Flyway and application transactions have ordinary PostgreSQL session behavior.
Configure Render secrets, not repository files:

- DB_URL: the JDBC URL, with no embedded username/password and exactly one sslmode=require,
  sslmode=verify-ca or sslmode=verify-full parameter. Use Neon's Java connection instructions.
  Shape: jdbc:postgresql://<neon-host>/<database>?sslmode=require
- DB_USERNAME and DB_PASSWORD: the database role and its unique password.

TLS is required both by the pool properties and the production URL guard. Certificate-verifying
modes additionally need the appropriate JDBC trust configuration; prefer verify-full where configured.
Never use sslmode=disable/prefer or put database credentials in VITE_ variables.

On the first backend start, Flyway automatically applies unchanged V1–V27 to the empty database;
Hibernate only validates. Do not baseline an unknown schema or enable Flyway clean.
Migrations seed game/shop configuration, not development users. The real TCG catalog is empty
until a separate, explicitly authorized import or existing-data migration is performed.
Normal production startup refuses source/file imports and the import-tcg profile.

## 2. Configure Render

Connect the existing GitHub repository and select main.

| Setting | Value |
| --- | --- |
| Runtime | Docker |
| Root directory | backend |
| Dockerfile path | ./Dockerfile, relative to backend |
| Build/start commands | Leave unset; use Dockerfile |
| Health check | /actuator/health/readiness |
| Auto-deploy | After CI checks pass, if available; otherwise enable after reviewing CI |

Required environment variables:

| Name | Configuration |
| --- | --- |
| SPRING_PROFILES_ACTIVE | prod |
| DB_URL, DB_USERNAME, DB_PASSWORD | Neon values above; store credentials as secrets |
| CORS_ALLOWED_ORIGINS | Exact HTTPS Vercel production origin, without a trailing slash |

Render supplies PORT; both Spring and Docker's health command use it. Do not override it with
a different SERVER_PORT. The service binds to 0.0.0.0. Keep the supplied health check; readiness
includes the database, while liveness is not coupled to database availability.

The image defaults JAVA_TOOL_OPTIONS to a 160 MiB maximum heap, Serial GC, a 32 MiB code cache,
16 MiB direct-buffer limit and 512 KiB thread stacks. It retains non-root execution and the pinned
Stockfish binary. Production defaults are one Stockfish process/thread, an 8 MiB hash,
three database connections, 24 Tomcat threads and a smaller analysis cache.
Optional tuning names: JAVA_TOOL_OPTIONS, STOCKFISH_POOL_SIZE, STOCKFISH_THREADS, STOCKFISH_HASH_MB.
Keep the supplied small defaults initially. Hash memory is not Stockfish's total memory:
its embedded neural network and native allocations also consume RAM. A JVM heap limit likewise
does not cap total JVM RSS. **512 MiB operation is not proven by these settings.** Exercise
a chess hint/analysis after startup and observe memory, latency and restart/OOM behavior before
sharing the demo; upgrade the instance if it cannot run reliably. No engine feature was removed.

Forwarded headers remain disabled. Secure session/CSRF cookies are explicit and do not require
trusting a client-supplied X-Forwarded-Proto. Do not enable framework forwarding or guess proxy IP
ranges. Until a verified proxy trust chain is configured, per-address limits may be shared by
users behind Render's proxy; this is a conservative limitation, not an IP spoofing workaround.

## 3. Configure Vercel

| Setting | Value |
| --- | --- |
| Repository / branch | Existing cyan-arcade / main |
| Root directory | frontend |
| Framework | Vite |
| Node.js | 24.x, matching the frontend container/tooling |
| Install | npm ci |
| Build | npm run build |
| Output | dist |

Set BACKEND_ORIGIN in the Vercel environment to the actual HTTPS Render origin, without a path
or credentials. It is used by vercel.ts at configuration time and by middleware at runtime.
It is not a browser VITE_ secret. Leave VITE_API_BASE_URL unset/empty: the browser must call its
own origin. No VITE_ variables are required for this deployment. Redeploy after changing either
service's environment configuration.

vercel.ts uses the official programmatic configuration support to avoid a hardcoded Render URL.
API rewrites retain /api/... and run before the SPA fallback; /actuator/health is proxied too.
Do not add a competing vercel.json or replace these rules with a single catch-all.
Reserve/confirm the actual Vercel production domain and enter that exact origin in Render CORS.
Avoid broad preview-origin wildcards. Give previews an isolated backend/database, or leave
their BACKEND_ORIGIN unset so preview configuration fails rather than using production data.

### AI asset authorization

Keep frontend/middleware.ts deployed. It executes before the Vercel cache/filesystem and calls
the existing Spring GET /api/ai/access with the requesting browser's cookies. Only an exact 204
allows /assets/ai/... to continue. Guests/users are denied, backend errors/timeouts fail closed,
and authorized asset responses are private/no-store. Spring's existing ADMIN checks remain.
The build also fails if a game AI module escapes the protected asset directory.
This mirrors nginx auth_request; it does not rely on a client route guard and does not move
game logic into a new service. Never deploy dist alone to an unguarded static host.
Local Vite and Docker/nginx retain their existing behavior.

## 4. Verify sessions, CSRF and assets after deployment

Use one Vercel production hostname throughout:

1. Load /actuator/health and a direct SPA deep link, e.g. /games/chess.
2. Inspect the GET /api/auth/session response in browser developer tools.
   XSRF-TOKEN must be host-only for Vercel, Path=/, Secure, SameSite=Lax and readable by the page.
3. Register/login with test credentials. CYAN_SESSION must be host-only, Secure, HttpOnly,
   Path=/ and SameSite=Lax. No cookie Domain should name Render.
4. Confirm the browser continues to call Vercel /api/...; requests include cookies.
   Mutating requests must carry X-XSRF-TOKEN from the current cookie. Check a permitted action,
   page reload/session restoration, and logout. A missing CSRF header must produce 403.
5. From a guest and then a USER session, request an actual built /assets/ai/... URL:
   expect 401/403, including after an admin previously loaded it. An ADMIN session may download it.
   Inspect Cache-Control and ensure no shared cache serves the authorized response.
6. Keep Render health/readiness UP and check logs for Flyway success, no startup imports,
   no unintended admin creation, and no memory-driven restarts.

Host-only Set-Cookie headers pass back through the same-origin rewrite; Cookie and
X-XSRF-TOKEN travel on subsequent requests. There is no cross-site cookie requirement and no
SameSite=None change. These live browser/CDN checks remain necessary: local tests do not
prove the deployed Vercel adapter, proxy and TLS behavior.

## 5. Provision an admin deliberately

Admin seeding is disabled by default. If needed, set ADMIN_SEED_ENABLED=true plus a unique
ADMIN_USERNAME and a new strong ADMIN_PASSWORD in Render **before the first deployment**.
This avoids someone registering the intended name before provisioning. After confirming
creation, set ADMIN_SEED_ENABLED=false and remove the two seeding credentials, then redeploy.
The stored account remains. These variables never reset an existing account or promote a USER.
Do not reuse the legacy credential from Git history/local backups. Existing accounts using it
require a separately authorized password change; editing an environment variable is insufficient.

## Known free-demo limits and references

- Render Free sleeps after 15 idle minutes and can take about a minute to wake. An AI asset
  authorization timeout returns 503; allow the backend to wake and retry rather than bypassing it.
- Sessions, request budgets and in-memory jobs are lost/paused when the backend restarts or sleeps.
  PostgreSQL data persists in Neon. Login persistence across restarts is not implemented.
- Daily challenges are generated again at startup; other timers do not run while stopped.
- Shared free-instance hours, build/bandwidth allowances and Vercel middleware usage limits apply.
  Free hosting is appropriate for a portfolio preview, not an availability guarantee.
- Real TCG catalog data and an admin account are separate setup choices, not development seeders.

References: [Vercel rewrites](https://vercel.com/docs/routing/rewrites),
[programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts),
[routing middleware](https://vercel.com/docs/routing-middleware),
[Neon TLS](https://neon.com/docs/connect/connect-securely),
[Render health checks](https://render.com/docs/health-checks),
[Render Free limits](https://render.com/docs/free).

Focused local checks (no database required):

~~~sh
cd backend
./mvnw -B -Dtest=ProductionDeploymentTests,DeploymentCookieSecurityTests,RequestRateLimitSecurityTests,TrustedProxyTests test
cd ../frontend
npm test -- src/deployment.test.ts src/api/client.test.ts
npm run build
~~~

Review and commit these files separately when ready; no deployment is performed by this guide.
