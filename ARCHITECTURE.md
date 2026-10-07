# Architecture

Cyan Arcade is a **modular monolith**: one deployable backend and one SPA, split into modules with enforced boundaries. Microservices would add operational cost without any benefit at this scale. Clear module boundaries keep the option to extract a module later.

```text
Browser (React SPA)
  ├── Platform UI: hub, catalog, challenges, shop, leaderboards, profile, admin, sign-in
  ├── Game modules: games/snake, games/2048, games/tetris     (game loops run here)
  └── Card game module: tcg/                                  (loaded on demand under /tcg)
          │  HTTPS → nginx: static files, and /api proxied to the backend
          │  card images straight from the card games' image hosts (TCGdex, OPTCG API)
          ▼
Spring Boot (modular monolith, package by feature)
  ├── common/   errors · security · time · scheduling · platform (contracts with modules)
  ├── platform: game/  score/  leaderboard/  user/  auth/  profile/  progression/  challenge/
  ├── gamerules/: each game's server-side rules (RunRules), nothing else
  │             economy/  dailylogin/  shop/  admin/
  └── tcg/      game · set · card · pack · opening · collection · dataimport
          │  JPA (platform) and JdbcClient (tcg, set-based work) · Flyway owns the schema
          ▼
PostgreSQL ◄── import job (tcg.dataimport, run on demand) ◄── TCGdex · OPTCG API
```

## Guiding rules

1. **The platform is game-agnostic.** Platform code never contains a specific game's logic or UI. The hub renders every game from one type, `GameDefinition`.
2. **Games are independent.** A game module may use the platform, never another game.
3. **Game loops never hit the network.** Client-side games run entirely in the browser and submit one result at the end of a run. The server owns *truth that matters*: identity, persisted scores, randomness for rewards (TCG), and collections.
4. **Don't trust the client.** Scores are tied to server-issued game sessions and validated centrally, against each game's own rules and the time the server measured. Who a player is comes from the server-side session, never from the request. The design leaves room for server-side replay verification later.
5. **Keep it simple.** Build abstractions when a second use appears, not before. Create packages and tables when a feature needs them.

## The game catalog: one source of truth

Game metadata lives in **one place, the backend `games` table**. The frontend doesn't keep a second copy of names, descriptions, or colors.

| Where | Holds | Changes by |
| ----- | ----- | ---------- |
| Backend `games` table | slug, name, description, category, thumbnail URL, accent color, active flag, display order, featured flag | Flyway migration |
| Frontend `games/registry.ts` | the playable implementation per slug: root component and control schemes | Code |
| Frontend `public/thumbnails/` | card artwork referenced by `thumbnail_url` | Asset file |

The two halves are joined by slug in `toGameDefinition`:

```ts
interface GameDefinition {
  slug: string
  name: string
  description: string
  category: GameCategory
  accentColor: string      // '#22c55e', applied through the --accent CSS variable
  thumbnail: string
  featured: boolean        // in the spotlight on the home page
  module?: GameModule      // undefined while the game is "coming soon"
}
```

A game that is in the catalog but has no registered module is listed as "coming soon". Snake, 2048, and Tetris all have modules and are playable. Setting `active = false` hides a game everywhere.

## Frontend

```text
src/
  app/          App.tsx (providers), routes.tsx, queryClient.ts
  api/          client.ts (fetch wrapper + ApiError + CSRF header), auth.ts, profile.ts, games.ts,
                gameSessions.ts, leaderboards.ts, dailyChallenges.ts, economy.ts (coins, daily login, shop),
                admin.ts, system.ts
  components/   ui/ (Button, Card, Badge, Modal, Avatar, RankBadge, PageHeader, LoadingState, EmptyState,
                ErrorState, CoinAmount), GameCard, GameGrid, DailyChallenges, DailyLogin, PlayerStrip, ItemIcon,
                LeaderboardPreview, JumpBackIn, ApiStatus, brand/Logo
  hooks/        useGameCatalog, useRecentGames, useScoreSubmission, useCountdown, useDocumentTitle
  layouts/      AppLayout (header nav with the coins and the signed-in player, mobile tab bar, footer), navigation.ts
  pages/        Home, Games, GameDetail, Challenges, Shop, Leaderboard, Admin (+ AdminDashboard),
                profile/ (ProfilePage and its sections),
                auth/ (Login, Register, the shared AuthForm), NotFound, RouteError
  lib/          tiny utilities
  styles/       Tailwind entry + design tokens
  games/        types.ts, registry.ts, shared/ (hooks and UI all games use), and one folder per game
  tcg/          the card game module: api.ts, routes.tsx, TcgLayout, pages/, opening/, components/
  test/         test setup, fake API, render helpers
```

| Route          | Page | Status |
| -------------- | ---- | ------ |
| `/`            | The hub: hero, the player's coins, level and daily reward, daily challenges, recently played, featured games, card packs, top scores, recent achievements, categories | Live |
| `/games`       | Full catalog with a category filter | Live. The filter is in the URL (`?category=puzzle`) |
| `/games/:slug` | Game detail, today's challenge for the game, and the play area | Live; hosts the game, or shows "coming soon" if it has no module yet |
| `/challenges` | The daily login reward (a 7-day run) and today's challenges | Live. Guests see the challenges and an invitation to sign in |
| `/shop`       | Extra card packs, badges, titles, profile frames and game skins for coins, filtered by category (`?category=packs`, `badges`, `titles`, `frames`, `skins`); what each item means for the player (locked, too dear, owned, equipped); the day's free and bought packs; the player's items, to equip and unequip | Live. Guests see what is for sale |
| `/leaderboard` | Per game and period (today, this week, all time): the player's own rank, a podium for the top three, the rest in a table | Live. Game, period and page are in the URL (`?game=2048&period=weekly&page=2`) |
| `/players/:username` | A player's public profile: display name, @username, bio, worn title and badge, statistics, rankings, best scores, achievements; the owner gets Edit profile | Live. `404` shows "Player not found" |
| `/profile`     | Level and XP progress, coins, the badge and title worn, statistics (platform, card game, per game), recent games, coin history, achievements, avatar, log out | Live. Guests see an invitation to sign in instead |
| `/admin`       | The arcade at a glance, AI mode, unlimited packs, coin grants | Admins only; everyone else sees "Admins only", and the data is admin-only on the server |
| `/login`, `/register` | Auth forms | Live. `?redirect=/games/snake` returns the player to where they came from (same-site paths only) |
| `/tcg/...` | Card packs: games, sets, packs and opening, collection, history | Live. See [The card game module](#the-card-game-module-tcg) |

- **Server state** lives in TanStack Query. Each `api/*.ts` file exports fetchers, query keys, and hooks. Nothing else calls `fetch` directly.
- **Errors**: `apiFetch` turns every non-2xx response into an `ApiError { status, code, message, fieldErrors }` parsed from the backend's problem-detail body. Queries don't retry 4xx errors.
- **States**: every data-driven section has a loading state (skeleton cards or `LoadingState`), an error state with retry (`ErrorState`), and an empty state (`EmptyState`).
- **Proxy detail**: nginx forwards the `Host` header with its port (`$http_host`). Without the port, the backend would see the site's own `POST` requests as cross-origin and reject them.
- **Origin**: the SPA calls relative URLs by default. Vite proxies `/api` and `/actuator` in development, and nginx does the same in Docker. Setting `VITE_API_BASE_URL` makes it call the backend directly, which the backend's CORS configuration allows for `http://localhost:5173`.
- **Who is signed in** is server state like any other: `useSession()` reads `GET /api/auth/session`, and logging in, registering and logging out write the answer into the query cache. No token is kept in JavaScript or `localStorage`; the session cookie is `HttpOnly`. Logging out also drops every cached `/api/users/me` answer, so the next person at the same browser never sees the previous player's profile.
- **CSRF**: for every request that changes something, `apiFetch` copies the `XSRF-TOKEN` cookie into the `X-XSRF-TOKEN` header, reading the cookie each time because the server replaces the token at sign-in. If there is no cookie yet it asks for one first.

### The game hub

The home page is assembled from independent sections. Each one loads its own data and has its own loading, empty and error state, so one slow or failing request never blanks the page.

| Section | Data | Notes |
| ------- | ---- | ----- |
| Your progress (`PlayerStrip`) | `GET /api/users/me/coins`, `/api/users/me`, `/api/daily-login` | Signed in only: coins, level progress, and today's login reward with its claim button |
| Daily challenges (`DailyChallenges`) | `GET /api/daily-challenges`, or `/me` when signed in | Each card takes its color from its game. A countdown shows when the next set arrives and the list reloads when it does. The day and the reset time come from the server |
| Jump back in (`JumpBackIn`) | `localStorage` | The games played last on this device (`lib/recentGames.ts`), recorded when a human run starts. Per device, like the in-game best score, so it works for guests. Hidden until there is something to show |
| Featured games | The catalog | Games with `featured = true`; the first three if none are marked |
| Top scores (`LeaderboardPreview`) | `GET /api/leaderboards/{slug}` | The first page of the real leaderboard, so it shares its cache with the leaderboard page |
| Recent achievements | `GET /api/users/me/achievements` | Signed in only, and only once there is one: the three latest unlocks |
| Browse by category | The catalog | Only categories that have games; links to `/games?category=…` |

Nothing on the hub names a game: every section renders from the catalog and the API. A new game shows up in all of them by being added to the catalog.

### Design system

Tokens are CSS variables declared in `src/styles/index.css` (`@theme`), and each one also generates Tailwind utilities:

| Group | Tokens | Example utilities |
| ----- | ------ | ----------------- |
| Brand | `--color-brand-50…900` (cyan) | `bg-brand-500`, `text-brand-700` |
| Background and surfaces | `--color-canvas`, `--color-surface`, `--color-surface-muted`, `--color-line` | `bg-canvas`, `border-line` |
| Text | `--color-ink`, `--color-ink-soft` | `text-ink-soft` |
| Radius | `--radius-control`, `--radius-card` | `rounded-card` |
| Shadows | `--shadow-soft`, `--shadow-lift` | `shadow-soft` |
| Spacing | `--spacing-gutter`, `--spacing-section`, `--container-page` | `px-gutter`, `gap-section`, `max-w-page` |
| Typography | `--font-display` (Fredoka), `--font-sans` (Nunito), `--text-hero`, `--text-title` | `font-display`, `text-hero` |

Cyan is reserved for **platform** chrome. A game's color comes from the catalog: its card and page get `accentStyle(color)` (`lib/accent.ts`), which sets `--accent` and `--accent-ink`, and components inside use `bg-(--accent)` with `text-(--accent-ink)`, or `<Badge tone="accent">`. No component hardcodes a game's color.

**Contrast.** `--accent-ink` is white or the dark ink, whichever reads better on the accent, by the WCAG formula. The arcade's own cyan carries dark text (white on it is only 2.4:1), the card game's purple and pink carry white, and the accent colors of the catalog are chosen so that the better of the two reaches 4.5:1 (`lib/accent.test.ts` checks them).

Interaction feedback is kept to a few shared patterns:

- **Buttons** (`buttonStyles`) rise slightly under the pointer and their solid bottom edge collapses when pressed.
- **Clickable cards** (`interactiveCard`) lift, deepen their shadow and pick up the accent color in scope, then settle when pressed.
- **Lists of cards** arrive one after the other with a short pop-in.
- **Pages** fade in with a small rise on navigation. The wrapper is keyed by path, so changing a filter or a page number in the query string does not replay it.

Decorative animation uses `motion-safe:`, and a global `prefers-reduced-motion` rule neutralizes the rest. `Modal` uses the native `<dialog>` element, which provides focus trapping and Esc-to-close. The main area clips sideways overflow, so decoration that reaches past the edge (a card's glow, a burst) never makes the page scroll.

### Game module contract

```ts
interface GameModule {
  slug: string                          // same slug as the backend catalog
  controls: { keyboard: boolean; touch: boolean }
  Component: ComponentType<GameProps>   // lazy(() => import('./SnakeGame'))
  loadAi?: () => Promise<() => GameAI>  // () => import('./ai/snakeAi').then((ai) => ai.createSnakeAi)
  cosmetics?: { slots: Record<string, string>; Preview: ComponentType<{ slot; skinId }> } // for a game with shop skins
}

interface GameProps<Ai> {
  onGameStart(): void                    // a human run began
  onGameOver(result: GameResult): void   // it ended: { score, durationMs, metadata? }
  ai?: () => Ai                          // the game's AI, for admins only; without it, no AI mode
  cosmetics?: GameCosmetics              // its shop skins, owned and worn, and equip(slot, itemId | null)
}
```

A module is declared with `defineGameModule`, which checks that its `loadAi` gives the AI its component expects. `GameDetailPage` loads the definition by slug, applies its accent, and renders `module.Component` inside `Suspense`, with `ai` from `useGameAi` (admins only, see [AI mode](#ai-mode)). Each game ships in its own bundle chunk. When a run ends, the game calls `onGameOver` and the platform takes care of score submission. A game knows nothing about accounts, XP or achievements.

**Game skins.** A module that declares `cosmetics` gets `cosmetics` from `useGameCosmetics`: the shop's `GAME_SKIN` items for its slug, whether the player owns and wears each, and `equip(slot, itemId | null)` (`null` goes back to the game's own look), which the platform sends to the ordinary inventory endpoints. The game never buys or grants anything; it links to `/shop?category=skins`. The shop and the inventory draw a skin with the module's lazy `Preview`, so only the game knows what its skins look like. A skin must never change how a game plays.

### Inside a game module

Rules, AI and UI are three separate layers. Only the last one knows about React.

```text
games/snake/
  index.ts            # exports the GameModule (controls + lazy Component)
  SnakeGame.tsx       # rendering: lays out the screen from what the hook returns
  components/         # SnakeBoard: draws a state, nothing else
  hooks/              # useSnakeGame: game state, the loop, input handling, Human and AI controllers
  engine/             # game rules as pure functions: createSnakeGame(seed), updateSnake(state, action) → state
  types/              # the data model: SnakeState, SnakeAction, Direction, Point
  ai/                 # pure decision-making: getNextAction(state) → action
```

So the four concerns are separate: **rules** (`engine/`), **state** (`types/`, held by `useEngine`), **input handling** (`hooks/`), and **rendering** (`components/` and `SnakeGame.tsx`). `2048/` (`useGame2048`, `Board2048`) and `tetris/` (`useTetrisGame`, `TetrisBoard`, `NextPieces`, `TouchControls`) have the same layout.

Real-time games differ only in what drives the engine. In Tetris, gravity is just another action (`TICK`) sent on a timer whose delay shrinks with the level, and the on-screen touch buttons send the same actions as the keyboard, repeating while held.

**Engines** are pure and deterministic: `update(state, action)` returns a new state and never touches React, timers, the DOM, or `Math.random`. Randomness comes from a seed kept in the state (`games/shared/random.ts`), so the same state and action always give the same result. That is what lets a human, an AI, the tests, and a future replay or score-verification system all use one engine.

**One engine, two controllers.** Human and AI modes are not separate implementations:

```text
             Game engine  (update(state, action))
              ▲                        ▲
   Human controller              AI controller
   key / swipe / gravity         ai.getNextAction(state), on a timer
              └──────── same state ────────┘
```

Both call the same `dispatch(action)` from `useEngine`. Switching mode starts a fresh game, so a human run is never partly played by the AI. Only human runs call `onGameOver`.

### Score keeping

Games never call the API, and none of them contains score-reporting code of its own. Every game uses the same `useHumanRun` hook, which gives it `begin()`, `finish(score)` and `reset()`. Through it the game reports two things to the platform via its props: `onGameStart()` when a human run begins and `onGameOver(result)` when it ends. `useScoreSubmission` (used by `GameDetailPage`) turns that into the server flow:

```text
first input   → onGameStart() → POST /api/game-sessions              → session id
game over     → onGameOver()  → POST /api/game-sessions/{id}/finish  → recorded score
```

- The page shows the outcome under the game: saving, saved, or failed with a retry when retrying can help.
- A run that ends before the session request has returned still gets submitted once it does.
- A run begins exactly once and ends exactly once, even if several inputs or ticks arrive before the screen updates (`useHumanRun`).
- A saved score marks that game's leaderboard and the player's profile as out of date, so they are refetched the next time they are shown.
- The numbers a game puts in `GameResult.metadata` (Tetris: `lines`, `level`; 2048: `highestTile`) are sent along as `details`. The backend uses them to decide achievements.
- For a signed-in player the response carries `rewards`, and the page shows them under the game: XP earned, a new best for the account, achievements unlocked, a new level. A guest sees a link to log in that comes back to the same game.
- The guest id (`lib/playerId.ts`) is sent with the session so the leaderboard can point out a guest's own scores.
- AI runs report nothing, and switching mode restarts the game, so only human play is recorded.
- The backend is the only place that validates a score or awards anything (see Backend).
- The "Best" score shown inside a game is kept per device in `localStorage` (`useHighScore`). It is a convenience, not a record, and it can differ from an account's best, which is why the reward badge says "New account best".

### AI mode

Every AI implements one small interface and lives with its game:

```ts
interface GameAI<State, Action> {
  getNextAction(state: State): Action
}
```

There is no shared algorithm. The AIs are classic, deterministic game-playing algorithms that run locally in the browser. They use no external service and no machine-learning model.

**AI mode is for admins.** Because the AIs run in the browser, what is guarded is the AI's code itself:

1. Nothing in a game imports its AI. Only the module's `loadAi` reaches it, with a dynamic `import()`, so the build puts each AI in a file of its own under `assets/ai/` (`vite.config.ts`). A test rejects any static import of an AI from game code.
2. `useGameAi` (the platform) calls `loadAi` only for a session whose role is `ADMIN`, and only after `GET /api/ai/access` has answered `204`; a player gets `403`, a guest `401`. It passes the AI to the game as `ai`; without it the game shows no Human/AI switch.
3. nginx serves `/assets/ai/*` only through `auth_request` to that same endpoint, with the request's own session cookie, so a player cannot download the AI by its address either. (The Vite dev server has no such check.)

| Game | Algorithm | Key files |
| ---- | --------- | --------- |
| Snake | Hamiltonian cycle with safe shortcuts; falls back to BFS pathfinding, a "can the head still reach the tail" safety check, and flood fill | `ai/snakeAi.ts`, `ai/hamiltonian.ts`, `ai/pathfinding.ts` |
| 2048 | Depth-limited expectimax over move and tile-spawn nodes, with a transposition table and a heuristic evaluation (empty cells, merge opportunities, monotonicity, tile weight) | `ai/expectimax.ts`, `ai/bitboard.ts` |
| Tetris | Enumerates every reachable placement by replaying real engine actions, looks one piece ahead, and scores the resulting stack (aggregate height, holes, bumpiness, lines cleared) | `ai/placements.ts`, `ai/evaluation.ts`, `ai/tetrisAi.ts` |

**Speed is not difficulty.** The speed control (0.25x to 8x) only changes the delay between AI actions (`aiActionDelay(baseDelay, speed)`). Search depth and evaluation never depend on it, and a test asserts that each game reaches the identical position at different speeds.

**Performance.** All three AIs run on the main thread, because each decision is small and bounded:

- Snake: a few array scans per step.
- 2048: search depth is fixed at 2 or 3 tile spawns depending on how full the board is, and improbable branches are pruned. Measured at about 7 ms per move on average.
- Tetris: at most about 34 × 34 simulated placements per piece, about 5–8 ms, computed once per piece and then reused for the few actions it takes to carry out.

If a future AI needs more, a Web Worker can be added behind the same `GameAI` interface.

### Shared game pieces (`games/shared/`)

Game-agnostic building blocks that every game module uses:

| Piece | Role |
| ----- | ---- |
| `useEngine` | Binds a pure engine to React and exposes `dispatch` and `getState` |
| `useFrameLoop` | An animation-frame loop for real-time canvas games (Brick Breaker): real time per frame, capped at 100 ms, stopped on pause and unmount |
| `useTicker` | The one timer for game loops and AI playback. It schedules the next call only after the current one returns, and clears itself on pause, restart, and unmount |
| `usePlaySession` | Mode (human or AI), AI speed, paused |
| `useKeyboard`, `useSwipe` | Keyboard and touch input |
| `useHumanRun` | The life cycle of a human run: begin once, finish once, track the best score. Built on `useRunStart` and `useHighScore` |
| `GameShell` | The common frame: board, Human/AI toggle, stats, AI panel or controls help, pause and restart |
| `PlayModeToggle`, `AiPanel`, `AiSpeedControl`, `BoardOverlay`, `DirectionPad` | The parts of that frame |
| `random.ts`, `ai.ts` | Seeded random numbers; the `GameAI` interface and speed presets |

**Enforced by tests.** `games/architecture.test.ts` reads the source files and fails if an engine, AI or type file imports React, the API or the UI, touches the DOM, timers or storage, or uses `Math.random` or the clock; if a game imports another game; if a game calls the API itself; or if anything outside `tcg/` uses the card game module other than through its routes and its hub banner.

### The card game module (`tcg/`)

The trading-card game is a module of its own, not a game in the catalog: it has no score, no Human/AI mode and no `GameModule`. The app knows two things about it: the route object `tcgRoutes` mounted in `app/routes.tsx`, and `TcgHubBanner`, shown on the home and games pages.

```text
tcg/
  routes.tsx, lazyPages.ts   /tcg/* routes; the pages are one chunk fetched on first visit
  TcgLayout.tsx              purple accent, Packs / Collection / History navigation, packs left today
  api.ts                     types, query keys and hooks for /api/tcg (the player's own data under the user's keys)
  accent.ts                  a card game's own color (`gameAccent`), purple when it has none
  pages/                     TcgHome, TcgGame, TcgSet, TcgPack, TcgCollection, TcgOpenings
  opening/                   openingMachine.ts (pure) and PackOpening.tsx (the staged reveal)
  components/                CardFace and CardBack, CardImage, PackArt, SetBanner, Attribution, CardTile,
                             CardDetail, RarityBadge, CompletionBar, ...
  rarity.ts                  how each rarity tier looks
```

| Route | Page |
| ----- | ---- |
| `/tcg` | "Choose your TCG": the card games, and how complete the player's collection is |
| `/tcg/:gameSlug` | A game's sets, grouped by series, each with the player's progress |
| `/tcg/:gameSlug/:setCode` | A set: its packs, and a gallery of its cards with owned and missing ones marked |
| `/tcg/packs/:packId` | A pack: open it, and its odds in the open |
| `/tcg/collection` | Owned cards with quantities, completion overall and per set (`?game=` and `?set=` narrow it) |
| `/tcg/openings` | Opened packs, newest first, with the cards each gave |

**Opening a pack** is a small state machine (`openingMachine.ts`) driven by the server's answer, a timer and the player:

```text
sealed ──open──► requesting ──opened──► tearing ──torn──► revealing ──last card──► results
   ▲                │                                                              │
   └────failed──────┘◄─────────────────────────open another───────────────────────┘
```

The request goes out first and the animation starts only once the server has answered, with the cards already in the collection. The animation never decides anything: closing the page during it loses nothing, the cards are shown in the order the server sent them, and the tear is skipped for players who ask for reduced motion. A card is flipped with a 3D transform of a wrapper that holds both faces; rarer cards add a burst in their tier's color, and the rarest shimmer with a bar of light moved by `transform` alone.

**Rarity tiers.** Each card game names its own rarities. The platform only understands the tier, 1 to 5, and styles by it (`rarity.ts`), so a new game with "Secret Rare" or "Super Rare" needs no frontend change.

**Real cards on screen.**
- *Each game in its own color.* A game's pages, buttons, completion bars and card backs take its `accentColor` (Pokémon yellow, One Piece red) through `--accent` and the readable `--accent-ink`; the card hub stays purple and the arcade stays cyan.
- *Images as the sources serve them.* Grids use a card's `thumbnailUrl` when the source has one (TCGdex's small image), a closer look and the pack opening the full image. Image hosts now and then answer with a momentary error, so `CardImage` asks once more after 1.5 s and then shows the card's name instead of a broken image.
- *No invented artwork.* The sources have no pack art, and the arcade does not make any up: `PackArt` draws a foil wrapper in the game's color around the set's real logo and one of its real cards (`SetBanner` does the same for sets). The card back is the arcade's own, never a publisher's.
- *Attribution.* Every page of a game ends with its `attribution`: where the data and images come from, whose they are, and that the arcade is not affiliated with them. A pack's `oddsNote` sits above its odds table.

## Backend

Packages are organized **by feature**, not by layer:

```text
com.cyan.arcade
  CyanArcadeApplication
  common/
    error/      GlobalExceptionHandler, Problems, ApiException (+ NotFound/Conflict), ErrorCodes
    security/   SecurityConfig, AuthenticatedUser (the principal), Role (USER, ADMIN), SpaCsrfTokenRequestHandler,
                GuestPlayer, CorsProperties, ProblemDetailSecurityHandler
    time/       TimeConfig (the server's UTC Clock)
    scheduling/ SchedulingConfig (switches every @Scheduled job on or off)
    platform/   contracts between the platform and modules it must not know: PlayerActivity (event),
                BonusPacks (extra card packs), ActivityStatistics (a module's numbers)
  game/         Game (entity), GameCategory, GameRepository, GameService, GameController, GameResponse (DTO), GameInfo
  user/         User (entity), Avatar, UserRepository, UserService, UserAccount, UserCredentials
  auth/         AuthConfig (password encoder, authentication manager), AuthService, AuthController,
                LoginAttemptLimiter, AdminAccountSeeder, request and response DTOs
  admin/        AdminController (/api/admin/**: overview, stats, user search, coin grants), AdminService,
                AiAccessController (/api/ai/access): admins only
  economy/      CoinService (the only way a balance changes), CoinStore, CoinTransactionType, CoinReference,
                CoinController (/api/users/me/coins, /transactions)
  dailylogin/   DailyLoginService, DailyLoginStore, DailyLoginProperties, DailyLoginController
  shop/         ShopService, ShopStore, ItemHandler with PackItems (also BonusPacks) and CollectibleItems,
                ShopController (/api/shop/**, /api/users/me/inventory)
  progression/  Levels, XpRules, RewardProperties, Achievement, AchievementCatalog, UnlockedAchievements,
                ProgressionService, Rewards, BonusSource and Bonus (how other features add rewards)
  challenge/    ChallengeTemplates, DailyChallengeGenerator, DailyChallengeScheduler, DailyChallengeStore,
                DailyChallengeBonuses, ActivityChallenges, DailyChallengeService, DailyChallengeController, DTOs
  score/        GameSession and Score (entities), their repositories, GameSessionService (writes), ScoreQueries (reads),
                GameSessionController, AbandonedSessionCleaner, DTOs; RunRules (the contract a game implements on
                the server) and RunValidator (picks a game's rules by its slug)
  gamerules/    one RunRules bean per game: SnakeRunRules, Game2048RunRules, TetrisRunRules, MinesweeperRunRules, FlappyBirdRunRules, BrickBreakerRunRules
  leaderboard/  LeaderboardService, LeaderboardController, LeaderboardPeriod (DAILY, WEEKLY, ALL_TIME and their
                UTC windows), LeaderboardResponse, PlayerRanks
  profile/      ProfileService, ProfileController, ProfileResponse, StatsResponse, GameHistoryResponse
  tcg/          the card game module, see below
```

Inside a feature: `XController` → `XService` → `XRepository`. Entities, repositories, and controllers are package-private. The service and its DTO records are the feature's public API for other features.

Dependencies point one way:

```text
profile ──► user, score, progression, game, economy, shop, leaderboard
leaderboard ──► score, user, game
score ──► progression, game
auth ──► user
challenge ──► progression, economy, game
progression ──► user, economy
dailylogin ──► economy, shop
shop ──► economy, progression, user
admin ──► user, score, economy, progression
tcg ──► common only (talks to the platform through common.platform)
```

`ArchitectureTests` (ArchUnit) enforces:

- Feature packages are free of dependency cycles.
- `common` depends on no feature.
- Controllers never touch entities or repositories, so JPA entities can't leak into API responses.
- Only `auth` and `user` may touch the password encoder or a stored password hash.
- Nothing outside `tcg` depends on `tcg`, and `tcg` uses nothing of the platform but `common`.
- The parts of `tcg` (game, set, card, pack, opening, collection, dataimport) are free of cycles among themselves.

**Score submission is centralized.** `GameSessionService` is the only way a score enters the system:

- A score can only be recorded by finishing a session that exists, is still open and was opened less than 24 hours ago (`410 SESSION_EXPIRED` after that).
- Only its owner can finish it: the signed-in player who started it, or, for a guest's run, a request with the same `X-Player-Id` it was started with. Knowing the session's id is not enough.
- The session row is locked while it is finished, so simultaneous attempts are handled one after the other and exactly one succeeds. A unique constraint on `scores.game_session_id` backs this up in the database.
- The server measures the run's duration itself, and judges the run with it (`RunValidator`): the score must be within the game's `max_score` (a column on `games`; `NULL` means no limit), and the game's `RunRules` must accept it. Each game states what any real run of it satisfies, worked out from its engine: the details it must report and how they relate to the score (a Snake is 3 cells plus one per apple; a 2048 score is a multiple of 4 and bounded by the highest tile and the moves; Tetris lines bound its score), and how fast it can be played (a Snake move every 70 ms at most, 25 moves of 2048 or 10 Tetris pieces a second). Only the game's own details go on to rewards. A refused run gets `400 SCORE_REJECTED` with a message that says nothing about why; the reason, the game, the session and whether it was a guest are logged as a warning.
- **The order inside the one transaction**: lock the session and check its owner, state and age; check the run; close the session; lock the player (`ProgressionService.lockPlayer`, the wallet's row lock) so their runs are judged one at a time; read their best score and games so far; decide and pay the rewards; record the score. If anything fails, nothing is left behind: no score, XP, coins, achievement or challenge progress.

Features refer to each other by id, not by entity: `score` stores a `game_id` and asks `GameService` for a `GameInfo`, so it never sees the `Game` entity.

**This is practical integrity protection, not anti-cheat.** The games run in the browser, so the server cannot replay a run; it can only refuse what no run could produce. A modified client that fakes a run slowly enough, with numbers that agree with each other, is still accepted. Closing that gap would mean recording each run's seed and inputs and replaying them on the server (the engines are deterministic, so this can be added inside `GameSessionService` later). Starting a session is public and not rate limited; unfinished sessions are cleaned up after a day.

**Leaderboards own no data.** `leaderboard` is a thin, read-only feature on top of `score`, with no table of its own and no way to write:

- **Periods** (`LeaderboardPeriod`) turn the server's clock into a window: `DAILY` from 00:00 UTC, `WEEKLY` from Monday 00:00 UTC, `ALL_TIME` without bounds. The window is computed with `ZoneOffset.UTC` explicitly, never the JVM's or the player's time zone, and is half-open (`start <= created_at < end`), so midnight belongs to the new day only.
- **Ranking** is one SQL query in `score.ScoreBoard` (the read side of `score`): the window's scores of the game, each competitor's best by `DISTINCT ON` (an account, else a guest's browser id, else the run itself), numbered by `row_number()` over `score DESC, created_at, id`. The order is total, so ranks are never shared and pages are stable; `LIMIT`/`OFFSET` and a `count(DISTINCT …)` page it in the database, and the caller's own rank is the same query filtered to them. Nothing is loaded into memory or stored.
- **Indexes**: the all-time board reads a game's scores through `(game_id, score DESC, created_at, id)`; the daily and weekly boards through `(game_id, created_at)` (V14).
- `LeaderboardService` adds names and avatars (one lookup per page), marks the caller's entry, and gives the profile each game's daily, weekly and all-time standing (`GET /api/users/me/ranks`). Leaderboards pay no rewards: placement is not connected to coins or XP.

**Guest identity.** A browser that is not signed in sends a random id in the `X-Player-Id` header (`GuestPlayer.HEADER`). It is stored with a guest's session and copied to its score, and is only ever compared with the caller's own id. It never appears in a response.

### Accounts and authentication

- **Sessions, not tokens.** Signing in creates a server-side HTTP session, and the browser holds only its id in the `CYAN_SESSION` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` behind HTTPS). For a browser app served from the same site as its API this is the simplest safe option: JavaScript can never read the credential, and logging out really ends the session on the server. JWTs would bring token storage, refresh and revocation problems without solving anything here.
- **Passwords** are hashed with bcrypt through Spring Security's delegating encoder, so each hash records its algorithm (`{bcrypt}…`) and the algorithm can be upgraded later without a migration. Hashes never leave `user` and `auth`: every other feature sees `UserAccount`, which has no password field at all. Request records that carry a password override `toString` so it cannot reach a log.
- **Login gives nothing away.** An unknown username and a wrong password produce the same response, and an unknown username still costs a hash comparison, so neither the answer nor its timing reveals which usernames exist.
- **Session fixation and CSRF.** Signing in changes the session id and replaces the CSRF token. Every request that changes something must send the token from the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header, which a page on another site cannot do. This applies to the public `POST` endpoints too.
- **The principal is tiny.** The session holds `AuthenticatedUser(id, username, role)`, defined in `common.security` so any feature can ask who is calling without depending on `auth`.
- **Roles.** Every account has exactly one `Role`: `USER` or `ADMIN`, stored in `users.role` and fixed when the account is created. Registering always makes a `USER`. At sign-in the role becomes the session's only authority (`ROLE_USER` or `ROLE_ADMIN`) and goes into the principal, so a role change takes effect at the next sign-in. Authorization always goes by the role, never by a username:
  - **Admin-only endpoints** (`/api/admin/**`, `/api/ai/**`) need `ROLE_ADMIN` in `SecurityConfig`, and their controllers say so again with `@PreAuthorize("hasRole('ADMIN')")` (`@EnableMethodSecurity`), so neither a forgotten URL rule nor a new handler opens them. A player gets `403 FORBIDDEN`, a guest `401 UNAUTHORIZED`; a test calls the controllers without the URL rules to prove the second check.
  - **Admin privileges inside a feature** are decided where the rule lives, from the principal's role: `PackOpeningService.hasDailyLimit(player)` is the one place that exempts admins from the daily pack allowance; nothing else about opening a pack differs.
- **The admin account** is created at startup by `AdminAccountSeeder` when no account has the configured username (`ADMIN_USERNAME`, `ADMIN_PASSWORD`; development defaults `admin` / `11112002`; `ADMIN_SEED_ENABLED=false` to skip). The password goes through the same encoder as every other one, and is never logged. The seed is idempotent: an existing account is never changed or recreated, and a player who registered the admin name first is not promoted (a warning is logged instead).
- **Identity and presentation.** `users.username` is the account: unique regardless of case, used to sign in, in profile links (`/players/{username}`) and to look a player up; it never changes. `users.display_name` is what other players see (header, leaderboards, profiles) and `bio` a few words; both are the player's to change, and display names need not be unique. Avatars stay one of eight built-in choices drawn by the app (no uploads, no storage).
- **Only your own data.** Every endpoint that reads or changes a player's own data is under `/api/users/me` and takes the player from the session. There is no endpoint that accepts a user id, so there is nothing to get wrong about who may read whose data. `PATCH /api/users/me` accepts the display name, bio and avatar, validated and tidied on the server (`UpdateProfileRequest`, plus check constraints in the database); anything else in the body is ignored, and nobody, admins included, can change another player's profile.
- **Public profiles.** `GET /api/users/{username}/profile` is the one read-only view of another player, built by `ProfileService` from the same sources as the own profile (statistics, achievements, the leaderboards' ranks, worn items), minus what is private: ids, coins and their history, inventory beyond what is worn, anything about sign-in.
- **Scores and ownership.** A run belongs to whoever started it: the signed-in player, or else the guest. Only that signed-in player can finish their session (`403` for anyone else). On leaderboards a signed-in caller is matched by account only, and a guest only against guests' scores, so people sharing a browser never see each other's scores as their own.
- **Login attempts are limited.** `LoginAttemptLimiter` counts failed logins per username and client address. After 5 within 5 minutes (configurable), further attempts for that pair are refused with `429 TOO_MANY_LOGIN_ATTEMPTS` **before the password is checked**, so a guesser learns nothing and costs no hashing; a successful login clears the count. Counting per pair keeps someone from locking a player out from another address. The counts are in memory, bounded to 10,000 pairs, and lost on restart: a speed bump, not a vault door. Behind the nginx proxy every request comes from the proxy's address, so there the limit is effectively per username.
- **Usernames use their index.** Lookups compare `lower(username)`, written out in the repository, so they are served by the unique index on `lower(username)`. A derived "IgnoreCase" query would compare `upper()` and scan the table.

### Progression: XP, levels, achievements

`progression` is the only place that knows any reward rule. `GameSessionService` describes a finished run to it as a `CompletedRun` (who, which game, the score, the numbers the game reported, whether it was a personal best, how many games the player has now finished) and gets back `Rewards`. Controllers and games contain no reward logic.

- **XP** (`XpRules`): 10 for finishing a game, 25 more for beating your own best in that game, plus the XP of any achievement unlocked.
- **Coins** (`RewardProperties`, configurable): 5 for finishing a game (the first 40 games of a day only, so very short runs cannot be farmed), 15 more for a best (the first 10 new bests of a day only, so a string of runs each a point better than the last cannot be farmed; later bests still earn their XP), plus each achievement's and bonus's coins. Progression decides them and pays them through `CoinService`, each with a reference to what it rewards (the session, the achievement code, the challenge), so a repeat pays nothing.
- **Levels** (`Levels`) are derived from XP and never stored: level `n` starts at `100 · n · (n − 1) / 2` XP, so each level takes 100 XP more than the last.
- **Achievements** are data: a code, a name, a reward (XP and coins) and a rule, which is a function of one `CompletedRun`. `AchievementCatalog` lists them, and most are one line:

  ```java
  Achievement.forDetail("TETRIS_40_LINES", "Marathon", "Clear 40 lines in one game of Tetris.", Reward.of(250, 400), "tetris", "lines", 40)
  ```

  Adding an achievement means adding a line there. Unlocking, XP, the API and the profile page all work from the list.
- **Once only.** Unlocking is an `INSERT … ON CONFLICT DO NOTHING` on `(user_id, achievement_code)`, and XP is added with a single `UPDATE`, so two runs finishing at the same moment cannot award an achievement twice or lose XP.
- **Same transaction.** The score, the XP, the coins and the achievements are written together when a session is finished. What a run earned is stored on its score row, which is how the game history can show it later.
- Guests get their score recorded and earn nothing.

### Daily challenges

Each day every game in the catalog has one challenge, and so does every **activity** (something done outside the games, such as opening card packs). A game's challenge is met by a single run: finish a game (`PLAY`), reach a score (`SCORE`), or reach a value in a number the game reports (`DETAIL`, e.g. `lines`). An activity's is met by doing it `target` times in the day (`COUNT`). Each pays XP and coins.

- **Templates are data.** `ChallengeTemplates` lists what each game can be given, one line per challenge, plus challenges that fit any game. A game with no lines of its own still gets one every day.
- **Rotation is deterministic.** A game's templates take turns by date, so a day always produces the same set, every template comes around, and tomorrow's is never today's.
- **A scheduled job creates them.** `DailyChallengeScheduler` runs at startup and at midnight UTC (`@Scheduled`, in process) and makes sure today's and tomorrow's challenges exist. Tomorrow's are created a day ahead, so a new day never starts without challenges even if one run fails. Generation is idempotent (a unique `(challenge_date, game_id)` with `ON CONFLICT DO NOTHING`), which is also why several instances running the job would be harmless. There is no distributed scheduler or lock.
- **Rows are snapshots.** A generated challenge stores its own title, description, goal and reward, so past days stay meaningful when templates change.
- **The server's date, always.** "Today" is `LocalDate.now(clock)` with a UTC `Clock` bean. No endpoint accepts a date, and a run counts for the day on which it finishes.
- **Completion goes through progression.** `progression` defines a small interface, `BonusSource`, and asks every implementation what a finished run earned. `DailyChallengeBonuses` answers with today's challenges for that game that the run met and the player had not completed. So XP is still granted in exactly one place, in the same transaction as the score, and `progression` does not depend on `challenge`.
- **Once only.** Completing is an `INSERT … ON CONFLICT DO NOTHING` on `(user_id, daily_challenge_id)`, and the coins refer to the challenge.
- **Activities are events.** A module reports what a player did as a `PlayerActivity` (defined in `common.platform`), published in its own transaction; the card game publishes `TCG_PACK_OPENED` for every opening. `ActivityChallenges` listens, adds one to the player's `daily_challenge_progress` for today's challenge of that activity (an atomic upsert), and on reaching the target completes it and has `ProgressionService.award` pay it, all in the opening's transaction. The module never learns that challenges exist, and a new activity is a new event type plus a line in `ChallengeTemplates`.

Rules that depend on a game's own numbers (`lines`, `highestTile`) use the `details` the client reports, after the server has checked them against the score and the time (see score submission above) and kept only the game's own. A refused run reaches neither achievements nor challenges.

### The economy: coins, the daily login reward, the shop

Coins are a platform service, not a feature of any game: `economy.CoinService` is the only code that changes a balance, and every feature that pays or charges goes through it. There is no "Snake coins" or "Tetris coins" code: a new game earns coins by finishing sessions, like every game.

- **A ledger with a balance beside it.** `coin_transactions` holds every change (signed `amount`, `balance_after`, `type`, `reference_type`/`reference_id`, `description`, `created_by` for admin grants); `user_wallets` holds the balance for cheap reads. Both are written in the caller's transaction, so they cannot disagree.
- **One change at a time per player.** Every change first locks the player's wallet row (`INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE`). Under that lock it checks the new balance (never below zero, else `409 INSUFFICIENT_COINS` and nothing changes), inserts the ledger row and sets the balance. A `CHECK (balance >= 0)` backs it up in the database.
- **Paid once.** A unique index on `(user_id, type, reference_id)` lets a player have one transaction of each type per thing: a game session, an achievement code, a challenge id, a day, a purchase id, an admin's request id. A second credit for the same reference returns nothing and pays nothing, whoever asks and however often.
- **The server sets every amount**, from configuration and data: `RewardProperties`, the achievement catalog, the challenge rows, `DailyLoginProperties`, the shop's prices. The only amount a request carries is an admin's grant, which is validated (1 to 100,000), admin-only, and recorded with the admin.
- **The daily login reward** (`dailylogin`): one `daily_logins` row per player and UTC date, whose primary key refuses a second claim (`409 DAILY_LOGIN_ALREADY_CLAIMED`), even at the same moment. The streak is yesterday's plus one, or one after a missed day; the coins come from a configurable list (50 … 200 over 7 days), and the last day adds a shop item (an Extra Pack) through `ShopService.give`.
- **The shop** (`shop`): items are rows in `shop_items` (type, price, units per purchase, how many one may own, the level that unlocks it). A purchase locks the wallet, finds an earlier purchase with the same client request id (and answers with it, `repeated`), checks level and ownership, records the purchase, debits the price and calls the `ItemHandler` for the item's type, all in one transaction. `PackItems` keeps packs as a count in `user_inventory` and is the platform's `BonusPacks`; `CollectibleItems` handles badges, titles, cosmetics (profile frames) and game skins: one owned, one of each kind worn, the first one put on straight away. `SkinAccess` lets an admin (by the account's role on the server) wear any active skin of the games it lists (Brick Breaker) without owning it: no purchase, no coins, and an inventory row with a quantity of 0 that only records what is worn (one per slot, removed when taken off), so it never counts as owned. A kind is the type, and for a game skin also its `game_slug` and `slot`, so a Flappy Bird bird, its pipes and a profile frame are worn side by side. Each `ItemHandler` also says whether its items are equippable and consumable; the catalog and the inventory pass that on, with what the player owns, wears and can afford, so the app never decides any of it by type.
- **Rewards in one place.** Every coin reward (a game, a personal best, an achievement, a daily challenge, the daily login, an admin's grant) is a ledger entry with a type and a description, so `GET /api/users/me/transactions` is the player's reward history; there is no second record of rewards. An item won with coins (the day 7 pack) is named in that entry's description. The shop's frontend shows the card game's daily allowance through a panel the card game module provides (`tcg/components/PackAllowancePanel`), as it does the hub banner, so the platform still knows nothing else about the card game.
- **Extra packs reach the card game through `common.platform.BonusPacks`.** `PackOpeningService` asks for one only when a player's daily allowance is used up, inside the opening's transaction and its per-player lock, so a failed opening keeps the pack. Admins have no allowance and never use one. The card game does not know the shop exists.
- **Statistics** come from the features that own them: `ScoreQueries` (per game: games, best, average, play time, last played, one `GROUP BY` over the player's scores through the `(user_id, game_id)` index), `CoinService` (balance, coins earned), progression (achievements) and every `common.platform.ActivityStatistics` bean (the card game's packs opened and cards collected). The profile asks for them on its own endpoint, not on every page.
- **The admin dashboard** (`AdminService`) counts users, active users (a finished game or a coin change in the last 7 days), games, coins in circulation and the modules' numbers, all time and since midnight UTC. Each is one aggregate, the "today" ones through indexes on `created_at`/`opened_at`; nothing is cached or precomputed.

### Scheduled jobs

All jobs are plain in-process `@Scheduled` methods, switched on in one place (`common.scheduling.SchedulingConfig`, `app.scheduling.enabled`). Each is idempotent, so running it twice, or on two instances at once, does no harm; that is why there is no distributed scheduler or lock. The tests switch scheduling off and call the jobs themselves.

| Job | When | What |
| --- | ---- | ---- |
| `DailyChallengeScheduler` | At startup and at midnight UTC | Makes sure today's and tomorrow's daily challenges exist |
| `AbandonedSessionCleaner` | Hourly, from 10 minutes after startup | Deletes game sessions started more than 24 hours ago (`app.game-sessions.abandoned-after`) and never finished. Finished sessions are never touched. A partial index on unfinished sessions keeps this one cheap `DELETE`. Without it, every closed tab, and every call to the public "start" endpoint, would leave a row forever |

## The card game module (TCG)

`com.cyan.arcade.tcg` is a module of its own. **Nothing in the platform knows it exists** (enforced by ArchUnit), and the generic game system has no card concepts: a card game is not a row in `games`, and opening a pack is not a score. The module uses only `common` (errors, the signed-in player, the clock); its tables refer to `users` and nothing else outside `tcg_`. It meets the platform only through `common.platform`: it publishes a `PlayerActivity` for every opened pack (daily challenges count them), asks `BonusPacks` for an extra pack once a player's allowance is gone (the shop sells them), and implements `ActivityStatistics` (`tcg.stats.TcgStatistics`: packs opened, cards collected) for the profile and the admin dashboard.

```text
tcg/
  game/        TcgGameService, Rarity           card games and their rarities
  set/         TcgSetService                    sets of a game
  card/        TcgCardService, CardResponse     cards with their set, game, rarity and metadata
  pack/        TcgPackService, PackBlueprint    packs, their odds and their card pools
  opening/     PackOpeningService, PackRoller   opening packs, the daily allowance, the history
  stats/       TcgStatistics                    the module's numbers, for the platform
  collection/  CollectionService                who owns how many of which card
  dataimport/  TcgDatasetImporter, TcgDatasetImportRunner, TcgDataset   bringing card games in
               TcgSource, SourceConfig, SourceHttp                     what every source shares
    pokemon/   PokemonSource, TcgdexClient, PokemonDatasetMapper       the Pokémon TCG, from TCGdex
    onepiece/  OnePieceSource, OptcgApiClient, OnePieceDatasetMapper   the One Piece Card Game, from OPTCG API
```

The parts depend on each other one way (`set → game`, `card → set`, `pack → set`, `opening → pack, card, collection`, `collection → card`), and `dataimport` is the only writer of the catalog tables.

**Several card games, not one.** Everything is keyed by a game: rarities, sets, cards and packs belong to one, and the database enforces it (a card's set and rarity must be of the card's own game, through composite foreign keys). A game names its own rarities and gives each a tier from 1 to 5, the one thing the platform interprets. A card's `metadata` is a JSON object the platform stores and returns untouched, so each game carries its own fields (a Pokémon's HP and types, a One Piece card's cost, power and printed rarity) without a column for any of them.

**Real cards, without assumptions about any game.** A card is identified by its source's `external_id` (`sv01-001`, `OP01-120_p1`), unique within its game; its printed `card_number` is not unique, because real sets print alternate arts under the same number. A set lists its cards in the source's order (`display_order`: "10" would sort before "2" as text). A card may have a smaller `thumbnail_url` besides its `image_url`; a set may have a logo (`image_url`), a `series` and a `cover_image_url` (one of its rarest cards); a game has an `accent_color` and an `attribution`. All of these are optional, so a game whose source lacks one still fits.

**A pack** has a card pool (`tcg_pack_cards`) and rarity rules (`tcg_pack_slot_odds`): one row per slot and rarity with a weight, for example the last slot of a Pokémon booster = rare 700, double rare 210, ultra rare 75. Every game brings its own layout: how many cards, which slots, which rarities each slot can be (special and alternate-art slots included) and from which pool. The odds are public (`GET /api/tcg/packs/{id}`) with an `odds_note` saying where they come from, and the importer refuses a pack that promises a rarity its pool does not contain, so the published odds are the ones the server uses. Neither Pokémon nor One Piece publishes official pull rates, so their odds are labelled as **simulator probabilities**.

### Opening a pack

```text
React                               PackOpeningService.open (one transaction)
  POST /api/tcg/packs/{id}/open ──►   who: the signed-in player, from the session (401 otherwise)
  (no body)                           which: the pack's blueprint (404 unknown, 409 withdrawn or empty)
                                      lock: this player's openings, one at a time
                                      allowance: packs opened today < limit, or else one
                                                 extra pack used up (429 when neither)
                                      roll: PackRoller picks the cards with a SecureRandom
                                      save: the opening row
                                      collect: +1 copy per card, new or duplicate
                                      save: the opening's cards, each marked new or not
                                      publish: PlayerActivity (TCG_PACK_OPENED), counted by challenges
           ◄── 201 { opening, allowance }
  reveal animation
```

- **The server decides.** The endpoint takes no body; whatever a client sends is ignored, and no endpoint adds a card to a collection directly (`POST /api/tcg/collection` is `405`). `CollectionService.add` requires an existing transaction (`Propagation.MANDATORY`), so cards can only enter a collection as part of something that hands them out.
- **Choosing the cards** (`PackRoller`, a pure function of the blueprint and a random generator): for each slot, draw a rarity by weight among the rarities the pool has cards of, then a card of that rarity uniformly, avoiding a card already pulled from this pack while the pool has others. The randomness is a `SecureRandom`, so earlier packs say nothing about the next one. Tests check the selection with scripted numbers and the distribution over 100,000 packs.
- **All or nothing.** The opening, the collection update and the opening's cards are written in one transaction. A test makes the second card's insert fail with a database trigger and checks that nothing at all was kept.
- **Concurrency.** Adding a copy is one `INSERT ... ON CONFLICT DO UPDATE SET quantity = quantity + 1`, so simultaneous openings never lose a copy. The daily limit is checked under a transaction-scoped advisory lock per player (`pg_advisory_xact_lock`), so simultaneous requests cannot all slip under it; a test fires 15 at once with a limit of 5 and gets exactly 5.
- **The daily allowance** (`app.tcg.daily-pack-limit`, default 10, `0` for none) counts openings since midnight UTC by the server's clock, served by an index on `(user_id, opened_at)`.

### Why SQL instead of entities here

The platform features use JPA entities. The card module reads and writes with `JdbcClient` and plain records, because its work is set-shaped: upserts on natural keys for imports, an atomic counter for the collection, aggregate queries for completion, and joins of a card with its set, game and rarity in one statement. Each part keeps its SQL in one package-private `...Store` class, and other parts reach it only through the part's service. Lookups are always batched (`cardsById`, `refs`, `findOdds` take collections), so pages of history or collection cost a fixed number of queries.

### Importing card games

Card data is never fetched while players use the arcade. It goes

```text
external source ──► TcgSource (client + mapper) ──► TcgDataset ──► TcgDatasetImporter ──► PostgreSQL ──► the arcade
```

and opening packs, browsing cards and collections only read PostgreSQL. Only card images are loaded from elsewhere, by the browser, from the sources' image hosts.

| Source | Game | How it is read | Requests per import |
| ------ | ---- | -------------- | ------------------- |
| `pokemon`: [TCGdex](https://tcgdex.dev) GraphQL API (open source, no key) | Pokémon TCG | A set's details, then its cards with their rarities, by GraphQL | 2 per set (50) |
| `one-piece`: [OPTCG API](https://optcgapi.com) REST API (fan-run, no key) | One Piece Card Game | The list of sets, then each set's cards | 1 + 1 per set (21) |

- **A source** (`TcgSource`) is a client for the API and a pure mapper from its answers to the one format, `TcgDataset`. The mappers are tested on recorded answers, without the network. `SourceHttp` retries a 5xx or a broken connection a few times with a growing pause; a 4xx stops at once.
- **What to take is configuration**, not code: `tcg/sources/pokemon.json` and `one-piece.json` list the sets, the game's rarities with the source's names for them and their tiers, the pack layouts (`packProfiles`), and, for One Piece, which rarity an alternate art gets by its kind of print (`variantRarities`: SP, Manga, parallel of a secret rare, ...). A set's pack only keeps the odds for rarities the set has. A rarity the configuration does not know stops the import, listing it: a new kind of card needs a decision on its tier and odds, not a guess.
- **One format**, `TcgDataset`: a game, its rarities, its sets with their cards and packs, the packs' slots (`{"count": 3, "odds": {"common": 100}}`) and, optionally, their card pools (by card key; left out, a pack draws from its whole set). A hand-written dataset file can be imported too (`app.tcg.import.files`), for a game with no API.
- **The job** (`TcgDatasetImportRunner`) does nothing on an ordinary start. `app.tcg.import.sources` names the sources to run; the `import-tcg` profile sets it to `pokemon,one-piece`, runs on a port of its own, and exits when done (`docker compose run --rm backend --spring.profiles.active=import-tcg`, or `./mvnw spring-boot:run -Dspring-boot.run.profiles=import-tcg`). There is no import endpoint.
- **Validated as a whole first**: Bean Validation for the shape, then the cross-references (unknown rarities, duplicate cards or external ids, pool cards not in the set, odds for a rarity the pool cannot deliver). Every problem is reported at once, and a broken dataset is not written at all.
- **Idempotent**: one transaction per game, upserts on stable keys (game slug, set code, card external id, pack code). Importing again creates no duplicates and reports `0 new`; a newer source adds its new cards and updates the others in place, keeping every id, so collections and histories stay valid. A card a source moves to another set is moved, not copied. Nothing is deleted: a card dropped by a source stays in the catalog and only leaves the pools.
- **Real data's quirks** are handled in the mappers: TCGdex numbers sort as numbers; OPTCG API's names carry the kind of print ("Shanks (Parallel) (Manga)") and sometimes a disambiguator ("Rob Lucci (092)"), which become the variant and are dropped from the name; a print it lists twice under one id gets the kind of print added to the id; a reprint listed in two sets belongs to the set its number comes from.

Other conventions:

- **Errors**: controllers just throw. `GlobalExceptionHandler` maps `ApiException` subclasses, validation failures, framework errors (404, 405, malformed JSON), and unexpected exceptions to one problem-detail shape. Unexpected errors are logged and returned without internal details. The security filter chain uses the same shape for 401 and 403.
- **Security**: HTTP Basic and form login are off; the app's own JSON endpoints sign players in. Everything is denied by default, and public endpoints are allow-listed in `SecurityConfig`: health, info, `GET /api/games/**`, `GET /api/leaderboards/**`, `GET /api/daily-challenges`, `GET /api/auth/session`, the card catalog (`GET /api/tcg/games`, `/sets`, `/cards`, `/packs` and single ones), registering, logging in and out, and the two game-session `POST` endpoints. Everything under `/api/admin/**` and `/api/ai/**` needs `ROLE_ADMIN` (see [Accounts and authentication](#accounts-and-authentication)); everything else needs a signed-in player of either role.
- **CORS**: allowed origins come from `app.cors.allowed-origins` (`CORS_ALLOWED_ORIGINS`), defaulting to the Vite dev server.
- **Configuration**: `application.yml` with environment-variable overrides; every setting under `app.*` is documented there and in the README. `open-in-view` is off. Hibernate runs with `ddl-auto: validate`, so Flyway owns the schema.
- **Time**: everything that depends on "now" or "today" takes it from one UTC `Clock` bean (`common.time`), never from the request, so tests can control it.
- **Health**: Actuator exposes `/actuator/health` (including a database check and liveness/readiness probes, used by the Docker health check) and `/actuator/info`. Through nginx only the health endpoint is reachable.

## Database

- PostgreSQL 18. The schema is managed only by Flyway migrations in `backend/src/main/resources/db/migration` (`V{n}__description.sql`). Applied migrations are never edited.
- Explicit relational modeling: `NOT NULL`, unique, and check constraints guard invariants. For example, `games.slug` must be URL-safe and `games.accent_color` must be `#rrggbb`.
- Tables are added in the phase that needs them. Everything the card game module owns is prefixed `tcg_`.
- Tests run against real PostgreSQL through Testcontainers, never H2, so migrations and SQL behave exactly as in production.

| Migration | Contents |
| --------- | -------- |
| `V1__create_games.sql` | `games` table |
| `V2__seed_initial_games.sql` | Snake, 2048, Tetris |
| `V3__add_game_score_limits.sql` | `games.max_score` and its value per game |
| `V4__create_game_sessions_and_scores.sql` | `game_sessions` and `scores` |
| `V5__add_guest_player_and_leaderboard_index.sql` | `player_id` on both tables; indexes for leaderboards and "my best" |
| `V6__create_users_and_progression.sql` | `users`, `user_achievements`; `user_id` on sessions and scores; `xp_awarded` and `personal_best` on scores |
| `V7__add_featured_games.sql` | `games.featured` |
| `V8__create_daily_challenges.sql` | `daily_challenges`, `daily_challenge_completions` |
| `V9__create_tcg.sql` | The card game module: `tcg_games`, `tcg_rarities`, `tcg_sets`, `tcg_cards`, `tcg_packs`, `tcg_pack_cards`, `tcg_pack_slot_odds`, `tcg_pack_openings`, `tcg_pack_opening_cards`, `tcg_user_cards` |
| `V10__session_cleanup_index_and_accent_contrast.sql` | A partial index on unfinished game sessions for the cleanup job; Tetris's accent one shade darker, for contrast |
| `V12__add_user_roles.sql` | `users.role` (`USER` or `ADMIN`, checked); existing accounts become `USER`. The admin account itself is seeded by the application |
| `V19__add_brick_breaker.sql` | Brick Breaker's catalog row (`max_score` 5,000,000) and 18 `GAME_SKIN` items (7 paddles, 6 balls, 5 brick themes; 250 to 1,800 coins, levels 1 to 6). Data only |
| `V18__add_flappy_bird_and_game_skins.sql` | Flappy Bird's catalog row (`max_score` 9,999); `shop_items.game_slug` (references `games.slug`) and `slot`, required exactly for the new type `GAME_SKIN`; 32 Flappy Bird skins (16 birds, 11 obstacle themes, 5 skies; 200 to 2,000 coins, levels 1 to 6). Only adds |
| `V17__add_minesweeper.sql` | Minesweeper's catalog row (`max_score` 1,810). Data only |
| `V16__add_profile_frames.sql` | Four `COSMETIC` shop items, profile frames (300 to 2,500 coins, levels 1 to 6). Data only |
| `V15__add_display_name_and_bio.sql` | `users.display_name` (2 to 24 characters, trimmed; existing accounts get their username) and `users.bio` (up to 160, trimmed, `NULL` for none) |
| `V14__add_leaderboard_period_index.sql` | `scores (game_id, created_at)`, for the daily and weekly leaderboards |
| `V13__create_economy.sql` | `user_wallets`, `coin_transactions` (with the unique reference index), `daily_logins`, `shop_items` (seeded with packs, badges and titles), `user_inventory`, `purchases`; `daily_challenges.coin_reward` and activity challenges (`activity`, goal `COUNT`, nullable `game_id`), `daily_challenge_progress`; indexes on `created_at`/`opened_at` for the dashboard's "today" figures. Only adds: existing rows keep their meaning |
| `V11__real_card_games.sql` | Removes the old fictional demo card game and everything players did with it; adds external ids and display order to cards (the printed number is no longer unique), thumbnails, set series, logos and covers, a game's accent color and attribution, a pack's odds note; indexes for a set's cards in order and for cards by number |

```text
games 1 ──< game_sessions 1 ──0..1 scores >── 1 games
users 1 ──< game_sessions        users 1 ──< scores        users 1 ──< user_achievements
games 1 ──< daily_challenges 1 ──< daily_challenge_completions >── 1 users
                daily_challenges 1 ──< daily_challenge_progress >── 1 users
users 1 ──0..1 user_wallets      users 1 ──< coin_transactions      users 1 ──< daily_logins
shop_items 1 ──< user_inventory >── 1 users      shop_items 1 ──< purchases >── 1 users

tcg_games 1 ──< tcg_rarities, tcg_sets 1 ──< tcg_cards, tcg_packs
tcg_packs 1 ──< tcg_pack_cards >── 1 tcg_cards           (the pool)
tcg_packs 1 ──< tcg_pack_slot_odds >── 1 tcg_rarities    (the rarity rules)
users 1 ──< tcg_pack_openings 1 ──< tcg_pack_opening_cards >── 1 tcg_cards
users 1 ──< tcg_user_cards >── 1 tcg_cards               (the collection)
```

- `users`: `username` (3 to 20 letters, digits or underscores, enforced by a check constraint and unique through an index on `lower(username)`), `display_name`, `bio`, `password_hash`, `avatar`, `role` (`USER` or `ADMIN`), `xp`, `created_at`. The level is not a column; it is computed from `xp`.
- `game_sessions`: UUID id, `game_id`, `user_id` (the account, nullable), `player_id` (the guest, nullable), `started_at`, `finished_at` (`NULL` while the run is open).
- `scores`: one row per finished session (`game_session_id` is unique), plus `game_id`, `user_id`, `player_id`, `score`, `duration_ms`, `xp_awarded`, `personal_best`, `created_at`. The index on `(game_id, score DESC, created_at, id)` matches the leaderboard order, and two partial indexes on `user_id` serve the game history and "my best".
- `user_achievements`: `(user_id, achievement_code)` as the primary key, plus `unlocked_at`. The achievements themselves are defined in code because each one has a rule, so the code is a plain string rather than a foreign key.
- `daily_challenges`: `challenge_date` (a UTC date), `game_id`, `title`, `description`, `goal` (`PLAY`, `SCORE` or `DETAIL`), `detail` (which reported number, for `DETAIL`), `target`, `xp_reward`. Unique on `(challenge_date, game_id)`: one challenge per game per day.
- `daily_challenge_completions`: `(user_id, daily_challenge_id)` as the primary key, plus `completed_at`. Since V13 a challenge is about a game (`game_id`) or an activity (`activity`, `activity_name`, goal `COUNT`, unique per day), never both, and pays `coin_reward` too; `daily_challenge_progress` counts a player's activity towards it.
- `user_wallets`: one row per player with coins, `balance >= 0`. `coin_transactions`: the ledger (`amount <> 0`, `balance_after >= 0`, `type` checked against the seven kinds, a reference type and id given together or not at all), unique on `(user_id, type, reference_id)`, indexed by `(user_id, created_at DESC, id DESC)` and `created_at`.
- `daily_logins`: `(user_id, login_date)` as the primary key, `streak`, `coins`, `claimed_at`.
- `shop_items`: `code` (unique), `type` (`PACK`, `BADGE`, `TITLE`, `COSMETIC` for profile frames, `GAME_SKIN` with its `game_slug` and `slot`), `price > 0`, `quantity`, `max_owned`, `min_level`, `icon`, `active`. `user_inventory`: `(user_id, item_id)`, `quantity >= 0`, `equipped`. `purchases`: price and quantity at the time, unique on `(user_id, request_id)`.
- `tcg_cards`: `external_id` (unique within its game: the source's id), `card_number` (text, printed on the card, shared by alternate arts), `name`, `image_url`, `thumbnail_url`, `display_order`, `metadata` (`jsonb`, must be an object), and `game_id`, `set_id`, `rarity_id`, where composite foreign keys `(set_id, game_id)` and `(rarity_id, game_id)` keep a card inside its own game. Indexed by `(game_id, external_id)` (the import's key), `(set_id, display_order, id)` (a set's cards in order), `(game_id, card_number)` and `rarity_id`.
- `tcg_sets`, `tcg_games`, `tcg_packs`: a set's `external_id` (unique within its game), `series`, logo and `cover_image_url`; a game's `accent_color` (`#rrggbb`) and `attribution`; a pack's `odds_note`. Their images are optional.
- `tcg_user_cards`: `(user_id, card_id)` as the primary key, `quantity > 0`, first and last time obtained. `tcg_pack_openings` and `tcg_pack_opening_cards` record every opening and what it gave, with `was_new` per card.
- Indexes follow the queries: every foreign key that is looked up has one, and the ones that are only ever checked on insert (a pack opening's `pack_id`, an opening card's `card_id`) deliberately do not.
- A run has one owner: `user_id` for a signed-in player, otherwise `player_id` for a guest, otherwise neither. Scores made as a guest stay guest scores; they are not moved to an account created later.
- **Login sessions are not in the database.** They live in the backend's memory, so a restart signs everyone out. Spring Session with a JDBC store would change that without touching any feature code.

## Docker and nginx

`docker-compose.yml` runs three services:

```text
browser ──► frontend (nginx, :3000) ──/api/──► backend (Spring Boot, :8080) ──► postgres (:5432)
                 │                                  ▲
                 └── the built SPA and game         └── 127.0.0.1:8080 for local tools only
                     thumbnails (static files)          postgres on 127.0.0.1:5433 likewise

docker compose run --rm backend --spring.profiles.active=import-tcg
                     a one-off backend that imports the card games into postgres and exits
```

- **One origin.** nginx serves the app and proxies `/api/` to the backend, so the browser never makes a cross-origin request and the session cookie stays `SameSite=Lax`. It forwards `Host` with its port (`$http_host`): without the port, Spring would see the site's own `POST`s as cross-origin and refuse them.
- **Start order by health.** PostgreSQL has a `pg_isready` health check, the backend's image checks `/actuator/health/readiness`, and each service waits for the one before it to be healthy. All three restart unless stopped.
- **Only the app is public.** The backend and the database are published on `127.0.0.1` only, for development tools. Through nginx, `/actuator/health` is reachable and every other Actuator path returns 404.
- **Security headers** on everything nginx serves (`frontend/nginx/security-headers.conf`): a Content Security Policy that allows scripts, styles, fonts and requests from the site only (images also from HTTPS hosts, for the card images served by TCGdex and OPTCG API; inline styles because React sets per-element styles such as a game's accent color), `X-Content-Type-Options`, `X-Frame-Options: DENY`, a referrer policy and a permissions policy. API responses get theirs from Spring Security.
- **AI code for admins only.** `/assets/ai/*` (the games' AIs) is served only when an `auth_request` subrequest to the backend's `GET /api/ai/access`, carrying the browser's own cookies, answers `204`; a player gets the backend's `403`, a guest its `401`. Those files are cached `private`, never by a shared cache.
- **Caching**: fingerprinted build output for a year, thumbnails for a day, and `index.html` never, so a new release is picked up at once. Card images are cached by the browser as their hosts say (a year, for TCGdex).
- **Images**: the backend is built with the Maven Wrapper in a JDK image and runs as a non-root user in a JRE image; the frontend is built with Node and served by nginx.
- Settings come from `.env` (see `.env.example`), each with a working default.

## Future multiplayer

Nothing here blocks it. A later real-time feature could add a WebSocket endpoint with its own session state while reusing platform users, the catalog, and scores.

## How to add a new game

### The game boundary

A game and the platform meet at two narrow contracts, one on each side, and Minesweeper (`frontend/src/games/minesweeper`, `gamerules/MinesweeperRunRules`) is the reference implementation of both.

| A game owns | The platform owns |
| ----------- | ----------------- |
| Its engine and state (pure, seeded, deterministic), input, rendering and UI | Accounts, game sessions, storing scores and the score checks' pipeline |
| Its scoring, and the numbers (`details`) it reports with a run | Leaderboards, XP, coins, achievements, daily challenges, statistics, the shop |
| What any real run of it satisfies (`RunRules`, on the server) | Choosing the game's rules by its slug, refusing runs, paying rewards once |

- **In the browser**, a game is a `GameModule` (`games/types.ts`): a slug, its controls and a lazy root component that receives `onGameStart` and `onGameOver(result)`. `useHumanRun` gives it `begin()`, `finish(score, details)`, `reset()` and the run's clock. Display metadata (name, description, colour, artwork) comes from the backend catalog, never from the module. Shared pieces: `GameShell` (the frame; its AI props are optional), `BoardOverlay`, `useEngine`, `useTicker`, `random.ts`.
- **On the server**, a game is a row in `games` and a `RunRules` bean in `gamerules`: which details it reports, and `problemWith(score, details, elapsed)`. `RunValidator` picks it by slug; nothing else in the platform knows any game.
- **Guarded by tests**: in the frontend (`games/architecture.test.ts`), engines and types know nothing of React, the browser or the clock, a game never imports another game, the API, or the platform's pages, hooks, layouts or the card game, and only games with an AI ship one. In the backend (ArchUnit), `gamerules` may use only `RunRules` (no coins, rewards, achievements, leaderboards, inventories or accounts), and no platform class depends on `gamerules`. An integration test requires every game in the catalog to have its `RunRules`.

### Adding Game X

1. **Catalog**: a Flyway migration inserting the game's row: slug, name, description, category, thumbnail URL, accent colour (white text on it at 4.5:1 or more), display order and `max_score`. The hub lists it as "coming soon" from here on.
2. **Artwork**: `frontend/public/thumbnails/<slug>.svg`.
3. **Engine**: `frontend/src/games/<slug>/engine/` with `types/`: pure functions `update(state, action)`, randomness from a seed in the state (`games/shared/random`), plus tests. Compute the score and the details there.
4. **UI**: a hook (`hooks/use<Game>Game.ts`) binding the engine with `useEngine` and reporting the run with `useHumanRun`, components in `components/`, and `<Game>Game.tsx` laying them out in `GameShell`.
5. **Register**: `games/<slug>/index.ts` exporting `defineGameModule({ slug, controls, Component: lazy(...) })`, added to `gameModules` in `games/registry.ts`. The game is now playable at `/games/<slug>`, its scores are saved and ranked daily, weekly and all-time, finishing it earns XP and coins, counts for the games-played achievements and statistics, and it gets a daily "Finish a game of …" challenge.
6. **Server rules**: `gamerules/<Game>RunRules` implementing `RunRules`, from the engine's own rules (board, points per action, fastest pace), generous enough that no real run is refused. Until it exists the game's scores are only checked against `max_score`, and the catalog test fails as a reminder.
7. **Optional**: lines in `AchievementCatalog` and `ChallengeTemplates` for the game's own numbers (Minesweeper has "All Clear" and "Mine Free" on `won`); an AI in `ai/` with `loadAi` (admins only); `featured = TRUE` for the home page spotlight.

Nothing in the leaderboards, economy, profile, achievements code, shop, authentication or session code changes.

### Minesweeper

- **Engine** (`minesweeperEngine.ts`): a 9 × 9 board with 10 mines, laid from the seed at the first reveal and never on or next to that cell, so every game opens safely. Reveals flood out over empty cells; flags (at most one per mine) protect cells from a stray click; the game is won when all 71 safe cells are uncovered and lost on a mine.
- **Score**: 10 a safe cell uncovered, plus 500 and a point for every second under ten minutes for a cleared board (at most 1,810). Flags never score. The details it reports are the board, `revealedCells`, `flagsUsed`, `won`, `moves` and `seconds`.
- **Server rules** (`MinesweeperRunRules`): the board must be the game's, the result consistent (a win is exactly 71 cells; moves fit the cells uncovered), the score exactly what the details give, and for a cleared board the player's seconds must agree with the server's time. No AI.
- **Limit**: as for every game, a modified client that plays a fake but consistent run at a believable pace is accepted. And because a win's time is checked against the server's clock, a cleared board whose result is resent long after the game (a retry after a network failure) is refused.

### Flappy Bird

- **Engine** (`engine/flappyEngine.ts`, `difficulty.ts`, `collision.ts`): a 400 × 600 playfield simulated in fixed 1/120 s steps whatever the frame rate (a frame runs as many steps as fit and keeps the rest), so the same flaps at the same steps give the same flight at 30, 60 or 144 Hz. Gravity, a flap that sets the upward speed, a top falling speed; the bird is a circle, a pipe pair two rectangles, and the ground and the top of the sky end the flight too. Gaps come from the seed (mulberry32), each within reach of the one before.
- **Difficulty**: a table of seven levels by pipes passed (speed 150 to 216, gap 172 to 130, spacing 250 to 216). Because the world scrolls at its own pace, when each pipe is passed is fixed by the table (`passTimeMs`).
- **Score and details**: one point per pipe, once. The run reports `pipes`, `flaps`, `flightMs` (game time; it stops while paused), `seconds`, `level` and the 31-bit `seed`.
- **Server rules** (`FlappyBirdRunRules`, the same table): details consistent with the score; the flight no longer than the session (plus the latency allowance); the pipes exactly those the course passes in that flight time (250 ms tolerance); at least about one flap per two seconds aloft and at most 20 a second. Tests on both sides pin the same pass times, so the two tables cannot drift apart unnoticed.
- **Screen**: a canvas drawn every animation frame from a ref, so React re-renders only when the score or the status changes; Space, ↑, W, click or tap to flap, P to pause, and a flight pauses itself when the tab is hidden or the skin picker opens.
- **AI** (admins only, `ai/flappyAi.ts`): 30 times a second it searches flap/glide sequences 1.6 s ahead with the engine's own physics and collision test (memoised on rounded height and speed), takes a move that survives, and between safe moves aims for the lower part of the next gap, leaning towards the following gap early. Playback speed only changes game time per frame; it decides before every step at any speed.
- **Skins** (`skins/`, `render/`): a registry of looks per slot (`bird`, `pipes`, `sky`), each a visual configuration the renderer reads; the engine and the AI never import them (architecture test).

### Brick Breaker

- **Engine** (`engine/brickEngine.ts`, `physics.ts`, `levels.ts`, `powerUps.ts`, `scoring.ts`): a 400 × 600 arena simulated in fixed 1/240 s steps whatever the frame rate; at the fastest ball a step moves under 2 units, so nothing passes through anything. Balls are circles, bricks and the paddle rectangles; a ball bounces off the axis of the deepest contact (so its speed never changes), is pushed out of every brick it touches, and leaves the paddle at up to 62° from the vertical by where it hit (never under 15°). Two paddle bounces in a row that hit nothing make the next near-centre bounces lean towards the bricks, so no ball loops forever through an empty space. The first serve waits for the player; game time counts from the first launch. The engine reports what happened (`state.events`) for effects and future sounds.
- **Levels**: eight handcrafted layouts with their own idea (tough bricks from level 2, armored from 4, a fortress at 8) and speeds from 300 to 430, then Endless from the run's seed: reusable patterns, 36 to 96 bricks, harder toughness mixes and speeds up to a hard cap of 470. A test has the AI clear every handcrafted level.
- **Score**: bricks score 100, 150 or 250 by kind (special 200), times the combo (×1 to ×2.5 from five in a row; the combo ends after 2.5 s without a brick) and ×2 under x2 Score; cracking a brick is 10. A cleared level adds 500 to 4,100 (level, lives, best combo, time, and 1,000 for a Perfect Clear).
- **Power-ups**: every destroyed brick rolls once on its phase's table (18% of bricks drop something on levels 1–2, 20% on 3–5, 23% from 6, with rarer ones more likely later); special bricks always drop. There is one drop rule for everyone (`rollBrickDrop`: the next number of the run's random sequence on the level's table), and the AI only gives the paddle and launch input a player's pointer gives (`applyInput`), so the same seed and the same bricks destroyed in the same order drop the same things for a player and for the AI (tests replay an AI run as a player's input and recompute every drop from the seed). Timed ones (x2 Score, Wide, Fireball, Laser, Magnet) restart their time when caught again, never stacking; balls are capped at 8 and lives at 5. Losing a life clears effects and falling drops.
- **Server rules** (`BrickBreakerRunRules`, the same numbers): the bricks must match the level reached (every brick of the cleared levels, at most those plus the current level's), the score lie between what those bricks and clears can give, power-ups, fireball, laser and extra balls fit the bricks, a finished run have lost at least three lives, and game time fit the session (5% plus the latency allowance, for long runs whose start arrives late) and the levels cleared.
- **Look** (`render/worlds.ts`, `render/pixel.ts`): original pixel art in a cute, anime-flavoured arcade style, drawn from whole-pixel rectangles (no image files): each handcrafted level has its own world (scenery, drifting petals, sprinkles, hearts, stars, fox-fire wisps, neon rain, embers or fireflies, and its brick colours), Endless a retro arcade whose bricks take each world's colours in turn. Which world shows depends only on the level and the brick theme, never on chance. Bricks, the paddle, capsules and scenery are painted once into small sprites and stretched without smoothing; every picture fills exactly the shape the engine uses (render tests check bricks, paddles and balls). Text on the canvas uses a small pixel font.
- **Screen** (`render/`, `effects/juice.ts`): a canvas drawn every frame from refs, so React re-renders only when the score, lives or phase change; particles, flashes, pop-ups, shake and banners are made from the engine's events and never feed back into it. Mouse, touch drag, ←/→ or A/D move the paddle; a click, a tap or Space launches.
- **AI** (admins only, `ai/brickAi.ts`): predicts every ball's landing with wall and ceiling bounces, saves the one due soonest, aims the bounce at the lowest brick in reach (straight or off a wall, by inverting the paddle's angle rule), and catches a power-up only when the save stays sure. It decides before every engine step, so speed changes nothing but pace.
- **Skins**: `paddle`, `ball` and `bricks`, through the same `GAME_SKIN` items and `cosmetics` contract as Flappy Bird. A brick theme is a world: the free Arcade Worlds follows the levels, a bought theme keeps its own world (bricks and arena) on every level. Admins may wear every Brick Breaker skin without buying it (see the shop).

**Server-backed game**: follow the card game module (`com.cyan.arcade.tcg` and `frontend/src/tcg`): a backend package of its own under `/api/<name>/**` with `<name>_`-prefixed tables, using only `common`, and a frontend module that the app mounts as one route object. Platform features must not depend on it.

**Another card game** (say, Lorcana) needs no change to the tables, the API or the pages:

1. **Source**: a package under `tcg/dataimport/` with a client for its API and a pure mapper to `TcgDataset`, as a `TcgSource` component with its own id. Test the mapper on recorded answers.
2. **Configuration**: `tcg/sources/<game>.json` with its sets, rarities and tiers, pack layouts (marked as simulator odds unless the publisher gives real ones), accent color and attribution; and its URL and configuration path under `app.tcg.sources`.
3. **Import** it with `TCG_IMPORT_SOURCES=<id>`. A game with no API can instead be written as a dataset file and imported with `TCG_IMPORT_FILES`.

You don't edit existing games or platform internals in either case.
