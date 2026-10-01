# API

Base path: `/api`. JSON in and out.

## Conventions

- RESTful, resource-oriented URLs. Plural nouns and kebab-case (`/api/game-sessions`).
- Request and response bodies are DTOs. JPA entities are never serialized.
- Request bodies are validated with Bean Validation. Violations return `400 VALIDATION_FAILED`.
- Timestamps are ISO-8601 in UTC. IDs are numeric unless noted.
- Status codes: `200` OK, `201` Created, `204` No Content, `400` bad input, `401` not authenticated, `403` not allowed, `404` not found, `405` method not allowed, `409` state conflict (e.g. finishing a session twice), `429` too many attempts or over a daily limit, `500` unexpected.
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

Platform codes: `VALIDATION_FAILED`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `INTERNAL_ERROR`. Feature codes: `INVALID_CREDENTIALS`, `TOO_MANY_LOGIN_ATTEMPTS`, `USERNAME_TAKEN`, `SESSION_ALREADY_FINISHED`, `SCORE_OUT_OF_RANGE`, `PACK_NOT_AVAILABLE`, `DAILY_PACK_LIMIT_REACHED`.

## Endpoints

| Method | Path | Access |
| ------ | ---- | ------ |
| `POST` | `/api/auth/register` | public |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/logout` | public |
| `GET` | `/api/auth/session` | public |
| `GET` | `/api/users/me` | signed in |
| `PATCH` | `/api/users/me` | signed in |
| `GET` | `/api/users/me/game-history` | signed in |
| `GET` | `/api/users/me/achievements` | signed in |
| `GET` | `/api/daily-challenges` | public |
| `GET` | `/api/daily-challenges/me` | signed in |
| `GET` | `/api/games`, `/api/games/{slug}` | public |
| `POST` | `/api/game-sessions` | public |
| `POST` | `/api/game-sessions/{id}/finish` | public; a signed-in player's session only by that player |
| `GET` | `/api/leaderboards/{gameSlug}` | public |
| `GET` | `/api/tcg/games`, `/api/tcg/games/{slug}` | public |
| `GET` | `/api/tcg/sets`, `/api/tcg/sets/{id}` | public |
| `GET` | `/api/tcg/cards?set={id}` | public |
| `GET` | `/api/tcg/packs?set={id}`, `/api/tcg/packs/{id}` | public |
| `POST` | `/api/tcg/packs/{id}/open` | signed in |
| `GET` | `/api/tcg/allowance` | signed in |
| `GET` | `/api/tcg/collection` | signed in |
| `GET` | `/api/tcg/openings` | signed in |
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
  "user": { "id": 7, "username": "pixel", "avatar": "ROBOT" }
}
```

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
  "avatar": "GHOST",
  "xp": 185,
  "level": 2,
  "xpIntoLevel": 85,
  "xpForNextLevel": 200,
  "gamesPlayed": 12,
  "totalScore": 4321,
  "achievementsUnlocked": 1,
  "achievementsTotal": 9,
  "memberSince": "2026-09-30T14:02:11.480Z"
}
```

| Field | Notes |
| ----- | ----- |
| `xp` | Total experience points |
| `level` | Derived from `xp` (see [Experience and levels](#experience-and-levels)) |
| `xpIntoLevel`, `xpForNextLevel` | Progress within the current level: 85 of the 200 XP that level 2 takes |
| `gamesPlayed`, `totalScore` | Finished games on this account, and the sum of their scores |

#### `PATCH /api/users/me`

Changes the avatar, the one thing a player can edit.

```json
{ "avatar": "GHOST" }
```

`avatar` is one of `ROBOT`, `CAT`, `DOG`, `GHOST`, `ROCKET`, `CROWN`, `BIRD`, `FISH`. Responds `200 OK` with the updated profile. Any other field in the body is ignored; `400 VALIDATION_FAILED` when `avatar` is missing, `400 BAD_REQUEST` when it is not one of the values.

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
    "unlocked": true,
    "unlockedAt": "2026-09-30T14:05:40.102Z"
  },
  {
    "code": "PLAY_10_GAMES",
    "name": "Regular",
    "description": "Finish 10 games.",
    "xp": 100,
    "unlocked": false,
    "unlockedAt": null
  }
]
```

### Experience and levels

Only signed-in players earn XP, and only by finishing a game session.

| For | XP |
| --- | -- |
| Finishing a game, whatever the score | 10 |
| Beating your own best score in that game | +25 |
| Unlocking an achievement | its `xp` value |
| Completing a daily challenge | its `xpReward` |

Level 1 starts at 0 XP, and each level takes 100 XP more than the one before: level 2 at 100 XP, level 3 at 300, level 4 at 600, level 5 at 1,000.

| Code | Name | Unlocked by | XP |
| ---- | ---- | ----------- | -- |
| `FIRST_GAME` | First Coin | Finishing a game | 50 |
| `PLAY_10_GAMES` | Regular | Finishing 10 games | 100 |
| `PLAY_50_GAMES` | Arcade Rat | Finishing 50 games | 250 |
| `SNAKE_25` | Growing Up | A score of 25 in Snake | 100 |
| `SNAKE_100` | Python | A score of 100 in Snake | 250 |
| `REACH_512` | Halfway There | A 512 tile in 2048 (`highestTile`) | 100 |
| `REACH_2048` | Two Zero Four Eight | A 2048 tile in 2048 (`highestTile`) | 250 |
| `TETRIS_10_LINES` | Line Worker | 10 lines in one game of Tetris (`lines`) | 100 |
| `TETRIS_40_LINES` | Marathon | 40 lines in one game of Tetris (`lines`) | 250 |

Each achievement is awarded once per player.

### Daily challenges

Every day each game in the catalog gets one challenge, for example "Clear 5 lines in one game of Tetris". A challenge is completed by a single finished run that reaches its target, and pays its XP once.

- **The day is the server's.** A day runs from midnight to midnight UTC. No request carries a date, and a run counts for the day on which it is finished.
- **Completing is not an endpoint.** A challenge is completed by finishing a game session (`POST /api/game-sessions/{id}/finish`) while signed in. The response's `rewards.bonuses` lists what the run completed.
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
      "target": 5,
      "xpReward": 30,
      "date": "2026-09-30"
    }
  ]
}
```

| Field | Notes |
| ----- | ----- |
| `date` | The day these challenges belong to, in UTC |
| `resetsAt` | When the next set takes over |
| `challenges[].game` | The game the challenge is played in |
| `challenges[].target` | The number to reach in one run; `1` for "finish a game". `description` says what is counted |
| `challenges[].xpReward` | XP for completing it |

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
      "target": 5,
      "xpReward": 30,
      "date": "2026-09-30",
      "completed": true,
      "completedAt": "2026-09-30T15:38:02.114Z"
    }
  ]
}
```

`completedAt` is `null` until the challenge is completed.

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
| `details` | Optional. Up to 10 whole numbers the game reports about the run, keyed by a short name (`length`, `lines`, `highestTile`, …). Used to decide achievements and daily challenges, and not stored |

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
    "personalBest": true,
    "achievements": [
      { "code": "FIRST_GAME", "name": "First Coin", "description": "Finish your first game.", "xp": 50 }
    ],
    "bonuses": [
      { "type": "DAILY_CHALLENGE", "title": "Light Snack", "xp": 25 }
    ],
    "totalXp": 110,
    "level": 2,
    "leveledUp": true
  }
}
```

- `durationMs` is measured by the server, from the session's start to this request. The client does not report a duration.
- `rewards` is `null` for a run that was started by a guest. Otherwise it says what this run earned and where the player stands afterwards. `achievements` lists only those unlocked by this run, and `bonuses` the daily challenges it completed. `xpEarned` is the total of everything.

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | `score` is missing or negative, or `details` is malformed |
| `400 SCORE_OUT_OF_RANGE` | The score is higher than the game can produce (Snake: 253, 2048: 4,000,000, Tetris: no limit). The session stays open |
| `400 BAD_REQUEST` | The id is not a UUID |
| `403 FORBIDDEN` | The session was started by a signed-in player and the caller is someone else, or not signed in |
| `404 NOT_FOUND` | No session has that id |
| `409 SESSION_ALREADY_FINISHED` | The session was finished before. The first score stands |

There is no endpoint to read or list sessions.

### Leaderboards

#### `GET /api/leaderboards/{gameSlug}`

Returns one page of a game's recorded scores, best first. Public.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `page` | `0` | Zero-based |
| `size` | `10` | 1 to 50 |

```json
{
  "gameSlug": "2048",
  "entries": [
    {
      "rank": 1,
      "player": { "username": "pixel", "avatar": "GHOST" },
      "score": 15200,
      "durationMs": 412000,
      "achievedAt": "2026-09-30T13:28:40.975Z",
      "you": true
    },
    { "rank": 2, "player": null, "score": 1512, "durationMs": 95000, "achievedAt": "2026-09-30T13:31:02.118Z", "you": false }
  ],
  "page": 0,
  "size": 10,
  "totalEntries": 2,
  "totalPages": 1,
  "player": { "bestScore": 15200, "rank": 1 }
}
```

- Every finished run is an entry, so one player can appear more than once.
- `rank` is the position among **all** of the game's scores, not just this page. Equal scores share a rank and the next rank is skipped (1, 1, 3). Among equal scores, the one achieved first is listed first.
- An entry's `player` is the username and avatar of the account that set the score, or `null` for a guest. Nothing else about an account is public.
- `you` marks the caller's own entries, and the top-level `player` is the caller's best score and its rank, even if that entry is on another page. The caller is the signed-in player; for a guest it is the `X-Player-Id` header, matched only against scores made as a guest. So people who share a browser are never shown each other's scores as their own. `player` is `null` when the caller is unknown or has no score in the game.
- A page past the end returns an empty `entries` list, not an error.

| Error | When |
| ----- | ---- |
| `400 VALIDATION_FAILED` | `page` is negative, or `size` is outside 1 to 50 |
| `400 BAD_REQUEST` | `X-Player-Id` is not a UUID |
| `404 NOT_FOUND` | No active game has that slug |

### Health

| Method | Path               | Description |
| ------ | ------------------ | ----------- |
| GET    | `/actuator/health` | Service and database health: `{ "status": "UP" }` |
| GET    | `/actuator/info`   | Application name and version. Not exposed through nginx |

## Card packs (TCG)

The trading-card game has its own endpoints under `/api/tcg`. Browsing the catalog is public; opening packs, the collection and the history belong to the signed-in player, who is always taken from the session.

Several card games can live side by side. Each one names its own rarities and gives each a **tier** from 1 (ordinary) to 5 (the rarest), which is what clients use to decide how special a card looks. A card's `metadata` is whatever its game knows about it; its fields differ from game to game.

Only active games and packs are listed. Card games come from imported datasets, not from this API (see [ARCHITECTURE.md](ARCHITECTURE.md#importing-card-games)).

### Catalog

#### `GET /api/tcg/games`

Every active card game, with its rarities from most common to rarest. `GET /api/tcg/games/{slug}` returns one, or `404 NOT_FOUND`.

```json
[
  {
    "id": 1,
    "slug": "cyan-critters",
    "name": "Cyan Critters",
    "description": "The arcade's own card game: small, round and very collectible.",
    "imageUrl": "/tcg-assets/cyan-critters/game.svg",
    "cardBackUrl": null,
    "rarities": [
      { "code": "common", "name": "Common", "tier": 1 },
      { "code": "uncommon", "name": "Uncommon", "tier": 2 },
      { "code": "rare", "name": "Rare", "tier": 3 },
      { "code": "epic", "name": "Epic", "tier": 4 },
      { "code": "legendary", "name": "Legendary", "tier": 5 }
    ],
    "setCount": 2,
    "cardCount": 36
  }
]
```

`cardBackUrl` is the back of the game's cards, or `null` for the arcade's own.

#### `GET /api/tcg/sets?game={slug}`

The sets of a game, in the order its dataset lists them; without `game`, the sets of every game. `GET /api/tcg/sets/{id}` returns one, or `404 NOT_FOUND`.

```json
[
  {
    "id": 1,
    "code": "pixel-meadow",
    "name": "Pixel Meadow",
    "description": "Sunny fields, mossy rocks and the critters that nap on them.",
    "imageUrl": "/tcg-assets/cyan-critters/pixel-meadow/set.svg",
    "releasedOn": "2026-09-01",
    "game": { "slug": "cyan-critters", "name": "Cyan Critters" },
    "cardCount": 18,
    "packCount": 2
  }
]
```

#### `GET /api/tcg/cards?set={id}`

Every card of a set, in the order of their numbers. `set` is required (`400 BAD_REQUEST` without it); an unknown set is `404 NOT_FOUND`.

```json
[
  {
    "id": 17,
    "number": "017",
    "name": "Solarhorn",
    "imageUrl": "/tcg-assets/cyan-critters/pixel-meadow/cards/017.svg",
    "rarity": { "code": "epic", "name": "Epic", "tier": 4 },
    "set": { "id": 1, "code": "pixel-meadow", "name": "Pixel Meadow" },
    "game": { "slug": "cyan-critters", "name": "Cyan Critters" },
    "metadata": { "type": "Spark", "hp": 140, "flavor": "Carries a little piece of noon between its horns." }
  }
]
```

`number` is text: real card games number cards like `TG03` or `SV-P 012`.

#### `GET /api/tcg/packs?set={id}`

The packs of a set that can be opened, with their odds in the open. `GET /api/tcg/packs/{id}` returns one; an unknown or withdrawn pack is `404 NOT_FOUND`.

```json
[
  {
    "id": 1,
    "code": "sunrise",
    "name": "Sunrise Pack",
    "description": "Warm light and crackling manes. Solarhorn waits inside.",
    "imageUrl": "/tcg-assets/cyan-critters/pixel-meadow/packs/sunrise.svg",
    "set": { "id": 1, "code": "pixel-meadow", "name": "Pixel Meadow" },
    "game": { "slug": "cyan-critters", "name": "Cyan Critters" },
    "cardsPerPack": 5,
    "poolSize": 16,
    "slots": [
      { "slot": 1, "odds": [ { "rarity": { "code": "common", "name": "Common", "tier": 1 }, "percent": 100.0 } ] },
      { "slot": 4, "odds": [
        { "rarity": { "code": "uncommon", "name": "Uncommon", "tier": 2 }, "percent": 90.0 },
        { "rarity": { "code": "rare", "name": "Rare", "tier": 3 }, "percent": 10.0 }
      ] },
      { "slot": 5, "odds": [
        { "rarity": { "code": "rare", "name": "Rare", "tier": 3 }, "percent": 75.0 },
        { "rarity": { "code": "epic", "name": "Epic", "tier": 4 }, "percent": 20.0 },
        { "rarity": { "code": "legendary", "name": "Legendary", "tier": 5 }, "percent": 5.0 }
      ] }
    ]
  }
]
```

(Slots 2 and 3, the same as slot 1, are left out above.)

| Field | Notes |
| ----- | ----- |
| `cardsPerPack` | One card per slot |
| `poolSize` | How many different cards can come out of the pack. A pack's pool may be the whole set or part of it |
| `slots` | In the order the cards come out. Each slot lists the rarities it can be, with the chance of each in percent |

### Opening packs

#### `POST /api/tcg/packs/{id}/open`

Opens a pack for the signed-in player. **There is no request body**: the pack is in the path, the player in the session, and which cards come out is decided by the server alone. Anything a client sends in a body or query is ignored.

The server draws each slot's rarity by the pack's odds and then a card of that rarity from the pack's pool, avoiding repeats within one pack while the pool allows. It records the opening and adds every card to the player's collection, all in one transaction: either all of it happens or none of it does.

Responds `201 Created`:

```json
{
  "opening": {
    "id": 15,
    "pack": {
      "id": 1,
      "code": "sunrise",
      "name": "Sunrise Pack",
      "imageUrl": "/tcg-assets/cyan-critters/pixel-meadow/packs/sunrise.svg",
      "set": { "id": 1, "code": "pixel-meadow", "name": "Pixel Meadow" },
      "game": { "slug": "cyan-critters", "name": "Cyan Critters" }
    },
    "openedAt": "2026-10-01T05:48:00.937Z",
    "cards": [
      {
        "position": 1,
        "card": {
          "id": 4,
          "number": "004",
          "name": "Puffkin",
          "imageUrl": "/tcg-assets/cyan-critters/pixel-meadow/cards/004.svg",
          "rarity": { "code": "common", "name": "Common", "tier": 1 },
          "set": { "id": 1, "code": "pixel-meadow", "name": "Pixel Meadow" },
          "game": { "slug": "cyan-critters", "name": "Cyan Critters" },
          "metadata": { "type": "Breeze", "hp": 30, "flavor": "Light enough to ride a dandelion seed." }
        },
        "isNew": true
      }
    ]
  },
  "allowance": { "dailyLimit": 10, "openedToday": 1, "leftToday": 9, "resetsAt": "2026-10-02T00:00:00Z" }
}
```

(One card shown; a Sunrise Pack gives five.) `isNew` is `true` when the player did not own the card before this pull; otherwise the card was a duplicate and its quantity went up by one.

| Error | When |
| ----- | ---- |
| `401 UNAUTHORIZED` | Not signed in |
| `403 FORBIDDEN` | No valid CSRF token |
| `404 NOT_FOUND` | No pack has that id |
| `409 PACK_NOT_AVAILABLE` | The pack has been withdrawn, or cannot be filled from its pool. Nothing is used up |
| `429 DAILY_PACK_LIMIT_REACHED` | The player has opened all of today's packs |

#### `GET /api/tcg/allowance`

How many packs the signed-in player may still open today. The day is the server's, midnight to midnight UTC.

```json
{ "dailyLimit": 10, "openedToday": 3, "leftToday": 7, "resetsAt": "2026-10-02T00:00:00Z" }
```

With the limit switched off (`TCG_DAILY_PACK_LIMIT=0`), `dailyLimit` and `leftToday` are `null`.

#### `GET /api/tcg/openings`

The signed-in player's opened packs, newest first, each with the cards it gave and whether each was new at the time.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `page` | `0` | Zero-based |
| `size` | `10` | 1 to 50 |

```json
{
  "entries": [ { "id": 15, "pack": { "...": "as above" }, "openedAt": "2026-10-01T05:48:00.937Z", "cards": [ "...as above" ] } ],
  "page": 0,
  "size": 10,
  "totalEntries": 1,
  "totalPages": 1
}
```

An entry has the same shape as `opening` in the answer to opening a pack. A pack withdrawn since still appears here.

### Collection

#### `GET /api/tcg/collection`

The signed-in player's cards: how complete the collection is, set by set, and one page of the cards they own, ordered by game, set and card number. Read-only: no endpoint adds, changes or removes a card (`POST` and `PUT` here are `405 METHOD_NOT_ALLOWED`); cards only enter a collection by opening packs.

| Query parameter | Default | Notes |
| --------------- | ------- | ----- |
| `game` | all games | A card game's slug: statistics and cards of that game only |
| `set` | all sets | A set id: narrows the list of cards, not the statistics |
| `page` | `0` | Zero-based |
| `size` | `60` | 1 to 200 |

```json
{
  "summary": { "uniqueCards": 5, "totalCards": 5, "availableCards": 36, "completionPercent": 13.9 },
  "sets": [
    {
      "id": 1,
      "code": "pixel-meadow",
      "name": "Pixel Meadow",
      "imageUrl": "/tcg-assets/cyan-critters/pixel-meadow/set.svg",
      "game": { "slug": "cyan-critters", "name": "Cyan Critters" },
      "ownedCards": 5,
      "totalCards": 18,
      "completionPercent": 27.8
    }
  ],
  "cards": [
    {
      "card": { "id": 1, "number": "001", "name": "Sproutle", "...": "a card, as in /api/tcg/cards" },
      "quantity": 1,
      "firstObtainedAt": "2026-10-01T05:48:00.937Z",
      "lastObtainedAt": "2026-10-01T05:48:00.937Z"
    }
  ],
  "page": 0,
  "size": 60,
  "totalEntries": 5,
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
| `400 VALIDATION_FAILED` | `page` is negative, or `size` is outside 1 to 200 |
