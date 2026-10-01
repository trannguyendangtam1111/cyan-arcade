import { vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import type { DailyChallenge } from '@/api/dailyChallenges'
import type { GameResponse } from '@/api/games'
import type { Rewards } from '@/api/gameSessions'
import type { LeaderboardEntry, LeaderboardResponse } from '@/api/leaderboards'
import type { AchievementStatus, GameHistoryEntry, ProfileResponse } from '@/api/profile'

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
export const pixel: SessionUser = { id: 7, username: 'pixel', avatar: 'ROBOT' }

export const achievementsFixture: AchievementStatus[] = [
  {
    code: 'FIRST_GAME',
    name: 'First Coin',
    description: 'Finish your first game.',
    xp: 50,
    unlocked: true,
    unlockedAt: '2026-09-29T09:00:00Z',
  },
  { code: 'PLAY_10_GAMES', name: 'Regular', description: 'Finish 10 games.', xp: 100, unlocked: false, unlockedAt: null },
  {
    code: 'SNAKE_25',
    name: 'Growing Up',
    description: 'Eat 25 apples in one game of Snake.',
    xp: 100,
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
  },
  {
    id: 3,
    title: 'Tidy Up',
    description: 'Clear 5 lines in one game of Tetris.',
    game: { slug: 'tetris', name: 'Tetris' },
    target: 5,
    xpReward: 30,
  },
]

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
  /** Scores per game slug, best first. Games not listed have an empty leaderboard. */
  scores?: Record<string, Partial<LeaderboardEntry>[]>
  /** The caller's standing per game slug. */
  standings?: Record<string, LeaderboardResponse['player']>
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
  /** Asked first, in order. The first one that returns a response answers the request. */
  handlers?: MockHandler[]
}

const defaultRewards: Rewards = {
  xpEarned: 10,
  personalBest: false,
  achievements: [],
  bonuses: [],
  totalXp: 10,
  level: 1,
  leveledUp: false,
}

/** Builds the page of a leaderboard the way the backend would. */
function leaderboardPage(
  gameSlug: string,
  scores: Partial<LeaderboardEntry>[],
  page: number,
  size: number,
  player: LeaderboardResponse['player'],
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
  return { gameSlug, entries, page, size, totalEntries: scores.length, totalPages: Math.ceil(scores.length / size), player }
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
  user = null,
  accounts = {},
  profile = {},
  achievements = achievementsFixture,
  history = [],
  rewards = defaultRewards,
  challenges = [],
  challengesStatus = 200,
  challengesResetAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
  handlers = [],
}: MockApiOptions = {}) {
  document.cookie = `XSRF-TOKEN=${CSRF_TOKEN}; path=/`

  let currentUser = user
  const passwords = new Map(Object.entries(accounts).map(([name, password]) => [name.toLowerCase(), password]))

  const profileOf = (player: SessionUser): ProfileResponse => ({
    id: player.id,
    username: player.username,
    xp: 185,
    level: 2,
    xpIntoLevel: 85,
    xpForNextLevel: 200,
    gamesPlayed: 12,
    totalScore: 4321,
    achievementsUnlocked: achievements.filter((achievement) => achievement.unlocked).length,
    achievementsTotal: achievements.length,
    memberSince: '2026-09-01T08:00:00Z',
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
      currentUser = { id: 7, username, avatar: 'ROBOT' }
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
      currentUser = { id: 8, username, avatar: 'ROBOT' }
      return session(201)
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      currentUser = null
      return new Response(null, { status: 204 })
    }

    // --- The signed-in player's own data ---------------------------------------------------
    if (path.startsWith('/api/users/me')) {
      if (!currentUser) return unauthorized()
      if (path === '/api/users/me' && method === 'PATCH') {
        currentUser = { ...currentUser, avatar: body.avatar as SessionUser['avatar'] }
        return json(profileOf(currentUser))
      }
      if (path === '/api/users/me') return json(profileOf(currentUser))
      if (path === '/api/users/me/achievements') return json(achievements)
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
          target: 1,
          xpReward: 20,
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
      const size = Number(url.searchParams.get('size') ?? 10)
      return json(leaderboardPage(board, scores[board] ?? [], page, size, standings[board] ?? null))
    }

    const slug = /^\/api\/games\/([^/]+)$/.exec(path)?.[1]
    if (slug) {
      const game = games.find((candidate) => candidate.slug === decodeURIComponent(slug))
      return game ? json(game) : notFound(`Game '${slug}' was not found`)
    }
    return notFound(`No mock for ${path}`)
  })
}
