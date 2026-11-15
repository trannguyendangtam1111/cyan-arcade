import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CLASSIC, type GameMode } from '@/api/games'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Tetris Ultra on the platform: offered on the game page only when the server declares it, its runs
 * opened as Ultra sessions, and its board a tab of its own on the leaderboard, never mixed with Classic.
 */

const ULTRA: GameMode = { id: 'ultra', name: 'Ultra', ranked: true, order: 'DESC', unit: 'POINTS' }

const sessionStarts = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls
    .filter(([input, init]) => String(input) === '/api/game-sessions' && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)))

const boardRequests = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => String(input)).filter((path) => path.startsWith('/api/leaderboards/tetris'))

describe('Tetris Ultra on the game page', () => {
  beforeEach(() => window.localStorage.clear())

  it('opens an Ultra run as an Ultra session', async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ULTRA] } })
    renderRoute('/games/tetris')

    const modes = await screen.findByRole('group', { name: 'Game mode' })
    fireEvent.click(within(modes).getByRole('button', { name: 'Ultra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'tetris', mode: 'ultra' }]))
  })

  it('opens a Classic run as Classic, as before', async () => {
    const fetchSpy = mockApi({ modes: { tetris: [CLASSIC, ULTRA] } })
    renderRoute('/games/tetris')

    await screen.findByRole('group', { name: 'Game mode' })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'tetris', mode: 'classic' }]))
  })

  it('offers no Ultra while the server does not declare it', async () => {
    const fetchSpy = mockApi()
    renderRoute('/games/tetris')

    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'tetris', mode: 'classic' }]))
    expect(screen.queryByRole('group', { name: 'Game mode' })).not.toBeInTheDocument()
  })
})

describe('the Tetris Ultra leaderboard', () => {
  it('is a tab of its own, ranked highest first, its scores apart from Classic', async () => {
    const fetchSpy = mockApi({
      modes: { tetris: [CLASSIC, ULTRA] },
      scores: { tetris: [{ score: 90_000 }], 'tetris@ultra': [{ score: 6_000 }, { score: 5_000 }] },
    })
    renderRoute('/leaderboard?game=tetris')
    expect(await screen.findByText('90,000')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Ultra' }))

    expect(await screen.findByText('6,000')).toBeInTheDocument()
    expect(screen.getByText('5,000')).toBeInTheDocument()
    expect(screen.queryByText('90,000')).not.toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/tetris?mode=ultra&period=ALL_TIME&page=0&size=20')
  })
})
