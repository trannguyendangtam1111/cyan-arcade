import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLASSIC, type GameMode } from '@/api/games'
import type { Rewards } from '@/api/gameSessions'
import { PROGRESS_KEY } from '@/games/snake/adventureProgress'
import { mockApi, mockProblem, pixel, type MockHandler } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Snake Adventure on the platform: offered on the game page only when the server declares its stages,
 * each clear opened and finished as a session of its stage's mode and saved as a game time, with no
 * leaderboard to link and no rewards to show. The next stage opens only once the server has saved it.
 */

// A stage takes hundreds of moves: here each starts one apple short, the last one just ahead of the snake.
vi.mock('@/games/snake/engine/snakeAdventure', async (importOriginal) => {
  const adventure = await importOriginal<typeof import('@/games/snake/engine/snakeAdventure')>()
  const AHEAD = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] } as const
  return {
    ...adventure,
    createAdventureGame: (...args: Parameters<typeof adventure.createAdventureGame>) => {
      const state = adventure.createAdventureGame(...args)
      const [dx, dy] = AHEAD[state.direction]
      const head = state.snake[0]
      return { ...state, score: state.objective!.apples - 1, food: { x: head.x + dx, y: head.y + dy } }
    },
  }
})

const MAPS: GameMode[] = ['Pillars', 'Tunnels', 'Rooms'].map((name) => ({
  id: `map-${name.toLowerCase()}`,
  name,
  ranked: true,
  order: 'DESC',
  unit: 'POINTS',
}))
const STAGES: GameMode[] = ['Open', 'Pillars', 'Tunnels', 'Tunnels', 'Rooms', 'Rooms'].map((board, index) => ({
  id: `adventure-${index + 1}`,
  name: `Adventure ${index + 1}: ${board}`,
  ranked: false,
  order: 'ASC',
  unit: 'MILLISECONDS',
}))
const SNAKE_MODES = [CLASSIC, ...MAPS, ...STAGES]
// What the server answers a signed-in player's stage clear with: nothing earned (`SnakeAdventureApiTests`).
const NOTHING_EARNED: Rewards = {
  xpEarned: 0,
  coinsEarned: 0,
  personalBest: true,
  achievements: [],
  bonuses: [],
  totalXp: 120,
  level: 2,
  leveledUp: false,
  coinBalance: 300,
}

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: (url: string) => boolean) =>
  fetchSpy.mock.calls
    .filter(([input, init]) => path(String(input)) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)))
const sessionStarts = (fetchSpy: ReturnType<typeof mockApi>) => requests(fetchSpy, (url) => url === '/api/game-sessions')
const finishes = (fetchSpy: ReturnType<typeof mockApi>) => requests(fetchSpy, (url) => url.endsWith('/finish'))
const stageButton = (id: number) =>
  within(screen.getByRole('group', { name: 'Adventure stage' })).getByRole('button', { name: new RegExp(`^Stage ${id}:`) })

/** Chooses a stage and clears it with one move: the apple ahead of the snake. */
async function clearStage(fetchSpy: ReturnType<typeof mockApi>, id: number) {
  await screen.findByRole('group', { name: 'Adventure stage' })
  fireEvent.click(stageButton(id))
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'snake', mode: `adventure-${id}` }]))
  expect(await screen.findByRole('heading', { name: 'Stage cleared!' })).toBeInTheDocument()
  await waitFor(() => expect(finishes(fetchSpy)).toHaveLength(1))
  return finishes(fetchSpy)[0]
}

describe('Snake Adventure on the game page', () => {
  beforeEach(() => window.localStorage.clear())

  it('opens a clear as its stage session and saves its game time, with no leaderboard or rewards', async () => {
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES }, user: pixel, rewards: NOTHING_EARNED })
    renderRoute('/games/snake')

    const finish = await clearStage(fetchSpy, 1)
    // One move at level 2's tick (the score before it was 9): 140 ms of game time.
    expect(finish.score).toBe(140)
    expect(finish.details).toEqual({ apples: 10, length: 4, level: 3, steps: 1, gameMs: 140 })

    expect(await screen.findByText('Unranked: no leaderboard, XP or coins.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View leaderboard →' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\+0 XP/)).not.toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1'))
    expect(screen.getByText(/ Stage 2 is open\.$/)).toBeInTheDocument()
    expect(stageButton(2)).toBeEnabled()
    expect(stageButton(3)).toBeDisabled()
  })

  it('saves a guest clear and opens the next stage, with nothing to log in for', async () => {
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES } })
    renderRoute('/games/snake')

    await clearStage(fetchSpy, 1)
    expect(await screen.findByText('Unranked: no leaderboard, XP or coins.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in to earn XP' })).not.toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1'))
  })

  it('plays a later stage open on this device under its own mode', async () => {
    window.localStorage.setItem(PROGRESS_KEY, '3')
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES }, user: pixel, rewards: NOTHING_EARNED })
    renderRoute('/games/snake')

    const finish = await clearStage(fetchSpy, 4)
    expect(finish.details).toMatchObject({ apples: 15, steps: 1 })
    await waitFor(() => expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('4'))
    expect(stageButton(5)).toBeEnabled()
  })

  it('keeps the next stage locked when the server refuses the clear', async () => {
    const refuse: MockHandler = ({ path }) =>
      path.endsWith('/finish') ? mockProblem(400, 'SCORE_REJECTED', 'Score submission rejected.') : undefined
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES }, user: pixel, handlers: [refuse] })
    renderRoute('/games/snake')

    await clearStage(fetchSpy, 1)
    expect(await screen.findByText(/couldn't be accepted/)).toBeInTheDocument()
    expect(screen.getByText(/ Stage 2 opens once this clear is saved\.$/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(stageButton(2)).toBeDisabled()
  })

  it('keeps the next stage locked when the clear cannot be saved', async () => {
    // The server stays unreachable through the automatic new attempts (about four seconds).
    const unreachable: MockHandler = ({ path }) =>
      path.endsWith('/finish') ? mockProblem(503, 'HTTP_503', 'unavailable') : undefined
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES }, user: pixel, handlers: [unreachable] })
    renderRoute('/games/snake')

    await clearStage(fetchSpy, 1)
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 8_000 })).toBeInTheDocument()
    expect(screen.getByText(/couldn't be saved/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(stageButton(2)).toBeDisabled()
  }, 15_000)

  it('offers no Adventure while the server does not declare its stages', async () => {
    const fetchSpy = mockApi({ modes: { snake: [CLASSIC, ...MAPS] } })
    renderRoute('/games/snake')

    await screen.findByRole('group', { name: 'Map' })
    expect(screen.queryByRole('group', { name: 'Adventure stage' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'snake', mode: 'classic' }]))
  })

  it('opens Classic and map runs as before beside it', async () => {
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES } })
    renderRoute('/games/snake')

    const maps = await screen.findByRole('group', { name: 'Map' })
    fireEvent.click(within(maps).getByRole('button', { name: 'Rooms' }))
    fireEvent.keyDown(window, { key: 'ArrowUp' })

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'snake', mode: 'map-rooms' }]))
    expect(await screen.findByRole('link', { name: 'View leaderboard →' }, { timeout: 4000 })).toHaveAttribute(
      'href',
      '/leaderboard?game=snake&mode=map-rooms',
    )
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })
})
