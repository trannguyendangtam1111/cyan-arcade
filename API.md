# API

Base path: `/api`. JSON in and out.

## Conventions

- RESTful, resource-oriented URLs. Plural nouns and kebab-case (`/api/game-sessions`).
- Request and response bodies are DTOs. JPA entities are never serialized.
- Request bodies are validated with Bean Validation. Violations return `400 VALIDATION_FAILED`.
- Timestamps are ISO-8601 in UTC. IDs are numeric unless noted.
- Status codes: `200` OK, `201` Created, `204` No Content, `400` bad input, `401` not authenticated, `403` not allowed, `404` not found, `405` method not allowed, `409` state conflict (e.g. finishing a session twice), `410` gone (a game session left open too long), `429` too many attempts or over a daily limit, `500` unexpected.
- Paged lists take `page` (zero-based) and `size`, and answer with `page`, `size`, `totalEntries` and `totalPages` next to the items.
- The API is deny-by-default. Any path that isn't listed as public below returns `401 UNAUTHORIZED` to a caller who is not signed in.
- Browsers send an `Origin` header with every `POST`. A reverse proxy in front of the API must forward the `Host` header unchanged, including the port, or the API will treat the site's own requests as cross-origin and answer `403`.
- CORS: browsers may call the API from the origins in `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173`), with credentials.

## Authentication

Signing in creates a **server-side session**. The browser holds only its id, in a cookie it cannot read from JavaScript:

| Cookie | Set when | Properties |
| ------ | -------- | ---------- |
| `CYAN_SESSION` | Registering or logging in | `HttpOnly`, `SameSite=Lax`, `Secure` when `SESSION_COOKIE_SECURE=true`. The session ends after 14 days without a visit, or at logout |
| `XSRF-TOKEN` | Any response, when the browser has none | Readable by JavaScript on purpose (see below) |

There are no tokens to store and nothing to put in an `Authorization` header: the browser sends the cookie by itself.

### Roles

Every account has one role, returned with the session (`user.role`):

| Role | Authority | May |
| ---- | --------- | --- |
| `USER` | `ROLE_USER` | Everything players do. Every account made by `POST /api/auth/register` is a `USER`; the request cannot ask for anything else |
| `ADMIN` | `ROLE_ADMIN` | Everything a `USER` may, plus the admin-only endpoints (`/api/admin/**`, `/api/ai/**`) and card packs without a daily allowance |

The server checks the role on every request that needs it; what the app shows is only a convenience. An admin-only endpoint answers a player `403 FORBIDDEN` and a guest `401 UNAUTHORIZED`. The role is read at sign-in.

### CSRF protection

Because the browser attaches the session cookie automatically, every request that changes something (`POST`, `PATCH`, `PUT`, `DELETE`) must prove it comes from the site itself. It does that by copying the value of the `XSRF-TOKEN` cookie into a header:

```http
X-XSRF-TOKEN: 5b0f6f0e-7c1d-4b41-9c0e-6a3f0f7d2a11
```

- A request without the header, or with the wrong value, gets `403 FORBIDDEN`. This includes the public `POST` endpoints.
- A client with no `XSRF-TOKEN` cookie yet gets one from any `GET`, for example `GET /api/auth/session`.
- The token is replaced when someone signs in, so read the cookie again for every request instead of caching it.

### Guests

Everything playable works without an account. So that a guest can still see which scores are theirs, the browser creates a random UUID once, keeps it in `localStorage`, and sends it in a header:

```http
X-Player-Id: 3b1f0c52-7a44-4b1e-9d2e-5f0a6c1d8e77
```

- It is optional, and it is an identifier, not authentication.
- `POST /api/game-sessions` stores it with the run. `GET /api/leaderboards/{gameSlug}` uses it for `you` and `player`.
- It is never included in a response, and it is sent as a header rather than in a URL so it does not end up in logs or browser history.
- Guests earn no XP and no achievements, and a guest's earlier scores are not moved to an account created later.

## Errors

Every error, including 401 and 403 from the security layer, uses [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457) (`Content-Type: application/problem+json`) with a few extension members:

```json
{
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed",
  "instance": "/api/game-sessions/42/finish",
  "code": "VALIDATION_FAILED",
  "timestamp": "2026-09-30T08:15:30.123Z",
  "errors": [
    { "field": "score", "message": "must be greater than or equal to 0" }
  ]
}
```

| Member   | Meaning |
| -------- | ------- |
| `code`   | Stable, machine-readable error code. Clients branch on this, not on `detail`. |
| `detail` | Human-readable explanation, safe to show to users. |
| `errors` | Present only for validation failures. One entry per invalid field or parameter. |

Platform codes: `VALIDATION_FAILED`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `INTERNAL_ERROR`. Feature codes: `INVALID_CREDENTIALS`, `TOO_MANY_LOGIN_ATTEMPTS`, `USERNAME_TAKEN`, `SESSION_ALREADY_FINISHED`, `SESSION_EXPIRED`, `SCORE_REJECTED`, `PACK_NOT_AVAILABLE`, `DAILY_PACK_LIMIT_REACHED`.

## Endpoints

| Method | Path | Access |
| ------ | ---- | ------ |
| `POST` | `/api/auth/register` | public |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/logout` | public |
| `GET` | `/api/auth/session` | public |
| `GET` | `/api/users/me` | signed in |
| `PATCH` | `/api/users/me` | signed in |
| `GET` | `/api/users/{username}/profile` | public |
| `GET` | `/api/users/me/game-history` | signed in |
| `GET` | `/api/users/me/achievements` | signed in |
| `GET` | `/api/users/me/stats` | signed in |
| `GET` | `/api/users/me/coins` | signed in |
| `GET` | `/api/users/me/transactions` | signed in |
| `GET` | `/api/users/me/inventory` | signed in |
| `PUT`, `DELETE` | `/api/users/me/inventory/{itemId}/equipped` | signed in |
| `GET` | `/api/daily-login` | signed in |
| `POST` | `/api/daily-login/claim` | signed in |
| `GET` | `/api/shop/items` | public |
| `POST` | `/api/shop/purchases` | signed in |
| `GET` | `/api/daily-challenges` | public |
| `GET` | `/api/daily-challenges/me` | signed in |
| `GET` | `/api/games`, `/api/games/{slug}` | public |
| `POST` | `/api/game-sessions` | public |
| `POST` | `/api/game-sessions/{id}/finish` | public; a signed-in player's session only by that player, a guest's only with the same `X-Player-Id` |
| `GET` | `/api/leaderboards/{gameSlug}?period=…` | public |
| `GET` | `/api/users/me/ranks` | signed in |
| `GET` | `/api/tcg/games`, `/api/tcg/games/{slug}` | public |
| `GET` | `/api/tcg/sets`, `/api/tcg/sets/{id}` | public |
| `GET` | `/api/tcg/cards?set={id}` | public |
| `GET` | `/api/tcg/packs?set={id}`, `/api/tcg/packs/{id}` | public |
| `POST` | `/api/tcg/packs/{id}/open` | signed in |
| `GET` | `/api/tcg/allowance` | signed in |
| `GET` | `/api/tcg/collection` | signed in |
| `GET` | `/api/tcg/openings` | signed in |
| `GET` | `/api/admin/overview` | admin |
| `GET` | `/api/admin/stats` | admin |
| `GET` | `/api/admin/users?query={text}` | admin |
| `POST` | `/api/admin/users/{id}/coins` | admin |
| `GET` | `/api/ai/access` | admin |
| `GET` | `/actuator/health`, `/actuator/info` | public (through nginx, only `/actuator/health`) |

### Accounts

#### `POST /api/auth/register`

Creates an account and signs the new player in.

```json
{ "username": "pixel", "password": "…" }
```

| Field | Rules |
| ----- | ----- |
| `username` | 3 to 20 letters, digits or underscores. Unique regardless of case: `Pixel` and `pixel` are the same name. Shown to other players |
| `password` | 8 to 72 characters. Stored only as a bcrypt hash |

Responds `201 Created`, sets `CYAN_SESSION`, and returns the session:

```json
{
  "authenticated": true,
  "user": { "id": 7, "username": "pixel", "displayName": "pixel", "avatar": "ROBOT", "role": "USER" }
}
```

`role` is `USER` for every account made here (see [Roles](#roles)).

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | A field is missing or breaks a rule above. `errors` names the field |
| `409 USERNAME_TAKEN` | Someone already has that username |

#### `POST /api/auth/login`

```json
{ "username": "pixel", "password": "…" }
```

Responds `200 OK` with the same body as registering, and sets `CYAN_SESSION`. The username is matched regardless of case.

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | A field is missing or blank |
| `401 INVALID_CREDENTIALS` | Unknown username or wrong password. The response is the same for both, so it does not reveal which usernames exist |
| `429 TOO_MANY_LOGIN_ATTEMPTS` | This username has failed too often from this address lately (see below). The password was not checked |

**Repeated failures are throttled.** After 5 failed logins for the same username from the same client address within 5 minutes, further attempts for that pair are refused until 5 minutes after the first failure, whether the password is right or not:

```json
{
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Too many failed attempts. Please wait a few minutes and try again.",
  "instance": "/api/auth/login",
  "code": "TOO_MANY_LOGIN_ATTEMPTS",
  "timestamp": "2026-10-01T05:48:02.207Z"
}
```

- A successful login clears the count. Unknown usernames are counted like known ones, so the throttle does not reveal which usernames exist either.
- Other usernames, and the same username from another address, are not affected. Behind a reverse proxy every request has the proxy's address, so there the limit is effectively per username.
- The limits are `LOGIN_MAX_FAILURES` and `LOGIN_FAILURE_WINDOW`. The counts are kept in memory by each backend instance.

#### `POST /api/auth/logout`

Ends the session and clears it on the server. Responds `204 No Content`, also when nobody was signed in.

#### `GET /api/auth/session`

Tells the app who is signed in. For a guest this is a normal `200`, not an error:

```json
{ "authenticated": false, "user": null }
```

### Profile

All of these describe **the caller**. The player is taken from the session, never from the request, so there is no way to address another player's data. Without a session they return `401 UNAUTHORIZED`.

#### `GET /api/users/me`

```json
{
  "id": 7,
  "username": "pixel",
  "displayName": "Pixel Pal",
  "bio": "Tetris every day.",
  "avatar": "GHOST",
  "role": "USER",
  "xp": 185,
  "level": 2,
  "xpIntoLevel": 85,
  "xpForNextLevel": 200,
  "coins": 1240,
  "gamesPlayed": 12,
  "totalScore": 4321,
  "achievementsUnlocked": 1,
  "achievementsTotal": 9,
  "title": { "code": "TITLE_HIGH_ROLLER", "name": "High Roller", "icon": "dice" },
  "badge": null,
  "memberSince": "2026-09-30T14:02:11.480Z"
}
```

| Field | Notes |
| ----- | ----- |
| `username` | The account's identity: unique (whatever the case), used to sign in and in profile links. It never changes |
| `displayName` | What other players see (profile, leaderboards, header). The player may change it; it starts as the username and need not be unique |
| `bio` | A few words by the player, or `null` |
| `xp` | Total experience points |
| `level` | Derived from `xp` (see [Experience and levels](#experience-and-levels)) |
| `xpIntoLevel`, `xpForNextLevel` | Progress within the current level: 85 of the 200 XP that level 2 takes |
| `coins` | The coin balance (see [Coins](#coins)) |
| `gamesPlayed`, `totalScore` | Finished games on this account, and the sum of their scores |
| `title`, `badge`, `cosmetic` | What the player wears, bought in the [shop](#shop): a title, a badge and a profile frame (`cosmetic.icon` names the frame); `null` when nothing |

#### `PATCH /api/users/me`

Changes what the player shows of themselves. Every field is optional; what is left out stays as it is.

```json
{ "displayName": "Pixel Pal", "bio": "Java backend developer building things.", "avatar": "GHOST" }
```

| Field | Rules (checked on the server) |
| ----- | ----------------------------- |
| `displayName` | Trimmed, and runs of spaces become one. Then 2 to 24 characters: letters (any alphabet), digits, spaces and `. _ ' ! -` |
| `bio` | Trimmed; up to 160 characters, line breaks allowed, no control characters. `""` removes the bio |
| `avatar` | One of `ROBOT`, `CAT`, `DOG`, `GHOST`, `ROCKET`, `CROWN`, `BIRD`, `FISH`: the arcade draws them, there are no uploads |

Responds `200 OK` with the updated profile. **Nothing else can be changed here**: any other field (`username`, `role`, `coins`, `xp`, statistics, achievements, items, `id`) is ignored. The player is always the one in the session; there is no way to change another player's profile, and admins cannot either. `400 VALIDATION_FAILED` (with `errors[].field`) for a value outside the rules, `400 BAD_REQUEST` for an unknown avatar, `401` without a session.

#### `GET /api/users/{username}/profile`

A player's public profile. Public; the username is matched regardless of case. `404 NOT_FOUND` when there is no such player.

```json
{
  "username": "pixel",
  "displayName": "Pixel Pal",
  "avatar": "GHOST",
  "bio": "Tetris every day.",
  "role": "USER",
  "level": 2,
  "memberSince": "2026-09-30T14:02:11.480Z",
  "title": { "code": "TITLE_HIGH_ROLLER", "name": "High Roller", "icon": "dice" },
  "badge": null,
  "stats": { "gamesPlayed": 12, "totalScore": 4321, "playTimeMs": 3725000, "activities": [], "games": [] },
  "achievements": [
    { "code": "FIRST_GAME", "name": "First Coin", "description": "Finish your first game.", "unlockedAt": "2026-09-30T14:05:40.102Z" }
  ],
  "achievementsTotal": 9,
  "ranks": { "bestRank": 3, "bestRankGame": { "slug": "tetris", "name": "Tetris" }, "games": [] },
  "you": false
}
```

`stats` is the [statistics](#get-apiusersmestats) without coins, `ranks` the same as [`/me/ranks`](#get-apiusersmeranks), `achievements` the unlocked ones, newest first. What the player wears (`title`, `badge`, `cosmetic`) is public; nothing else they own is. It never contains an account id, coins, coin history, inventory or anything about sign-in. `you` is `true` when the caller is this player.

#### `GET /api/users/me/game-history`

The caller's finished games, newest first.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `page` | `0` | Zero-based |
| `size` | `10` | 1 to 50 |

```json
{
  "entries": [
    {
      "gameSlug": "snake",
      "gameName": "Snake",
      "score": 31,
      "durationMs": 48211,
      "playedAt": "2026-09-30T14:05:40.102Z",
      "xpEarned": 85,
      "personalBest": true
    }
  ],
  "page": 0,
  "size": 10,
  "totalEntries": 1,
  "totalPages": 1
}
```

`xpEarned` is everything the run earned, achievements and daily challenges included. `400 VALIDATION_FAILED` when `page` or `size` is out of range.

#### `GET /api/users/me/achievements`

Every achievement in the arcade, in display order, with whether the caller has it.

```json
[
  {
    "code": "FIRST_GAME",
    "name": "First Coin",
    "description": "Finish your first game.",
    "xp": 50,
    "coins": 100,
    "unlocked": true,
    "unlockedAt": "2026-09-30T14:05:40.102Z"
  },
  {
    "code": "PLAY_10_GAMES",
    "name": "Regular",
    "description": "Finish 10 games.",
    "xp": 100,
    "coins": 150,
    "unlocked": false,
    "unlockedAt": null
  }
]
```

#### `GET /api/users/me/stats`

The caller's statistics: across the platform, from other modules (the card game), and per game. A handful of indexed aggregates over the caller's own rows, asked for by the profile page only.

```json
{
  "gamesPlayed": 12,
  "totalScore": 4321,
  "playTimeMs": 3725000,
  "achievementsUnlocked": 1,
  "achievementsTotal": 9,
  "coins": 1240,
  "coinsEarned": 1740,
  "activities": [
    { "key": "tcg.packsOpened", "label": "Packs opened", "value": 14 },
    { "key": "tcg.cardsCollected", "label": "Cards collected", "value": 341 },
    { "key": "tcg.uniqueCards", "label": "Different cards", "value": 200 }
  ],
  "games": [
    {
      "slug": "snake",
      "name": "Snake",
      "gamesPlayed": 9,
      "bestScore": 42,
      "averageScore": 17,
      "playTimeMs": 600000,
      "lastPlayedAt": "2026-09-30T15:38:02.114Z"
    }
  ]
}
```

| Field | Notes |
| ----- | ----- |
| `playTimeMs` | Time spent in finished runs, measured by the server |
| `coinsEarned` | Every coin ever earned, spending left out |
| `activities` | Numbers other modules keep about the player, identified by `key` |
| `games` | One entry per game finished at least once, most played first. `averageScore` is rounded |

### Experience and levels

Only signed-in players earn XP, and only by finishing a game session.

| For | XP | Coins |
| --- | -- | ----- |
| Finishing a game, whatever the score | 10 | 5, for the first 40 games of the day (UTC) |
| Beating your own best score in that game | +25 | +15 |
| Unlocking an achievement | its `xp` | its `coins` |
| Completing a daily challenge | its `xpReward` | its `coinReward` |

Level 1 starts at 0 XP, and each level takes 100 XP more than the one before: level 2 at 100 XP, level 3 at 300, level 4 at 600, level 5 at 1,000.

| Code | Name | Unlocked by | XP | Coins |
| ---- | ---- | ----------- | -- | ----- |
| `FIRST_GAME` | First Coin | Finishing a game | 50 | 100 |
| `PLAY_10_GAMES` | Regular | Finishing 10 games | 100 | 150 |
| `PLAY_50_GAMES` | Arcade Rat | Finishing 50 games | 250 | 400 |
| `SNAKE_25` | Growing Up | A score of 25 in Snake | 100 | 150 |
| `SNAKE_100` | Python | A score of 100 in Snake | 250 | 400 |
| `REACH_512` | Halfway There | A 512 tile in 2048 (`highestTile`) | 100 | 150 |
| `REACH_2048` | Two Zero Four Eight | A 2048 tile in 2048 (`highestTile`) | 250 | 500 |
| `TETRIS_10_LINES` | Line Worker | 10 lines in one game of Tetris (`lines`) | 100 | 150 |
| `TETRIS_40_LINES` | Marathon | 40 lines in one game of Tetris (`lines`) | 250 | 400 |

Each achievement is awarded once per player.

### Daily challenges

Every day each game in the catalog gets one challenge, for example "Clear 5 lines in one game of Tetris", and so does each **activity**: something done outside the games that the server counts, for now opening card packs ("Open 3 card packs today"). A game's challenge is completed by a single finished run that reaches its target; an activity's by doing it `target` times in the day. Either pays its XP and coins once.

- **The day is the server's.** A day runs from midnight to midnight UTC. No request carries a date, and a run counts for the day on which it is finished.
- **Completing is not an endpoint.** A game's challenge is completed by finishing a game session (`POST /api/game-sessions/{id}/finish`) while signed in; the response's `rewards.bonuses` lists what the run completed. A card pack challenge is counted by the server each time a pack is opened (`POST /api/tcg/packs/{id}/open`), and completed by the opening that reaches the target.
- **Rotation.** A game's challenges take turns, one per day, so tomorrow's is never the same as today's. The server creates each day's set ahead of time, at startup and at midnight UTC.
- Guests can see the challenges but complete nothing.

#### `GET /api/daily-challenges`

Today's challenges. Public.

```json
{
  "date": "2026-09-30",
  "resetsAt": "2026-10-01T00:00:00Z",
  "challenges": [
    {
      "id": 3,
      "title": "Tidy Up",
      "description": "Clear 5 lines in one game of Tetris.",
      "game": { "slug": "tetris", "name": "Tetris" },
      "activity": null,
      "target": 5,
      "xpReward": 30,
      "coinReward": 60,
      "date": "2026-09-30"
    },
    {
      "id": 4,
      "title": "Pack Opener",
      "description": "Open 3 card packs today.",
      "game": null,
      "activity": { "code": "TCG_PACK_OPENED", "name": "Card packs" },
      "target": 3,
      "xpReward": 30,
      "coinReward": 60,
      "date": "2026-09-30"
    }
  ]
}
```

| Field | Notes |
| ----- | ----- |
| `date` | The day these challenges belong to, in UTC |
| `resetsAt` | When the next set takes over |
| `challenges[].game` | The game the challenge is played in; `null` for an activity's challenge |
| `challenges[].activity` | What an activity's challenge counts (`TCG_PACK_OPENED`); `null` for a game's |
| `challenges[].target` | The number to reach: in one run for a game (`1` for "finish a game"), over the day for an activity. `description` says what is counted |
| `challenges[].xpReward`, `challenges[].coinReward` | XP and coins for completing it |

A day without challenges returns an empty `challenges` list, not an error.

#### `GET /api/daily-challenges/me`

The same challenges with the caller's own progress. `401 UNAUTHORIZED` without a session.

```json
{
  "date": "2026-09-30",
  "resetsAt": "2026-10-01T00:00:00Z",
  "completedCount": 1,
  "challenges": [
    {
      "id": 3,
      "title": "Tidy Up",
      "description": "Clear 5 lines in one game of Tetris.",
      "game": { "slug": "tetris", "name": "Tetris" },
      "activity": null,
      "target": 5,
      "xpReward": 30,
      "coinReward": 60,
      "date": "2026-09-30",
      "progress": null,
      "completed": true,
      "completedAt": "2026-09-30T15:38:02.114Z"
    }
  ]
}
```

`completedAt` is `null` until the challenge is completed. `progress` is how many times the caller has done an activity today (for an activity's challenge), and `null` for a game's.

### Game catalog

Public, read-only. Only active games are visible.

#### `GET /api/games`

Returns every active game in display order.

```json
[
  {
    "id": 1,
    "slug": "snake",
    "name": "Snake",
    "description": "Guide a hungry snake around the board, gobble up snacks and try not to bite your own tail.",
    "category": "ARCADE",
    "thumbnailUrl": "/thumbnails/snake.svg",
    "accentColor": "#22c55e",
    "featured": true
  }
]
```

| Field          | Type   | Notes |
| -------------- | ------ | ----- |
| `id`           | number | |
| `slug`         | string | URL-safe and unique. Identifies the game everywhere, including the frontend registry. |
| `name`         | string | |
| `description`  | string | Up to 500 characters. |
| `category`     | string | `ARCADE`, `PUZZLE`, `STRATEGY`, or `CARD`. |
| `thumbnailUrl` | string | Path or URL of the card artwork. |
| `accentColor`  | string | The game's identity color as `#rrggbb`. |
| `featured`     | boolean | Whether the hub puts the game in the spotlight on its home page. |

#### `GET /api/games/{slug}`

Returns one game in the same shape. Responds `404 NOT_FOUND` when the slug is unknown or the game is inactive:

```json
{
  "title": "Not Found",
  "status": 404,
  "detail": "Game 'pong' was not found",
  "instance": "/api/games/pong",
  "code": "NOT_FOUND",
  "timestamp": "2026-09-30T09:49:54.904Z"
}
```

### Game sessions and scores

A score is never sent on its own. A run is opened as a **session** when it starts, and the score is accepted only by **finishing** that session, once. Both endpoints are open to guests.

Who a run belongs to is decided when it **starts**: the signed-in player if there is one, otherwise the guest in `X-Player-Id`, otherwise nobody. The request body cannot name a player.

#### `POST /api/game-sessions`

Starts a run.

```json
{ "gameSlug": "snake" }
```

Responds `201 Created` with a `Location` header:

```json
{
  "id": "0eec4e83-12db-41a4-9164-016466722a9f",
  "gameSlug": "snake",
  "startedAt": "2026-09-30T13:12:01.314Z"
}
```

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | `gameSlug` is missing or blank |
| `404 NOT_FOUND` | No active game has that slug |

#### `POST /api/game-sessions/{id}/finish`

Ends the run and records its score.

```json
{ "score": 6, "details": { "length": 9, "level": 2 } }
```

| Field | Notes |
| ----- | ----- |
| `score` | Required, zero or more |
| `details` | Up to 10 whole numbers the game reports about the run, keyed by a short name. Each game has its own, and **they are required**: Snake `length` and `level`; 2048 `highestTile` and `moves`; Tetris `lines`, `level` and `pieces`; Minesweeper `rows`, `columns`, `mines`, `revealedCells`, `flagsUsed`, `won` (0 or 1), `moves` and `seconds`; Flappy Bird `pipes`, `flaps`, `flightMs`, `seconds`, `level` and `seed`; Brick Breaker `level`, `bricks`, `maxCombo`, `powerUps`, `maxBalls`, `fireBricks`, `laserBricks`, `livesLost`, `perfectClears` and `gameMs`. They are checked against the score, and only a game's own are kept (others are ignored); they then decide achievements and daily challenges. Not stored |

A guest finishes their run with the same `X-Player-Id` header they started it with.

Responds `200 OK` with the recorded result:

```json
{
  "sessionId": "0eec4e83-12db-41a4-9164-016466722a9f",
  "gameSlug": "snake",
  "score": 6,
  "durationMs": 8669,
  "recordedAt": "2026-09-30T13:12:09.983Z",
  "rewards": {
    "xpEarned": 110,
    "coinsEarned": 170,
    "personalBest": true,
    "achievements": [
      { "code": "FIRST_GAME", "name": "First Coin", "description": "Finish your first game.", "xp": 50, "coins": 100 }
    ],
    "bonuses": [
      { "type": "DAILY_CHALLENGE", "title": "Light Snack", "xp": 25, "coins": 50 }
    ],
    "totalXp": 110,
    "level": 2,
    "leveledUp": true,
    "coinBalance": 170
  }
}
```

- `durationMs` is measured by the server, from the session's start to this request. The client does not report a duration; the server uses its own to judge the run (see [Score integrity](#score-integrity)).
- `rewards` is `null` for a run that was started by a guest. Otherwise it says what this run earned and where the player stands afterwards. `achievements` lists only those unlocked by this run, and `bonuses` the daily challenges it completed. `xpEarned` and `coinsEarned` are the totals of everything; every coin is also a transaction in the player's [ledger](#coins). Finishing the same session again is refused, so nothing is paid twice.

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | `score` is missing or negative, or `details` is malformed |
| `400 SCORE_REJECTED` | The run cannot have been played: the score is outside the game's range, the game's details are missing or do not match the score, or the run is faster than the game can be played. The answer is always "Score submission rejected." and never says which. Nothing is recorded or earned, and the session stays open |
| `400 BAD_REQUEST` | The id is not a UUID |
| `403 FORBIDDEN` | The session belongs to someone else: a signed-in player's, or a guest's started with a different `X-Player-Id` |
| `404 NOT_FOUND` | No session has that id |
| `409 SESSION_ALREADY_FINISHED` | The session was finished before. The first score stands, and nothing is earned again (a retry after a lost answer gets this) |
| `410 SESSION_EXPIRED` | The session was opened more than 24 hours ago (`GAME_SESSIONS_ABANDONED_AFTER`). Nothing is recorded |

There is no endpoint to read or list sessions.

#### Score integrity

The games run in the browser, so the server cannot know what really happened in a run. What it does instead is refuse what **cannot** have happened, from each game's own rules (`score.RunRules`):

| Game | A run must satisfy |
| ---- | ------------------ |
| Snake | `length` is the score plus the 3 cells the snake starts with; `level` goes up every 5 apples; no more apples than moves the time allows (the snake never moves faster than once every 70 ms) |
| 2048 | `highestTile` is a power of two; the score is a multiple of 4, at least what building the highest tile scores and at most what the tiles on the board can have scored; the board holds no more than 8 + 4 per move; no more than 25 moves a second |
| Tetris | `level` is one more than every 10 lines; the pieces placed fill the lines cleared and no more than the board; the score is between all singles and all fours for those lines, plus at most 44 drop points a piece; no more than 10 pieces a second |
| Minesweeper | The board is 9 × 9 with 10 mines; `won` exactly when all 71 safe cells are uncovered; at most one flag per mine, on covered cells; every reveal uncovers a safe cell except a losing one, and the first is always safe; the score is exactly 10 a safe cell, plus 500 and `600 − seconds` (at least 0) for a cleared board; for a cleared board `seconds` must agree with the server's time (within 3 seconds); no more than 10 clicks a second |
| Flappy Bird | `pipes` is the score, `level` the course's level for it and `seconds` the whole seconds of `flightMs`; the flight (game time, which stops while paused) no longer than the session; the course passes pipes at fixed times, so `flightMs` must lie between passing the last pipe scored and the next one (within 250 ms); at least one flap, and between 0.6 a second (minus two) and 20 a second |
| Brick Breaker | `bricks` at least every brick of the levels before `level` and at most those plus its own (handcrafted levels have 44, 40, 46, 46, 58, 48, 58 and 80; Endless levels 36 to 96); the score between 100 a brick plus 500 a cleared level and 1,250 a brick (plus 20 for cracks) plus 4,100 a cleared level; `maxCombo`, `fireBricks` + `laserBricks` and `powerUps` no more than the bricks (power-ups also within the drop rates); fireball, laser or more than one ball only with a power-up; at most 8 balls; `livesLost` between 3 and 3 plus the power-ups; `perfectClears` at most the levels cleared; `gameMs` no longer than the session (plus 5% and 2 seconds) and at least 1.8 seconds per level cleared |

The time is the server's, from opening the session to finishing it, with 2 seconds added for the requests travelling. The limits are generous: an unusual but real run always passes. **This is practical integrity protection, not a perfect anti-cheat system**: a client that plays a fake run slowly enough, with consistent numbers, can still submit it. What it cannot do is submit scores no run could produce, finish a run twice, finish someone else's run, or earn any reward from a run the server refused.

### Leaderboards

#### `GET /api/leaderboards/{gameSlug}`

One page of a game's leaderboard for a period. Public and read-only: there is no endpoint that writes to a leaderboard, and every entry is read from scores recorded through game sessions.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `period` | `ALL_TIME` | `DAILY`, `WEEKLY` or `ALL_TIME` |
| `page` | `0` | Zero-based |
| `size` | `20` | 1 to 100 |

```json
{
  "gameSlug": "2048",
  "period": "WEEKLY",
  "periodStart": "2026-10-05T00:00:00Z",
  "periodEnd": "2026-10-12T00:00:00Z",
  "entries": [
    {
      "rank": 1,
      "player": { "username": "pixel", "displayName": "Pixel Pal", "avatar": "GHOST" },
      "score": 15200,
      "durationMs": 412000,
      "achievedAt": "2026-10-06T13:28:40.975Z",
      "you": true
    },
    { "rank": 2, "player": null, "score": 1512, "durationMs": 95000, "achievedAt": "2026-10-06T13:31:02.118Z", "you": false }
  ],
  "page": 0,
  "size": 20,
  "totalEntries": 2,
  "totalPages": 1,
  "myRank": 1,
  "myScore": 15200
}
```

- **Periods are the server's, in UTC.** `DAILY` counts scores set from 00:00 UTC today, `WEEKLY` from Monday 00:00 UTC this week (ISO weeks), `ALL_TIME` every score. `periodStart` is the first moment counted and `periodEnd` the moment the next board starts (both `null` for all time). No request carries a date. In Vietnam (UTC+7) a new day's board starts at 07:00 local time, and a new week's on Monday at 07:00.
- **Each player once.** An entry is a player's best score in the period: the account for a signed-in player, the browser's `X-Player-Id` for a guest (a guest run without one is an entry of its own). `totalEntries` is how many players are on the board.
- **Ranks are deterministic and never shared.** Entries are ordered by score (highest first), then by when it was set (earlier first), then by the score's id, and numbered 1, 2, 3, ... over the whole board, not just the page. The order is total, so a rank never changes between requests unless a new score arrives, and pages never overlap or skip anyone.
- An entry's `player` is the account's username (its identity, for a link to the public profile), display name and avatar, or `null` for a guest. Nothing else about an account is public. Entries are grouped by account, so changing a display name changes nothing about whose scores they are.
- `you` marks the caller's entry. `myRank` and `myScore` are the caller's place and best score on this board, even when the entry is on another page, and `null` when the caller is unknown or has no score in the period; a rank is never made up. The caller is the signed-in player; for a guest it is the `X-Player-Id` header, matched only against scores made as a guest.
- A page past the end returns an empty `entries` list, not an error.
- Scores come only from `POST /api/game-sessions/{id}/finish`, with its checks: a refused run never reaches a leaderboard. A leaderboard cannot be written to, by players or admins; `POST`, `PUT` and `DELETE` answer `405`.

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | `page` is negative, or `size` is outside 1 to 100 |
| `400 BAD_REQUEST` | `period` is not one of the three (they are case-sensitive), or `X-Player-Id` is not a UUID |
| `404 NOT_FOUND` | No active game has that slug |

#### `GET /api/users/me/ranks`

Where the signed-in player stands on every board, for their profile. `401 UNAUTHORIZED` without a session.

```json
{
  "bestRank": 3,
  "bestRankGame": { "slug": "tetris", "name": "Tetris" },
  "games": [
    {
      "game": { "slug": "snake", "name": "Snake" },
      "daily": null,
      "weekly": { "rank": 17, "score": 40 },
      "allTime": { "rank": 120, "score": 52 }
    }
  ]
}
```

One entry per active game, in catalog order. A period is `null` when the player has no score in it. `bestRank` is the best all-time rank in any game (`null` until there is one).

### Health

| Method | Path               | Description |
| ------ | ------------------ | ----------- |
| GET    | `/actuator/health` | Service and database health: `{ "status": "UP" }` |
| GET    | `/actuator/info`   | Application name and version. Not exposed through nginx |

## Coins

Coins are the platform's currency, earned by playing (see [Experience and levels](#experience-and-levels)), the [daily login reward](#daily-login-reward) and admin grants, and spent in the [shop](#shop). Every change to a balance is a transaction in the player's ledger. **No request ever says how many coins to add or take**: the server applies its own rules to what happened. A reward refers to what it rewards (a game session, an achievement, a challenge, a day), and a player can have one transaction of each type for the same thing, so repeating or replaying a request pays nothing more. A balance never goes below zero.

#### `GET /api/users/me/coins`

```json
{ "balance": 1240, "earned": 1740 }
```

`earned` is everything ever earned, spending left out.

#### `GET /api/users/me/transactions`

The caller's ledger, newest first. Query: `page` (from 0) and `size` (1 to 50, default 10).

```json
{
  "entries": [
    {
      "id": 31,
      "amount": -100,
      "balanceAfter": 1240,
      "type": "SHOP_PURCHASE",
      "referenceType": "PURCHASE",
      "referenceId": "4",
      "description": "Bought Extra Pack",
      "createdAt": "2026-09-30T15:40:00.000Z"
    }
  ],
  "page": 0,
  "size": 10,
  "totalEntries": 1,
  "totalPages": 1
}
```

| `type` | What |
| ------ | ---- |
| `GAME_COMPLETION` | Finishing a game (`GAME_SESSION`) |
| `HIGH_SCORE` | Beating your best in a game (`GAME_SESSION`) |
| `ACHIEVEMENT` | Unlocking an achievement (`ACHIEVEMENT`, its code) |
| `DAILY_CHALLENGE` | Completing a daily challenge (`DAILY_CHALLENGE`, its id) |
| `DAILY_LOGIN` | The daily login reward (`DAILY_LOGIN`, the date) |
| `SHOP_PURCHASE` | Buying in the shop; negative (`PURCHASE`, its id) |
| `ADMIN_GRANT` | Coins given by an admin (`ADMIN_GRANT`, the request id); the admin is recorded too |

This is the player's reward history: every reward that pays coins is one entry, with what it was for in `description` ("Achievement: First Coin", "Bought Extra Pack"). An item won with coins is named there too: day 7 of the daily login reads "Daily login, day 7 + 1 × Extra Pack". `balanceAfter` is the balance right after the entry. Who granted coins and the account id are never in it, and there is no way to read another player's history.

### Daily login reward

Once per calendar day, worth more for every day in a row: 50, 60, 70, 80, 100, 125 and 200 coins by default (`DAILY_LOGIN_REWARDS`), with a free Extra Pack on day 7; after day 7 the run starts again from day 1. Missing a day starts it again too. **The day is the server's, midnight to midnight UTC**, and no request carries a date or an amount.

#### `GET /api/daily-login`

```json
{
  "date": "2026-09-30",
  "claimedToday": false,
  "streak": 2,
  "day": 3,
  "days": [
    { "day": 1, "coins": 50, "bonusItem": null, "state": "CLAIMED" },
    { "day": 2, "coins": 60, "bonusItem": null, "state": "CLAIMED" },
    { "day": 3, "coins": 70, "bonusItem": null, "state": "TODAY" },
    { "day": 7, "coins": 200, "bonusItem": "Extra Pack", "state": "UPCOMING" }
  ],
  "resetsAt": "2026-10-01T00:00:00Z"
}
```

(`days` always lists every day; shortened here.) `streak` is the days in a row claimed up to today, or up to yesterday while today is unclaimed; `day` is the day of the run today's claim is (or was) on.

#### `POST /api/daily-login/claim`

Claims today's reward. No body.

```json
{ "day": 3, "streak": 3, "coins": 70, "bonusItem": null, "balance": 1310, "status": { "claimedToday": true } }
```

(`status` is the full `GET /api/daily-login` answer.) A second claim on the same day, even at the same moment, answers `409 DAILY_LOGIN_ALREADY_CLAIMED` and pays nothing.

### Shop

Virtual items for coins; there are no real-money payments. A purchase names the item and a request id; the price, the player and their balance come from the server.

| `type` | What owning it means |
| ------ | -------------------- |
| `PACK` | Extra card packs, opened once the daily pack allowance is gone. `quantity` packs per purchase |
| `BADGE` | Worn on the profile, one at a time; owned once |
| `TITLE` | Shown under the name on the profile, one at a time; owned once |
| `COSMETIC` | A profile frame around the avatar, worn one at a time like a badge; owned once. `icon` names the frame (`frame-ocean`, `frame-gold`, ...) |
| `GAME_SKIN` | A new look for one of a game's pieces, worn in that game; owned once. `gameSlug` says which game and `slot` which piece (Flappy Bird: `bird`, `pipes`, `sky`; Brick Breaker: `paddle`, `ball`, `bricks`); `icon` names the look. One is worn per slot of a game; wearing none means the game's own free look. Purely cosmetic: never shown on the profile and never part of a game's rules |

Packs are **consumable**: owning some never stops a player buying more. Badges, titles, frames and game skins are **equippable** and owned once. Every item also has `gameSlug` and `slot`, `null` except for game skins. Each item says which it is (`consumable`, `equippable`), so a new type of item needs no change to the app's logic, only a handler on the server.

#### `GET /api/shop/items`

Public. Query: `type` (optional, one of the types above) for one category only; anything else is `400`. For a signed-in caller, also their `balance` and `level` and, per item, `owned`, `unlocked` (level high enough), `soldOut` (owns as many as one may), `equipped` (wears it), `affordable` (has the coins) and `wearable` (may put it on now: owns it, or, for an admin, it is a Brick Breaker skin, which admins wear without buying); for a guest these are `null`. Items taken off sale are not listed and cannot be bought.

```json
{
  "balance": 1240,
  "level": 2,
  "items": [
    {
      "id": 1,
      "code": "EXTRA_PACK",
      "name": "Extra Pack",
      "description": "One more card pack, for when today's are gone. Any booster you like.",
      "type": "PACK",
      "price": 100,
      "quantity": 1,
      "maxOwned": null,
      "minLevel": 1,
      "icon": "package",
      "equippable": false,
      "consumable": true,
      "owned": 0,
      "unlocked": true,
      "soldOut": false,
      "equipped": false,
      "affordable": true,
      "wearable": false
    }
  ]
}
```

#### `POST /api/shop/purchases`

```json
{ "itemId": 1, "requestId": "1b4e28ba-2fa1-41d2-883f-0016d3cca427" }
```

`requestId` is a random UUID the client makes for each purchase it means to make. Sending the same one again (a double click, a retried request) answers with the first purchase and `"repeated": true`, without buying or charging again. Responds `201 Created`:

```json
{
  "purchaseId": 4,
  "item": { "id": 1, "code": "EXTRA_PACK", "name": "Extra Pack", "type": "PACK", "price": 100, "owned": 1 },
  "price": 100,
  "quantity": 1,
  "balance": 1140,
  "owned": 1,
  "repeated": false,
  "purchasedAt": "2026-09-30T15:40:00.000Z"
}
```

(`item` is the full shop item as the player now sees it, `equipped` included; shortened here.) The checks, the payment and handing the item over happen in one transaction (if handing it over fails, nothing is charged or recorded), with the player's purchases one at a time, so two purchases at the same moment cannot spend more than the balance.

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | `itemId` or `requestId` is missing |
| `403 LEVEL_TOO_LOW` | The item unlocks at a higher level |
| `404 NOT_FOUND` | No item on sale has that id |
| `409 INSUFFICIENT_COINS` | The balance is lower than the price |
| `409 ITEM_LIMIT_REACHED` | The player already owns as many as one may (badges, titles and frames: one) |

#### `GET /api/users/me/inventory`

```json
{
  "items": [
    {
      "itemId": 7,
      "code": "TITLE_HIGH_ROLLER",
      "name": "High Roller",
      "description": "A title to show under your name.",
      "type": "TITLE",
      "icon": "dice",
      "quantity": 1,
      "equippable": true,
      "equipped": true,
      "consumable": false,
      "acquiredAt": "2026-09-30T15:40:00.000Z"
    }
  ],
  "bonusPacks": 0
}
```

`bonusPacks` is the extra card packs the player has, from every pack item together. The first badge, title or frame a player gets is worn straight away, and so is the first game skin of each slot.

#### `PUT /api/users/me/inventory/{itemId}/equipped`, `DELETE …`

Wears (`PUT`) or takes off (`DELETE`) a badge, title, frame or game skin the caller owns; wearing one takes off the other of its kind (its type, and for a game skin the same slot of the same game). An admin may also wear any Brick Breaker skin on sale without owning it: nothing is bought or charged, and the skin stays out of the inventory (it shows as `equipped` in the shop). Answers with the inventory. `404 NOT_FOUND` for an item the caller may not wear (one they do not own, another game's skin they do not own, an item no longer on sale), `400 ITEM_NOT_EQUIPPABLE` for a pack.

## Admin

Admins only: a player gets `403 FORBIDDEN`, a guest `401 UNAUTHORIZED`, for every method and path under `/api/admin` and `/api/ai`.

#### `GET /api/admin/overview`

The signed-in admin and what being one allows.

```json
{
  "id": 1,
  "username": "admin",
  "role": "ADMIN",
  "privileges": ["AI_MODE", "UNLIMITED_PACKS", "GRANT_COINS"],
  "playerDailyPackLimit": 10
}
```

`playerDailyPackLimit` is the allowance players have, for comparison (`null` when even players have none).

#### `GET /api/admin/stats`

The arcade at a glance. A handful of counts, worked out when asked; "today" starts at midnight UTC.

```json
{
  "totalUsers": 42,
  "activeUsers": 17,
  "newUsersToday": 3,
  "gamesPlayed": 1234,
  "gamesToday": 56,
  "coinsInCirculation": 98765,
  "activities": [
    { "key": "tcg.packsOpened", "label": "Packs opened", "value": 321, "today": 12 },
    { "key": "tcg.cardsCollected", "label": "Cards collected", "value": 3210, "today": 120 }
  ],
  "generatedAt": "2026-09-30T15:40:00.000Z"
}
```

`activeUsers` counts accounts that finished a game or whose coins changed in the last 7 days. `gamesPlayed` includes guests' games. `coinsInCirculation` is every balance added up.

#### `GET /api/admin/users?query={text}`

Accounts whose username contains `text` (1 to 20 characters, any case), alphabetically, at most 20: `id`, `username`, `role`, `level`, `coins`, `memberSince`.

#### `POST /api/admin/users/{id}/coins`

Gives a player coins.

```json
{ "amount": 250, "reason": "Tournament prize", "requestId": "9c1a8f04-55b2-4f0e-8a7e-3e0f8d2b6c11" }
```

`amount` must be a whole number from 1 to 100,000 and `reason` 1 to 150 characters (`400 VALIDATION_FAILED` otherwise); there is no way to take coins away. The grant is recorded in the player's ledger as `ADMIN_GRANT`, with the reason and the admin who made it. Repeating a request with the same `requestId` grants once (`"repeated": true`). Responds `201 Created`:

```json
{ "transactionId": 88, "userId": 7, "username": "pixel", "amount": 250, "balance": 1490, "repeated": false }
```

`404 NOT_FOUND` when there is no account with that id.

#### `GET /api/ai/access`

Whether the signed-in player may use AI mode: `204 No Content` for an admin. The app asks before it loads a game's AI, and in Docker nginx asks it for every request for the AI's code (`/assets/ai/*`), which it serves only on a `204` (otherwise it answers with the same `401` or `403`).

## Card packs (TCG)

The trading-card games have their own endpoints under `/api/tcg`. Browsing the catalog is public; opening packs, the collection and the history belong to the signed-in player, who is always taken from the session.

The arcade carries real card games: the **Pokémon TCG** (data and images from TCGdex) and the **One Piece Card Game** (from OPTCG API). They are imported into the database by a separate job (see [ARCHITECTURE.md](ARCHITECTURE.md#importing-card-games)); **no endpoint here calls an external source**, and there is no endpoint that imports or changes card data. Card images are URLs on the sources' own image hosts.

Each game names its own rarities and gives each a **tier** from 1 (ordinary) to 5 (the rarest), which is what clients use to decide how special a card looks. A card's `metadata` is whatever its game knows about it; its fields differ from game to game. Only active games and packs are listed.

### Catalog

#### `GET /api/tcg/games`

Every active card game, with its rarities from most common to rarest. `GET /api/tcg/games/{slug}` returns one, or `404 NOT_FOUND`.

```json
[
  {
    "id": 2,
    "slug": "pokemon",
    "name": "Pokémon TCG",
    "description": "Booster packs from real Pokémon Trading Card Game sets: Mega Evolution, Scarlet & Violet and the classic Base Set era.",
    "imageUrl": "https://assets.tcgdex.net/en/base/base1/58/high.webp",
    "cardBackUrl": null,
    "accentColor": "#ffcb05",
    "attribution": "Card data and images: TCGdex (tcgdex.net), a community-run open database. Pokémon and its trademarks are © Nintendo, Creatures, GAME FREAK and The Pokémon Company. Cyan Arcade is a fan project, not affiliated with or endorsed by them.",
    "rarities": [
      { "code": "common", "name": "Common", "tier": 1 },
      { "code": "uncommon", "name": "Uncommon", "tier": 2 },
      { "code": "double-rare", "name": "Double Rare", "tier": 3 },
      { "code": "special-illustration-rare", "name": "Special Illustration Rare", "tier": 5 }
    ],
    "setCount": 25,
    "cardCount": 4621
  }
]
```

(Pokémon has 13 rarities; four are shown. One Piece has its own list, from Common to Treasure Rare, with Parallel and Manga Rare for alternate arts.)

| Field | Notes |
| ----- | ----- |
| `imageUrl` | One of the game's own cards, to show for it; may be `null` |
| `cardBackUrl` | The back of the game's cards, or `null` for the arcade's own |
| `accentColor` | The game's color, `#rrggbb`, or `null`. Clients use it for the game's pages |
| `attribution` | Where the data and images come from and whose they are. Show it with the game |

#### `GET /api/tcg/sets?game={slug}`

The sets of a game, in the order its import lists them (newest first for both games); without `game`, the sets of every game. `GET /api/tcg/sets/{id}` returns one, or `404 NOT_FOUND`.

```json
[
  {
    "id": 21,
    "code": "sv03-5",
    "name": "151",
    "description": "Scarlet & Violet series. 207 cards.",
    "series": "Scarlet & Violet",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv03.5/logo.webp",
    "coverImageUrl": "https://assets.tcgdex.net/en/sv/sv03.5/198/high.webp",
    "releasedOn": "2023-09-22",
    "game": { "slug": "pokemon", "name": "Pokémon TCG" },
    "cardCount": 207,
    "packCount": 1
  }
]
```

| Field | Notes |
| ----- | ----- |
| `code` | Identifies the set within its game, in URLs too. Made from the source's id (`sv03.5` → `sv03-5`, `OP-01` → `op01`) |
| `series` | A group of sets ("Scarlet & Violet", "Booster Pack", "Extra Booster"), or `null` |
| `imageUrl` | The set's logo, or `null` when the source has none (One Piece sets) |
| `coverImageUrl` | One of the set's rarest cards, to show for it |
| `releasedOn` | When the set came out, or `null` when the source does not say (One Piece) |

#### `GET /api/tcg/cards?set={id}`

Every card of a set, in the order the set lists them. `set` is required (`400 BAD_REQUEST` without it); an unknown set is `404 NOT_FOUND`.

```json
[
  {
    "id": 3456,
    "externalId": "sv03.5-001",
    "number": "001",
    "name": "Bulbasaur",
    "imageUrl": "https://assets.tcgdex.net/en/sv/sv03.5/001/high.webp",
    "thumbnailUrl": "https://assets.tcgdex.net/en/sv/sv03.5/001/low.webp",
    "rarity": { "code": "common", "name": "Common", "tier": 1 },
    "set": { "id": 21, "code": "sv03-5", "name": "151" },
    "game": { "slug": "pokemon", "name": "Pokémon TCG" },
    "metadata": { "hp": 70, "stage": "Basic", "types": "Grass", "category": "Pokemon", "illustrator": "Yuu Nishida" }
  }
]
```

An alternate art is a card of its own that **shares the number** of the card it is a version of. Three of the cards of One Piece's Romance Dawn, abridged:

```json
[
  { "id": 7386, "externalId": "OP01-120", "number": "OP01-120", "name": "Shanks",
    "rarity": { "code": "secret-rare", "name": "Secret Rare", "tier": 4 },
    "metadata": { "printedRarity": "Secret Rare", "category": "Character", "color": "Red", "cost": 9, "power": 10000 } },
  { "id": 7387, "externalId": "OP01-120_p1", "number": "OP01-120", "name": "Shanks",
    "rarity": { "code": "secret-parallel", "name": "Secret Rare Parallel", "tier": 5 },
    "metadata": { "printedRarity": "Secret Rare", "variant": "Parallel", "...": "" } },
  { "id": 7388, "externalId": "OP01-120_p2", "number": "OP01-120", "name": "Shanks",
    "rarity": { "code": "manga", "name": "Manga Rare", "tier": 5 },
    "metadata": { "printedRarity": "Secret Rare", "variant": "Parallel, Manga, Alternate Art", "...": "" } }
]
```

| Field | Notes |
| ----- | ----- |
| `externalId` | The card's id in the source it was imported from; unique within its game |
| `number` | Printed on the card; text, because real sets number cards like `TG03` or `OP01-120`. Not unique: alternate arts share it |
| `imageUrl` | The full-size image, for a closer look and pack openings |
| `thumbnailUrl` | A smaller image for grids, or `null` when the source has one size only (One Piece) |
| `metadata` | The game's own fields: a Pokémon's HP, types, stage and illustrator; a One Piece card's color, cost, power, counter, types, effect, printed rarity and kind of print |

#### `GET /api/tcg/packs?set={id}`

The packs of a set that can be opened, with their odds in the open. `GET /api/tcg/packs/{id}` returns one; an unknown or withdrawn pack is `404 NOT_FOUND`.

```json
[
  {
    "id": 23,
    "code": "booster",
    "name": "151 Booster Pack",
    "description": "10 cards: four commons, three uncommons, two reverse-holo slots (the second can hold an illustration rare or better) and a rare-or-better slot.",
    "imageUrl": null,
    "setLogoUrl": "https://assets.tcgdex.net/en/sv/sv03.5/logo.webp",
    "coverImageUrl": "https://assets.tcgdex.net/en/sv/sv03.5/198/high.webp",
    "accentColor": "#ffcb05",
    "set": { "id": 21, "code": "sv03-5", "name": "151" },
    "game": { "slug": "pokemon", "name": "Pokémon TCG" },
    "cardsPerPack": 10,
    "poolSize": 207,
    "slots": [
      { "slot": 1, "odds": [ { "rarity": { "code": "common", "name": "Common", "tier": 1 }, "percent": 100.0 } ] },
      { "slot": 9, "odds": [
        { "rarity": { "code": "common", "name": "Common", "tier": 1 }, "percent": 45.8 },
        { "rarity": { "code": "uncommon", "name": "Uncommon", "tier": 2 }, "percent": 27.7 },
        { "rarity": { "code": "rare", "name": "Rare", "tier": 2 }, "percent": 10.6 },
        { "rarity": { "code": "illustration-rare", "name": "Illustration Rare", "tier": 4 }, "percent": 13.3 },
        { "rarity": { "code": "special-illustration-rare", "name": "Special Illustration Rare", "tier": 5 }, "percent": 1.8 },
        { "rarity": { "code": "hyper-rare", "name": "Hyper Rare", "tier": 5 }, "percent": 0.7 }
      ] },
      { "slot": 10, "odds": [
        { "rarity": { "code": "rare", "name": "Rare", "tier": 2 }, "percent": 71.1 },
        { "rarity": { "code": "double-rare", "name": "Double Rare", "tier": 3 }, "percent": 21.3 },
        { "rarity": { "code": "ultra-rare", "name": "Ultra Rare", "tier": 4 }, "percent": 7.6 }
      ] }
    ],
    "oddsNote": "Simulator probabilities. The Pokémon Company does not publish official pull rates; these odds are this arcade's approximation and can differ from real packs."
  }
]
```

(Slots 2 to 8 are left out above.)

| Field | Notes |
| ----- | ----- |
| `imageUrl` | The pack's own artwork, or `null`. Real card games' sources have none; clients draw the pack from `setLogoUrl`, `coverImageUrl` and `accentColor` |
| `cardsPerPack` | One card per slot. Each game has its own layout: 10 for a Pokémon booster, 11 for a classic one, 12 for One Piece |
| `poolSize` | How many different cards can come out of the pack. A pack's pool may be the whole set or part of it |
| `slots` | In the order the cards come out. Each slot lists the rarities it can be, with the chance of each in percent. A rarity the set has no cards of is not listed |
| `oddsNote` | Where the odds come from. Neither publisher gives official pull rates, so both games' odds are **simulator probabilities**, and say so |

### Opening packs

The daily allowance applies to players; **an admin has none**. It is decided by the role the player signed in with, inside the opening itself; otherwise an admin's packs are opened exactly like everyone else's.

#### `POST /api/tcg/packs/{id}/open`

Opens a pack for the signed-in player. **There is no request body**: the pack is in the path, the player in the session, and which cards come out is decided by the server alone, from the cards in the database. Anything a client sends in a body or query is ignored.

The server draws each slot's rarity by the pack's odds and then a card of that rarity from the pack's pool, avoiding repeats within one pack while the pool allows. It records the opening and adds every card to the player's collection, all in one transaction: either all of it happens or none of it does.

Responds `201 Created`:

```json
{
  "opening": {
    "id": 31,
    "pack": {
      "id": 46,
      "code": "booster",
      "name": "Romance Dawn Booster Pack",
      "imageUrl": null,
      "setLogoUrl": null,
      "coverImageUrl": "https://optcgapi.com/media/static/Card_Images/OP01-120_p1.jpg",
      "accentColor": "#c8102e",
      "set": { "id": 44, "code": "op01", "name": "Romance Dawn" },
      "game": { "slug": "one-piece", "name": "One Piece Card Game" }
    },
    "openedAt": "2026-10-01T10:51:46.119739265Z",
    "cards": [
      {
        "position": 12,
        "card": {
          "id": 7259,
          "externalId": "OP01-017",
          "number": "OP01-017",
          "name": "Nico Robin",
          "imageUrl": "https://optcgapi.com/media/static/Card_Images/OP01-017.jpg",
          "thumbnailUrl": null,
          "rarity": { "code": "rare", "name": "Rare", "tier": 2 },
          "set": { "id": 44, "code": "op01", "name": "Romance Dawn" },
          "game": { "slug": "one-piece", "name": "One Piece Card Game" },
          "metadata": { "printedRarity": "Rare", "category": "Character", "color": "Red", "cost": 3, "power": 4000, "counter": 1000, "...": "" }
        },
        "isNew": true
      }
    ]
  },
  "allowance": { "dailyLimit": 10, "openedToday": 9, "leftToday": 1, "resetsAt": "2026-10-02T00:00:00Z" }
}
```

(One card shown; a One Piece booster gives twelve.) `isNew` is `true` when the player did not own the card before this pull; otherwise the card was a duplicate and its quantity went up by one.

| Error | When |
| ----- | ---- |
| `401 UNAUTHORIZED` | Not signed in |
| `403 FORBIDDEN` | No valid CSRF token |
| `404 NOT_FOUND` | No pack has that id |
| `409 PACK_NOT_AVAILABLE` | The pack has been withdrawn, or cannot be filled from its pool. Nothing is used up |
| `429 DAILY_PACK_LIMIT_REACHED` | The player has opened all of today's packs and has no extra packs. Never for an admin |

#### `GET /api/tcg/allowance`

How many packs the signed-in player may still open today. The day is the server's, midnight to midnight UTC.

```json
{ "dailyLimit": 10, "openedToday": 3, "leftToday": 7, "bonusPacks": 2, "resetsAt": "2026-10-02T00:00:00Z" }
```

`bonusPacks` are extra packs from the [shop](#shop) (or the daily login reward). They are used only once `leftToday` reaches 0, one per opening, in the opening's own transaction: an opening that fails keeps its pack.

For an admin, and for everyone when the limit is switched off (`TCG_DAILY_PACK_LIMIT=0`), `dailyLimit` and `leftToday` are `null` and `bonusPacks` is 0: there is no limit, and extra packs are not needed (or used). `openedToday` still counts.

#### `GET /api/tcg/openings`

The signed-in player's opened packs, newest first, each with the cards it gave and whether each was new at the time.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `page` | `0` | Zero-based |
| `size` | `10` | 1 to 50 |

```json
{
  "entries": [ { "id": 31, "pack": { "...": "as above" }, "openedAt": "2026-10-01T10:51:46.119739265Z", "cards": [ "...as above" ] } ],
  "page": 0,
  "size": 10,
  "totalEntries": 1,
  "totalPages": 1
}
```

An entry has the same shape as `opening` in the answer to opening a pack. A pack withdrawn since still appears here.

### Collection

#### `GET /api/tcg/collection`

The signed-in player's cards: how complete the collection is, set by set, and one page of the cards they own, ordered by game, set and the set's own order. Read-only: no endpoint adds, changes or removes a card (`POST` and `PUT` here are `405 METHOD_NOT_ALLOWED`); cards only enter a collection by opening packs.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `game` | all games | A card game's slug: statistics and cards of that game only |
| `set` | all sets | A set id: narrows the list of cards, not the statistics |
| `page` | `0` | Zero-based |
| `size` | `60` | 1 to 500 (enough for every card of the largest set at once) |

```json
{
  "summary": { "uniqueCards": 49, "totalCards": 52, "availableCards": 4621, "completionPercent": 1.1 },
  "sets": [
    {
      "id": 3,
      "code": "me05",
      "name": "Pitch Black",
      "imageUrl": "https://assets.tcgdex.net/en/me/me05/logo.webp",
      "coverImageUrl": "https://assets.tcgdex.net/en/me/me05/114/high.webp",
      "game": { "slug": "pokemon", "name": "Pokémon TCG" },
      "ownedCards": 0,
      "totalCards": 120,
      "completionPercent": 0.0
    }
  ],
  "cards": [
    {
      "card": { "id": 3463, "externalId": "sv03.5-008", "number": "008", "name": "Wartortle", "...": "a card, as in /api/tcg/cards" },
      "quantity": 1,
      "firstObtainedAt": "2026-10-01T10:29:12.898462Z",
      "lastObtainedAt": "2026-10-01T10:29:12.898462Z"
    }
  ],
  "page": 0,
  "size": 60,
  "totalEntries": 49,
  "totalPages": 1
}
```

| Field | Notes |
| ----- | ----- |
| `summary.uniqueCards` | Different cards owned |
| `summary.totalCards` | Cards owned, counting every copy |
| `summary.availableCards` | Different cards that exist (in the chosen game, or in all) |
| `completionPercent` | Different cards owned out of those that exist, 0 to 100 with one decimal |
| `sets` | Every set, including the ones the player owns nothing of yet |
| `cards[].quantity` | How many copies the player owns |

| Error | When |
| ----- | ---- |
| `401 UNAUTHORIZED` | Not signed in |
| `400 VALIDATION_FAILED` | `page` is negative, or `size` is outside 1 to 500 |
