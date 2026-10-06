import { vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import type { DailyChallenge } from '@/api/dailyChallenges'
import type { CoinTransaction, DailyLoginStatus, InventoryEntry, ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import type { Rewards } from '@/api/gameSessions'
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResponse,
  PlayerRanks,
  Standing,
} from '@/api/leaderboards'
import type { AchievementStatus, GameHistoryEntry, ProfileResponse, PublicProfile, StatsResponse } from '@/api/profile'

export const catalogFixture: GameResponse[] = [
  {
    id: 1,
    slug: 'snake',
    name: 'Snake',
    description: 'Guide a hungry snake around the board.',
    category: 'ARCADE',
    thumbnailUrl: '/thumbnails/snake.svg',
    accentColor: '#22c55e',
    featured: true,
  },
  {
    id: 2,
    slug: '2048',
    name: '2048',
    description: 'Slide the tiles and merge matching numbers.',
    category: 'PUZZLE',
    thumbnailUrl: '/thumbnails/2048.svg',
    accentColor: '#f59e0b',
    featured: true,
  },
  {
    id: 3,
    slug: 'tetris',
    name: 'Tetris',
    description: 'Rotate and drop falling blocks to clear lines.',
    category: 'PUZZLE',
    thumbnailUrl: '/thumbnails/tetris.svg',
    accentColor: '#8b5cf6',
    featured: true,
  },
]

/** A signed-in player for tests that need one. */
export const pixel: SessionUser = { id: 7, username: 'pixel', displayName: 'pixel', avatar: 'ROBOT', role: 'USER' }

/** The seeded admin account, as the session describes it. */
export const admin: SessionUser = { id: 1, username: 'admin', displayName: 'admin', avatar: 'ROBOT', role: 'ADMIN' }

export const achievementsFixture: AchievementStatus[] = [
  {
    code: 'FIRST_GAME',
    name: 'First Coin',
    description: 'Finish your first game.',
    xp: 50,
    coins: 100,
    unlocked: true,
    unlockedAt: '2026-09-29T09:00:00Z',
  },
  {
    code: 'PLAY_10_GAMES',
    name: 'Regular',
    description: 'Finish 10 games.',
    xp: 100,
    coins: 150,
    unlocked: false,
    unlockedAt: null,
  },
  {
    code: 'SNAKE_25',
    name: 'Growing Up',
    description: 'Eat 25 apples in one game of Snake.',
    xp: 100,
    coins: 150,
    unlocked: false,
    unlockedAt: null,
  },
]

/** A day's worth of challenges: one per game, the first one already completed by the signed-in player. */
export const challengesFixture: Partial<DailyChallenge>[] = [
  {
    id: 1,
    title: 'Snack Time',
    description: 'Eat 10 apples in one game of Snake.',
    game: { slug: 'snake', name: 'Snake' },
    target: 10,
    xpReward: 35,
    coinReward: 70,
    completed: true,
    completedAt: '2026-09-30T09:00:00Z',
  },
  {
    id: 2,
    title: 'Five Twelve',
    description: 'Make a 512 tile in 2048.',
    game: { slug: '2048', name: '2048' },
    target: 512,
    xpReward: 60,
    coinReward: 120,
  },
  {
    id: 3,
    title: 'Tidy Up',
    description: 'Clear 5 lines in one game of Tetris.',
    game: { slug: 'tetris', name: 'Tetris' },
    target: 5,
    xpReward: 30,
    coinReward: 60,
  },
]

/** Some of what the shop sells, as a guest sees it. */
export const shopItemsFixture: ShopItem[] = [
  {
    id: 1,
    code: 'EXTRA_PACK',
    name: 'Extra Pack',
    description: "One more card pack, for when today's are gone.",
    type: 'PACK',
    price: 100,
    quantity: 1,
    maxOwned: null,
    minLevel: 1,
    icon: 'package',
    owned: null,
    unlocked: null,
    soldOut: null,
  },
  {
    id: 3,
    code: 'PACK_BOX',
    name: 'Pack Box',
    description: 'Ten extra card packs.',
    type: 'PACK',
    price: 800,
    quantity: 10,
    maxOwned: null,
    minLevel: 3,
    icon: 'box',
    owned: null,
    unlocked: null,
    soldOut: null,
  },
  {
    id: 4,
    code: 'BADGE_GOLD_COIN',
    name: 'Gold Coin',
    description: 'A shiny badge for your profile.',
    type: 'BADGE',
    price: 500,
    quantity: 1,
    maxOwned: 1,
    minLevel: 1,
    icon: 'coin',
    owned: null,
    unlocked: null,
    soldOut: null,
  },
  {
    id: 7,
    code: 'TITLE_HIGH_ROLLER',
    name: 'High Roller',
    description: 'A title to show under your name.',
    type: 'TITLE',
    price: 1000,
    quantity: 1,
    maxOwned: 1,
    minLevel: 1,
    icon: 'dice',
    owned: null,
    unlocked: null,
    soldOut: null,
  },
]

/** The daily login rewards, as configured by default. */
export const dailyLoginRewards = [50, 60, 70, 80, 100, 125, 200]

export const SESSION_ID = '7f1d3c1e-8a52-4a39-9f0e-2a6a3b1c4d5e'
export const CSRF_TOKEN = 'test-csrf-token'

const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } })

const problem = (status: number, code: string, detail: string, extra: object = {}) =>
  json({ status, title: 'Error', detail, code, ...extra }, status, 'application/problem+json')

const notFound = (detail: string) => problem(404, 'NOT_FOUND', detail)

/** What a request looks like to a handler passed to {@link mockApi}. */
export interface MockRequest {
  path: string
  method: string
  url: URL
  /** The JSON body, or `undefined` when the request had none. */
  body: Record<string, unknown> | undefined
  /** Who is signed in at the moment of the request. */
  user: SessionUser | null
}

/** Answers requests the built-in fake does not know, such as a module's own endpoints. */
export type MockHandler = (request: MockRequest) => Response | undefined

export const mockJson = json
export const mockProblem = problem

interface MockApiOptions {
  games?: GameResponse[]
  /** Make every request fail as if the server were unreachable. */
  offline?: boolean
  /** HTTP status for `POST /api/game-sessions/{id}/finish`. Anything but 200 returns a problem. */
  finishStatus?: number
  /**
   * Board entries, best first, per game slug (every period) or per `slug:PERIOD` (that period
   * only, e.g. `snake:WEEKLY`). Games not listed have empty boards.
   */
  scores?: Record<string, Partial<LeaderboardEntry>[]>
  /** The caller's rank and best score, per game slug or per `slug:PERIOD`, like `scores`. */
  standings?: Record<string, Standing | null>
  /** The signed-in player's ranks on every board (`GET /api/users/me/ranks`). */
  ranks?: PlayerRanks
  /** Who is signed in when the test starts. Nobody by default. */
  user?: SessionUser | null
  /** Registered accounts as username → password, for the login and register endpoints. */
  accounts?: Record<string, string>
  /** Overrides for the signed-in player's profile. */
  profile?: Partial<ProfileResponse>
  achievements?: AchievementStatus[]
  /** The signed-in player's finished games, newest first. */
  history?: Partial<GameHistoryEntry>[]
  /** What finishing a game earns the signed-in player. */
  rewards?: Rewards
  /** Today's daily challenges. `completed` only reaches a signed-in player. None by default. */
  challenges?: Partial<DailyChallenge>[]
  /** HTTP status for the daily challenge endpoints. Anything but 200 returns a problem. */
  challengesStatus?: number
  /** When today's challenges are replaced. A day from now by default. */
  challengesResetAt?: string
  /** The signed-in player's coins. 1,240 by default. */
  coins?: number
  /** The signed-in player's coin transactions, newest first. */
  transactions?: Partial<CoinTransaction>[]
  /** Where the signed-in player stands with the daily login reward. */
  dailyLogin?: { claimedToday?: boolean; streak?: number }
  /** What the shop sells. */
  shopItems?: ShopItem[]
  /** The signed-in player's level, as the shop sees it. */
  level?: number
  /** Overrides for the signed-in player's statistics. */
  stats?: Partial<StatsResponse>
  /** Other players' public profiles, by username (the signed-in player's own is built from the session). */
  publicProfiles?: Record<string, Partial<PublicProfile>>
  /** Make `PATCH /api/users/me` fail with this status. */
  profileUpdateStatus?: number
  /** Asked first, in order. The first one that returns a response answers the request. */
  handlers?: MockHandler[]
}

const defaultRewards: Rewards = {
  xpEarned: 10,
  coinsEarned: 5,
  personalBest: false,
  achievements: [],
  bonuses: [],
  totalXp: 10,
  level: 1,
  leveledUp: false,
  coinBalance: 1245,
}

/** Builds the page of a leaderboard the way the backend would. */
function leaderboardPage(
  gameSlug: string,
  period: LeaderboardPeriod,
  scores: Partial<LeaderboardEntry>[],
  page: number,
  size: number,
  mine: Standing | null,
): LeaderboardResponse {
  const entries = scores.slice(page * size, page * size + size).map((entry, index) => ({
    rank: page * size + index + 1,
    player: null,
    score: 0,
    durationMs: 60_000,
    achievedAt: '2026-09-30T10:00:00Z',
    you: false,
    ...entry,
  }))
  const timed = period !== 'ALL_TIME'
  return {
    gameSlug,
    period,
    periodStart: timed ? '2026-09-28T00:00:00Z' : null,
    periodEnd: timed ? new Date(Date.now() + 5 * 60 * 60_000 + 12 * 60_000 + 30_000).toISOString() : null,
    entries,
    page,
    size,
    totalEntries: scores.length,
    totalPages: Math.ceil(scores.length / size),
    myRank: mine?.rank ?? null,
    myScore: mine?.score ?? null,
  }
}

/**
 * Replaces `fetch` with a small in-memory version of the backend API, including who is signed in.
 * It also hands out a CSRF cookie, as the real server does with every response.
 */
export function mockApi({
  games = catalogFixture,
  offline = false,
  finishStatus = 200,
  scores = {},
  standings = {},
  ranks = { bestRank: null, bestRankGame: null, games: [] },
  user = null,
  accounts = {},
  profile = {},
  achievements = achievementsFixture,
  history = [],
  rewards = defaultRewards,
  challenges = [],
  challengesStatus = 200,
  challengesResetAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
  coins = 1240,
  transactions = [],
  dailyLogin = {},
  shopItems = shopItemsFixture,
  level = 2,
  stats = {},
  publicProfiles = {},
  profileUpdateStatus = 200,
  handlers = [],
}: MockApiOptions = {}) {
  document.cookie = `XSRF-TOKEN=${CSRF_TOKEN}; path=/`

  let currentUser = user
  // The economy keeps state like the server does: claims and purchases change what comes next.
  let balance = coins
  let claimedToday = dailyLogin.claimedToday ?? false
  const streak = dailyLogin.streak ?? 0
  const owned = new Map<number, number>()
  const purchases = new Map<string, Record<string, unknown>>()
  const worn = new Set<number>()
  let bio: string | null = null
  const passwords = new Map(Object.entries(accounts).map(([name, password]) => [name.toLowerCase(), password]))

  const profileOf = (player: SessionUser): ProfileResponse => ({
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    bio,
    role: player.role,
    xp: 185,
    level: 2,
    xpIntoLevel: 85,
    xpForNextLevel: 200,
    coins: balance,
    gamesPlayed: 12,
    totalScore: 4321,
    achievementsUnlocked: achievements.filter((achievement) => achievement.unlocked).length,
    achievementsTotal: achievements.length,
    memberSince: '2026-09-01T08:00:00Z',
    title: null,
    badge: null,
    ...profile,
    // The avatar can change during a test, so it always comes from the current session.
    avatar: player.avatar,
  })

  const session = (status = 200) => json({ authenticated: currentUser !== null, user: currentUser }, status)
  const unauthorized = () => problem(401, 'UNAUTHORIZED', 'Authentication is required')

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (offline) throw new TypeError('Failed to fetch')

    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname
    const method = init?.method ?? 'GET'
    const sentBody = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    const body = sentBody ?? {}

    for (const handler of handlers) {
      const response = handler({ path, method, url, body: sentBody, user: currentUser })
      if (response) return response
    }

    // --- Authentication -------------------------------------------------------------------
    if (path === '/api/auth/session') return session()
    if (method === 'POST' && path === '/api/auth/login') {
      const username = String(body.username)
      if (passwords.get(username.toLowerCase()) !== body.password) {
        return problem(401, 'INVALID_CREDENTIALS', 'Wrong username or password')
      }
      currentUser = {
        id: 7,
        username,
        displayName: username,
        avatar: 'ROBOT',
        role: username.toLowerCase() === 'admin' ? 'ADMIN' : 'USER',
      }
      return session()
    }
    if (method === 'POST' && path === '/api/auth/register') {
      const username = String(body.username)
      if (String(body.password).length < 8) {
        return problem(400, 'VALIDATION_FAILED', 'Request validation failed', {
          errors: [{ field: 'password', message: 'must be 8 to 72 characters long' }],
        })
      }
      if (passwords.has(username.toLowerCase())) {
        return problem(409, 'USERNAME_TAKEN', `The username '${username}' is already taken`)
      }
      passwords.set(username.toLowerCase(), String(body.password))
      currentUser = { id: 8, username, displayName: username, avatar: 'ROBOT', role: 'USER' }
      return session(201)
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      currentUser = null
      return new Response(null, { status: 204 })
    }

    // --- Admins only: like the server, by role ----------------------------------------------
    if (path === '/api/ai/access' || path.startsWith('/api/admin/')) {
      if (!currentUser) return unauthorized()
      if (currentUser.role !== 'ADMIN') return problem(403, 'FORBIDDEN', 'You are not allowed to do this')
      if (path === '/api/ai/access') return new Response(null, { status: 204 })
      if (path === '/api/admin/overview') {
        return json({
          id: currentUser.id,
          username: currentUser.username,
          role: 'ADMIN',
          privileges: ['AI_MODE', 'UNLIMITED_PACKS', 'GRANT_COINS'],
          playerDailyPackLimit: 10,
        })
      }
      if (path === '/api/admin/stats') {
        return json({
          totalUsers: 42,
          activeUsers: 17,
          newUsersToday: 3,
          gamesPlayed: 1234,
          gamesToday: 56,
          coinsInCirculation: 98765,
          activities: [
            { key: 'tcg.packsOpened', label: 'Packs opened', value: 321, today: 12 },
            { key: 'tcg.cardsCollected', label: 'Cards collected', value: 3210, today: 120 },
          ],
          generatedAt: '2026-09-30T10:00:00Z',
        })
      }
      if (path === '/api/admin/users') {
        const query = (url.searchParams.get('query') ?? '').toLowerCase()
        return json(
          [
            { id: 7, username: 'pixel', role: 'USER', level: 2, coins: balance, memberSince: '2026-09-01T08:00:00Z' },
            { id: 9, username: 'pixie', role: 'USER', level: 1, coins: 0, memberSince: '2026-09-02T08:00:00Z' },
          ].filter((account) => account.username.includes(query)),
        )
      }
      const grantTo = /^\/api\/admin\/users\/(\d+)\/coins$/.exec(path)?.[1]
      if (method === 'POST' && grantTo) {
        const amount = Number(body.amount)
        if (!Number.isInteger(amount) || amount < 1 || amount > 100_000 || !String(body.reason ?? '').trim()) {
          return problem(400, 'VALIDATION_FAILED', 'Request validation failed')
        }
        return json(
          { transactionId: 99, userId: Number(grantTo), username: 'pixel', amount, balance: amount, repeated: false },
          201,
        )
      }
    }

    // --- The economy: coins, the daily login reward, the shop ---------------------------------
    if (path === '/api/shop/items') {
      return json({
        balance: currentUser ? balance : null,
        level: currentUser ? level : null,
        items: shopItems.map((item) => {
          if (!currentUser) return item
          const count = owned.get(item.id) ?? 0
          return {
            ...item,
            owned: count,
            unlocked: level >= item.minLevel,
            soldOut: item.maxOwned !== null && count + item.quantity > item.maxOwned,
          }
        }),
      })
    }
    if (method === 'POST' && path === '/api/shop/purchases') {
      if (!currentUser) return unauthorized()
      const requestId = String(body.requestId)
      const earlier = purchases.get(requestId)
      if (earlier) return json({ ...earlier, repeated: true }, 201)
      const item = shopItems.find((candidate) => candidate.id === body.itemId)
      if (!item) return notFound('Shop item was not found')
      if (balance < item.price) {
        return problem(409, 'INSUFFICIENT_COINS', `That costs ${item.price} coins and you have ${balance}`)
      }
      balance -= item.price
      owned.set(item.id, (owned.get(item.id) ?? 0) + item.quantity)
      const purchase = {
        purchaseId: purchases.size + 1,
        item,
        price: item.price,
        quantity: item.quantity,
        balance,
        owned: owned.get(item.id),
        repeated: false,
        purchasedAt: '2026-09-30T10:00:00Z',
      }
      purchases.set(requestId, purchase)
      return json(purchase, 201)
    }
    if (path === '/api/daily-login' || path === '/api/daily-login/claim') {
      if (!currentUser) return unauthorized()
      const status = (): DailyLoginStatus => {
        const current = claimedToday ? streak + 1 : streak
        const day = ((claimedToday ? current : current + 1) - 1) % 7 + 1
        return {
          date: '2026-09-30',
          claimedToday,
          streak: current,
          day,
          days: dailyLoginRewards.map((reward, index) => ({
            day: index + 1,
            coins: reward,
            bonusItem: index === 6 ? 'Extra Pack' : null,
            state:
              index + 1 < day || (index + 1 === day && claimedToday)
                ? 'CLAIMED'
                : index + 1 === day
                  ? 'TODAY'
                  : 'UPCOMING',
          })),
          resetsAt: challengesResetAt,
        }
      }
      if (method === 'POST') {
        if (claimedToday) {
          return problem(409, 'DAILY_LOGIN_ALREADY_CLAIMED', "Today's reward has already been claimed. Come back tomorrow!")
        }
        const day = status().day
        claimedToday = true
        const reward = dailyLoginRewards[day - 1]
        balance += reward
        return json({ day, streak: streak + 1, coins: reward, bonusItem: day === 7 ? 'Extra Pack' : null, balance, status: status() })
      }
      return json(status())
    }

    // --- Public profiles --------------------------------------------------------------------
    const profileOwner = /^\/api\/users\/([^/]+)\/profile$/.exec(path)?.[1]
    if (profileOwner && method === 'GET') {
      const name = decodeURIComponent(profileOwner).toLowerCase()
      const own = currentUser && currentUser.username.toLowerCase() === name ? currentUser : null
      const other = Object.entries(publicProfiles).find(([key]) => key.toLowerCase() === name)?.[1]
      if (!own && !other) return notFound(`Player '${profileOwner}' was not found`)
      const base: PublicProfile = {
        username: own?.username ?? decodeURIComponent(profileOwner),
        displayName: own?.displayName ?? decodeURIComponent(profileOwner),
        avatar: own?.avatar ?? 'ROBOT',
        bio: own ? bio : null,
        role: own?.role ?? 'USER',
        level: 2,
        memberSince: '2026-09-01T08:00:00Z',
        title: null,
        badge: null,
        stats: { gamesPlayed: 12, totalScore: 4321, playTimeMs: 3_725_000, activities: [], games: [] },
        achievements: [],
        achievementsTotal: 9,
        ranks,
        you: own !== null,
      }
      return json({ ...base, ...other })
    }

    // --- The signed-in player's own data ---------------------------------------------------
    if (path.startsWith('/api/users/me')) {
      if (!currentUser) return unauthorized()
      if (path === '/api/users/me' && method === 'PATCH') {
        if (profileUpdateStatus !== 200) return problem(profileUpdateStatus, 'INTERNAL_ERROR', 'Something went wrong')
        // Checked and tidied like the server does; anything but these three fields is ignored.
        const errors: { field: string; message: string }[] = []
        const displayName = typeof body.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ') : undefined
        if (displayName !== undefined && (displayName.length < 2 || displayName.length > 24)) {
          errors.push({ field: 'displayName', message: 'must be 2 to 24 characters long' })
        } else if (displayName !== undefined && !/^[\p{L}\p{M}\p{N} ._'!-]*$/u.test(displayName)) {
          errors.push({ field: 'displayName', message: "may only contain letters, digits, spaces and . _ ' ! -" })
        }
        const newBio = typeof body.bio === 'string' ? body.bio.trim() : undefined
        if (newBio !== undefined && newBio.length > 160) {
          errors.push({ field: 'bio', message: 'must be at most 160 characters long' })
        }
        if (errors.length > 0) return problem(400, 'VALIDATION_FAILED', 'Request validation failed', { errors })
        currentUser = {
          ...currentUser,
          ...(body.avatar !== undefined && { avatar: body.avatar as SessionUser['avatar'] }),
          ...(displayName !== undefined && { displayName }),
        }
        if (newBio !== undefined) bio = newBio === '' ? null : newBio
        return json(profileOf(currentUser))
      }
      if (path === '/api/users/me') return json(profileOf(currentUser))
      if (path === '/api/users/me/achievements') return json(achievements)
      if (path === '/api/users/me/coins') return json({ balance, earned: balance + 500 })
      if (path === '/api/users/me/ranks') return json(ranks)
      if (path === '/api/users/me/transactions') {
        const page = Number(url.searchParams.get('page') ?? 0)
        const size = Number(url.searchParams.get('size') ?? 10)
        const entries = transactions.slice(page * size, page * size + size).map((entry, index) => ({
          id: page * size + index + 1,
          amount: 5,
          balanceAfter: balance,
          type: 'GAME_COMPLETION',
          referenceType: null,
          referenceId: null,
          description: 'Finished a game of snake',
          createdAt: '2026-09-30T10:00:00Z',
          ...entry,
        }))
        return json({ entries, page, size, totalEntries: transactions.length, totalPages: Math.ceil(transactions.length / size) })
      }
      if (path === '/api/users/me/stats') {
        return json({
          gamesPlayed: 12,
          totalScore: 4321,
          playTimeMs: 3_725_000,
          achievementsUnlocked: 1,
          achievementsTotal: 3,
          coins: balance,
          coinsEarned: balance + 500,
          activities: [
            { key: 'tcg.packsOpened', label: 'Packs opened', value: 14 },
            { key: 'tcg.cardsCollected', label: 'Cards collected', value: 341 },
            { key: 'tcg.uniqueCards', label: 'Different cards', value: 200 },
          ],
          games: [
            {
              slug: 'snake',
              name: 'Snake',
              gamesPlayed: 9,
              bestScore: 42,
              averageScore: 17,
              playTimeMs: 600_000,
              lastPlayedAt: '2026-09-30T10:00:00Z',
            },
          ],
          ...stats,
        })
      }
      const inventoryOf = () => ({
        items: shopItems
          .filter((item) => (owned.get(item.id) ?? 0) > 0)
          .map(
            (item): InventoryEntry => ({
              itemId: item.id,
              code: item.code,
              name: item.name,
              description: item.description,
              type: item.type,
              icon: item.icon,
              quantity: owned.get(item.id) ?? 0,
              equippable: item.type === 'BADGE' || item.type === 'TITLE',
              equipped: worn.has(item.id),
              acquiredAt: '2026-09-30T10:00:00Z',
            }),
          ),
        bonusPacks: shopItems
          .filter((item) => item.type === 'PACK')
          .reduce((sum, item) => sum + (owned.get(item.id) ?? 0), 0),
      })
      if (path === '/api/users/me/inventory') return json(inventoryOf())
      const wearing = /^\/api\/users\/me\/inventory\/(\d+)\/equipped$/.exec(path)?.[1]
      if (wearing) {
        if (method === 'PUT') worn.add(Number(wearing))
        else worn.delete(Number(wearing))
        return json(inventoryOf())
      }
      if (path === '/api/users/me/game-history') {
        const page = Number(url.searchParams.get('page') ?? 0)
        const size = Number(url.searchParams.get('size') ?? 10)
        const entries = history.slice(page * size, page * size + size).map((entry) => ({
          gameSlug: 'snake',
          gameName: 'Snake',
          score: 0,
          durationMs: 60_000,
          playedAt: '2026-09-30T10:00:00Z',
          xpEarned: 10,
          personalBest: false,
          ...entry,
        }))
        return json({ entries, page, size, totalEntries: history.length, totalPages: Math.ceil(history.length / size) })
      }
    }

    // --- Daily challenges ------------------------------------------------------------------
    if (path === '/api/daily-challenges' || path === '/api/daily-challenges/me') {
      const mine = path.endsWith('/me')
      if (mine && !currentUser) return unauthorized()
      if (challengesStatus !== 200) return problem(challengesStatus, 'INTERNAL_ERROR', 'Something went wrong')

      const today = challenges.map((challenge, index) => {
        const { completed = false, completedAt = null, ...shared } = {
          id: index + 1,
          title: `Challenge ${index + 1}`,
          description: 'Finish a game of Snake.',
          game: { slug: 'snake', name: 'Snake' },
          activity: null,
          target: 1,
          xpReward: 20,
          coinReward: 40,
          date: '2026-09-30',
          ...challenge,
        }
        // Only a signed-in player's own list says what is completed.
        return mine ? { ...shared, completed, completedAt } : shared
      })
      return json({
        date: '2026-09-30',
        resetsAt: challengesResetAt,
        ...(mine && { completedCount: challenges.filter((challenge) => challenge.completed).length }),
        challenges: today,
      })
    }

    // --- Game sessions ---------------------------------------------------------------------
    if (method === 'POST') {
      if (path === '/api/game-sessions') {
        return json({ id: SESSION_ID, gameSlug: body.gameSlug, startedAt: '2026-09-30T10:00:00Z' }, 201)
      }
      if (path === `/api/game-sessions/${SESSION_ID}/finish`) {
        if (finishStatus !== 200) return problem(finishStatus, 'INTERNAL_ERROR', 'Rejected')
        return json({
          sessionId: SESSION_ID,
          gameSlug: 'snake',
          score: body.score,
          durationMs: 61_000,
          recordedAt: '2026-09-30T10:01:01Z',
          rewards: currentUser ? rewards : null,
        })
      }
      return notFound(`No mock for POST ${path}`)
    }

    // --- Catalog, leaderboards, health -----------------------------------------------------
    if (path === '/actuator/health') return json({ status: 'UP' })
    if (path === '/api/games') return json(games)

    const board = /^\/api\/leaderboards\/([^/]+)$/.exec(path)?.[1]
    if (board) {
      const page = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 20)
      const period = (url.searchParams.get('period') ?? 'ALL_TIME') as LeaderboardPeriod
      if (!['DAILY', 'WEEKLY', 'ALL_TIME'].includes(period)) return problem(400, 'BAD_REQUEST', 'Unknown period')
      const key = `${board}:${period}`
      const entries = scores[key] ?? scores[board] ?? []
      return json(leaderboardPage(board, period, entries, page, size, standings[key] ?? standings[board] ?? null))
    }

    const slug = /^\/api\/games\/([^/]+)$/.exec(path)?.[1]
    if (slug) {
      const game = games.find((candidate) => candidate.slug === decodeURIComponent(slug))
      return game ? json(game) : notFound(`Game '${slug}' was not found`)
    }
    return notFound(`No mock for ${path}`)
  })
}
