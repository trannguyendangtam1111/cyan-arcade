import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLASSIC, type GameMode } from '@/api/games'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import type { Cell, TetrisState } from '@/games/tetris/types/tetrisTypes'

/**
 * Tetris Sprint on the platform: offered on the game page only when the server declares it, its runs
 * opened as Sprint sessions and saved as times, and its board a tab of its own, fastest first.
 */

// Forty lines take a hundred pieces: a Sprint game here starts one line short, finished by a hard drop.
vi.mock('@/games/tetris/engine/tetrisEngine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/games/tetris/engine/tetrisEngine')>()
  const oneLineShort = (state: TetrisState): TetrisState => ({
    ...state,
    board: state.board.map((_, index): Cell => {
      const x = index % engine.WIDTH
      const y = Math.floor(index / engine.WIDTH)
      return y === engine.HEIGHT - 1 && (x < 3 || x > 6) ? 'O' : null
    }),
    lines: 39,
    level: 4,
    pieces: 100,
    piece: { type: 'I', rotation: 0, x: 3, y: -1 },
  })
  return {
    ...engine,
    createTetrisGame: (seed: number, timed?: Parameters<typeof engine.createTetrisGame>[1]) => {
      const state = engine.createTetrisGame(seed, timed)
      return timed?.lineGoal !== undefined ? oneLineShort(state) : state
    },
  }
})

const ULTRA: GameMode = { id: 'ultra', name: 'Ultra', ranked: true, order: 'DESC', unit: 'POINTS' }
const SPRINT: GameMode = { id: 'sprint', name: 'Sprint', ranked: true, order: 'ASC', unit: 'MILLISECONDS' }

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: (url: string) => boolean) =>
  fetchSpy.mock.calls
    .filter(([input, init]) => path(String(input)) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)))

describe('Tetris Sprint on the game page', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('opens a Sprint run as a Sprint session and saves its game time, shown as a time', async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ULTRA, SPRINT] } })
    renderRoute('/games/tetris')

    const modes = await screen.findByRole('group', { name: 'Game mode' })
    fireEvent.click(within(modes).getByRole('button', { name: 'Sprint' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() =>
      expect(requests(fetchSpy, (url) => url === '/api/game-sessions')).toEqual([{ gameSlug: 'tetris', mode: 'sprint' }]),
    )
    // Let the clock run a little once the session is open, then clear the 40th line.
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    fireEvent.keyDown(window, { key: ' ' })

    await waitFor(() => expect(requests(fetchSpy, (url) => url.endsWith('/finish'))).toHaveLength(1))
    const [finish] = requests(fetchSpy, (url) => url.endsWith('/finish'))
    expect(finish.details).toEqual({ lines: 40, level: 5, pieces: 101, gameMs: finish.score })
    expect(finish.score % 40).toBe(0)
    const seconds = (finish.score / 1000).toFixed(2).padStart(5, '0')
    // The status line, not the game's own help (which also says what is not saved).
    expect(await screen.findByText(/^Time\s+saved\.$/)).toHaveTextContent(`Time 0:${seconds} saved.`)
  })

  it('offers no Sprint while the server does not declare it', async () => {
    mockApi({ modes: { tetris: [CLASSIC, ULTRA] } })
    renderRoute('/games/tetris')

    const modes = await screen.findByRole('group', { name: 'Game mode' })
    expect(within(modes).queryByRole('button', { name: 'Sprint' })).not.toBeInTheDocument()
  })
})

describe('the Tetris Sprint leaderboard', () => {
  it('is a tab of its own, shown as times to the hundredth, apart from Classic and Ultra', async () => {
    const fetchSpy = mockApi({
      modes: { tetris: [CLASSIC, ULTRA, SPRINT] },
      scores: {
        tetris: [{ score: 90_000 }],
        'tetris@ultra': [{ score: 6_000 }],
        'tetris@sprint': [{ score: 48_120 }, { score: 65_040 }],
      },
    })
    renderRoute('/leaderboard?game=tetris')
    expect(await screen.findByText('90,000')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Sprint' }))

    // In the server's order (fastest first: `TetrisSprintApiTests`), written as times.
    const fastest = await screen.findByText('0:48.12')
    const slower = screen.getByText('1:05.04')
    expect(fastest.compareDocumentPosition(slower) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const boards = fetchSpy.mock.calls.map(([input]) => String(input)).filter((path) => path.startsWith('/api/leaderboards/tetris'))
    expect(boards.at(-1)).toBe('/api/leaderboards/tetris?mode=sprint&period=ALL_TIME&page=0&size=20')
    expect(screen.queryByText('90,000')).not.toBeInTheDocument()
    expect(screen.queryByText('6,000')).not.toBeInTheDocument()
  })
})
