import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLASSIC, type GameMode } from '@/api/games'
import type { Rewards } from '@/api/gameSessions'
import { mockApi, mockProblem, pixel, type MockHandler } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import { PROGRESS_KEY } from '@/games/tetris/challengeProgress'
import type { Cell, TetrisState } from '@/games/tetris/types/tetrisTypes'

/**
 * Tetris Challenge on the platform: offered on the game page only when the server declares its
 * stages, each run opened under its stage's mode and saved as a time, with no leaderboard to link
 * and no rewards to show; Sprint beside it keeps its leaderboard.
 */

// A stage takes dozens of pieces, and a sprint a hundred: here each starts one clear short, finished
// by a hard drop of a flat I over the gap in the bottom row.
vi.mock('@/games/tetris/engine/tetrisEngine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/games/tetris/engine/tetrisEngine')>()
  const oneClearShort = (state: TetrisState): TetrisState => {
    const challenge = state.challenge
    return {
      ...state,
      board: state.board.map((_, index): Cell => {
        const x = index % engine.WIDTH
        const y = Math.floor(index / engine.WIDTH)
        return y === engine.HEIGHT - 1 && (x < 3 || x > 6) ? (challenge ? 'G' : 'O') : null
      }),
      lines: challenge?.dig ? 0 : state.clock!.lineGoal! - 1,
      ...(challenge ? { challenge: { ...challenge, garbageCleared: challenge.garbageAdded - 1 } } : { pieces: 100, level: 4 }),
      piece: { type: 'I', rotation: 0, x: 3, y: -1 },
    }
  }
  return {
    ...engine,
    createTetrisGame: (...args: Parameters<typeof engine.createTetrisGame>) => {
      const state = engine.createTetrisGame(...args)
      return state.clock?.lineGoal != null || state.challenge ? oneClearShort(state) : state
    },
  }
})

const ULTRA: GameMode = { id: 'ultra', name: 'Ultra', ranked: true, order: 'DESC', unit: 'POINTS' }
const SPRINT: GameMode = { id: 'sprint', name: 'Sprint', ranked: true, order: 'ASC', unit: 'MILLISECONDS' }
const STAGES: GameMode[] = ['Clean-up', 'Ten on top', 'Deep dig', 'Rising tide', 'Pressure', 'Last stand'].map(
  (name, index) => ({ id: `challenge-${index + 1}`, name: `Challenge ${index + 1}: ${name}`, ranked: false, order: 'ASC', unit: 'MILLISECONDS' }),
)
// What the server answers a signed-in player's stage clear with: nothing earned (`TetrisChallengeApiTests`).
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

/** Chooses Challenge, starts the stage chosen, and clears it once the run is open. */
async function clearStage(fetchSpy: ReturnType<typeof mockApi>, mode: string) {
  fireEvent.click(within(await screen.findByRole('group', { name: 'Game mode' })).getByRole('button', { name: 'Challenge' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  await waitFor(() =>
    expect(requests(fetchSpy, (url) => url === '/api/game-sessions')).toEqual([{ gameSlug: 'tetris', mode }]),
  )
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
  fireEvent.keyDown(window, { key: ' ' })
  await waitFor(() => expect(requests(fetchSpy, (url) => url.endsWith('/finish'))).toHaveLength(1))
  return requests(fetchSpy, (url) => url.endsWith('/finish'))[0]
}

describe('Tetris Challenge on the game page', () => {
  beforeEach(() => window.localStorage.clear())

  it('opens a stage clear as its stage session and saves its time, with no leaderboard or rewards', async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ULTRA, SPRINT, ...STAGES] }, user: pixel, rewards: NOTHING_EARNED })
    renderRoute('/games/tetris')

    const finish = await clearStage(fetchSpy, 'challenge-1')
    expect(finish.details).toEqual({ lines: 1, pieces: 1, gameMs: finish.score, garbage: 4 })
    expect(finish.score % 40).toBe(0)
    const seconds = (finish.score / 1000).toFixed(2).padStart(5, '0')

    const status = await screen.findByText(/^Time\s+saved\.$/)
    expect(status).toHaveTextContent(`Time 0:${seconds} saved.`)
    expect(screen.getByText('Unranked: no leaderboard, XP or coins.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View leaderboard →' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\+0 XP/)).not.toBeInTheDocument()
    expect(screen.queryByText('New account best')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
  })

  it("asks a guest to log in for nothing: a stage earns no XP", async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ...STAGES] } })
    renderRoute('/games/tetris')

    await clearStage(fetchSpy, 'challenge-1')
    expect(await screen.findByText('Unranked: no leaderboard, XP or coins.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in to earn XP' })).not.toBeInTheDocument()
  })

  it('plays the furthest stage open on this device under its own mode', async () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ...STAGES] }, user: pixel, rewards: NOTHING_EARNED })
    renderRoute('/games/tetris')

    const finish = await clearStage(fetchSpy, 'challenge-3')
    expect(finish.details).toMatchObject({ garbage: 10 })
    await waitFor(() => expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('3'))
  })

  it('opens the next stage only once the server has recorded the clear', async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ...STAGES] }, user: pixel, rewards: NOTHING_EARNED })
    renderRoute('/games/tetris')

    await clearStage(fetchSpy, 'challenge-1')
    expect(await screen.findByText(/ Stage 2 is open.$/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
  })

  it('keeps the next stage locked when the server refuses the clear', async () => {
    const refuse: MockHandler = ({ path }) =>
      path.endsWith('/finish') ? mockProblem(400, 'SCORE_REJECTED', 'Score submission rejected.') : undefined
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ...STAGES] }, user: pixel, handlers: [refuse] })
    renderRoute('/games/tetris')

    await clearStage(fetchSpy, 'challenge-1')
    expect(await screen.findByText(/couldn't be accepted/)).toBeInTheDocument()
    expect(screen.getByText(/ Stage 2 opens once this clear is saved.$/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(screen.getByRole('button', { name: 'Stage 2: Ten on top, locked' })).toBeDisabled()
  })

  it('keeps the next stage locked when the clear cannot be saved', async () => {
    // The server stays unreachable through the automatic new attempts (about four seconds).
    const unreachable: MockHandler = ({ path }) =>
      path.endsWith('/finish') ? mockProblem(503, 'HTTP_503', 'unavailable') : undefined
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ...STAGES] }, user: pixel, handlers: [unreachable] })
    renderRoute('/games/tetris')

    await clearStage(fetchSpy, 'challenge-1')
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 8_000 })).toBeInTheDocument()
    expect(screen.getByText(/couldn't be saved/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  }, 15_000)

  it('offers no Challenge while the server does not declare its stages', async () => {
    mockApi({ modes: { tetris: [CLASSIC, ULTRA, SPRINT] } })
    renderRoute('/games/tetris')

    const modes = await screen.findByRole('group', { name: 'Game mode' })
    expect(within(modes).getAllByRole('button').map((choice) => choice.textContent)).toEqual(['Classic', 'Ultra', 'Sprint'])
  })

  it('keeps a Sprint result ranked beside it, with its rewards and its leaderboard', async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ULTRA, SPRINT, ...STAGES] }, user: pixel })
    renderRoute('/games/tetris')

    fireEvent.click(within(await screen.findByRole('group', { name: 'Game mode' })).getByRole('button', { name: 'Sprint' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(requests(fetchSpy, (url) => url === '/api/game-sessions')).toHaveLength(1))
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    fireEvent.keyDown(window, { key: ' ' })

    expect(await screen.findByRole('link', { name: 'View leaderboard →' })).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    expect(screen.queryByText('Unranked: no leaderboard, XP or coins.')).not.toBeInTheDocument()
    expect(requests(fetchSpy, (url) => url === '/api/game-sessions')).toEqual([{ gameSlug: 'tetris', mode: 'sprint' }])
  })
})
