import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameModule, GameProps } from '@/games/types'
import { getRecentGameSlugs } from '@/lib/recentGames'
import { CSRF_TOKEN, SESSION_ID, challengesFixture, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

// Registers a fake implementation for "snake" only. This proves the platform can host any game
// through the GameModule contract alone, and that catalog + registry are joined by slug.
vi.mock('@/games/registry', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/games/registry')>()
  const { lazy } = await import('react')

  const FakeSnake = ({ onGameStart, onGameOver }: GameProps) => (
    <>
      <button onClick={onGameStart}>Start run</button>
      <button onClick={() => onGameOver({ score: 42, durationMs: 1000 })}>Finish run</button>
    </>
  )
  const fakeModule: GameModule = {
    slug: 'snake',
    controls: { keyboard: true, touch: false },
    Component: lazy(async () => ({ default: FakeSnake })),
  }
  const findGameModule = (slug: string) => (slug === fakeModule.slug ? fakeModule : undefined)

  return {
    ...original,
    gameModules: [fakeModule],
    findGameModule,
    toGameDefinition: (game: Parameters<typeof original.toGameDefinition>[0]) => ({
      ...original.toGameDefinition(game),
      module: findGameModule(game.slug),
    }),
  }
})

/** The POST requests the page has sent, as [path, parsed body] pairs. */
function postsTo(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input, init]) => [String(input), JSON.parse(String(init?.body))])
}

describe('hosting a registered game', () => {
  it('marks only the registered game as playable in the catalog', async () => {
    mockApi()
    renderRoute('/games')

    const snake = await screen.findByRole('link', { name: /snake/i })
    expect(within(snake).getByText('Play')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /tetris/i })).getByText('Coming soon')).toBeInTheDocument()
  })

  it('lazy-loads and renders the game on its detail page', async () => {
    mockApi()
    renderRoute('/games/snake')

    expect(await screen.findByRole('heading', { level: 1, name: 'Snake' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Finish run' })).toBeInTheDocument()
    expect(screen.getByText('Keyboard')).toBeInTheDocument()
    expect(screen.queryByText(/is being built/i)).not.toBeInTheDocument()
  })
})

describe("today's challenge on the game page", () => {
  it('tells a guest what to aim for and what it is worth', async () => {
    mockApi({ challenges: challengesFixture })
    renderRoute('/games/snake')

    const challenge = within(await screen.findByRole('complementary', { name: "Today's challenge" }))
    expect(challenge.getByText('Snack Time')).toBeInTheDocument()
    expect(challenge.getByText(/Eat 10 apples in one game of Snake\./)).toBeInTheDocument()
    expect(challenge.getByText('+35 XP')).toBeInTheDocument()
    // The other games' challenges belong on their own pages.
    expect(challenge.queryByText('Tidy Up')).not.toBeInTheDocument()
  })

  it('shows a signed-in player that they have already completed it', async () => {
    mockApi({ user: pixel, challenges: challengesFixture })
    renderRoute('/games/snake')

    const challenge = within(await screen.findByRole('complementary', { name: "Today's challenge" }))
    expect(challenge.getByText('Completed')).toBeInTheDocument()
    expect(challenge.queryByText('+35 XP')).not.toBeInTheDocument()
  })

  it('shows nothing when the game has no challenge today', async () => {
    mockApi({ challenges: challengesFixture.slice(1) })
    renderRoute('/games/snake')

    await screen.findByRole('button', { name: 'Finish run' })
    expect(screen.queryByRole('complementary', { name: "Today's challenge" })).not.toBeInTheDocument()
  })
})

describe('remembering what was played', () => {
  it('adds the game to the recent games of this device when a run starts, not before', async () => {
    mockApi()
    renderRoute('/games/snake')
    const start = await screen.findByRole('button', { name: 'Start run' })
    expect(getRecentGameSlugs()).toEqual([])

    fireEvent.click(start)

    expect(getRecentGameSlugs()).toEqual(['snake'])
  })
})

describe('score keeping on the game page', () => {
  it('opens a session when a run starts and submits the score when it ends', async () => {
    const fetchSpy = mockApi()
    renderRoute('/games/snake')

    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    await waitFor(() => expect(postsTo(fetchSpy)).toEqual([['/api/game-sessions', { gameSlug: 'snake' }]]))
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(await screen.findByText(/saved\./)).toHaveTextContent('Score 42 saved.')
    expect(screen.getByRole('link', { name: /view leaderboard/i })).toHaveAttribute('href', '/leaderboard?game=snake')
    expect(postsTo(fetchSpy)).toEqual([
      ['/api/game-sessions', { gameSlug: 'snake' }],
      [`/api/game-sessions/${SESSION_ID}/finish`, { score: 42, details: {} }],
    ])
    // Both requests carry the CSRF token the server handed out.
    for (const [, init] of fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST')) {
      expect(init?.headers).toMatchObject({ 'X-XSRF-TOKEN': CSRF_TOKEN })
    }
  })

  it('shows a signed-in player what the run earned', async () => {
    mockApi({
      user: pixel,
      rewards: {
        xpEarned: 185,
        personalBest: true,
        achievements: [{ code: 'FIRST_GAME', name: 'First Coin', description: 'Finish your first game.', xp: 50 }],
        bonuses: [{ type: 'DAILY_CHALLENGE', title: 'Snack Time', xp: 35 }],
        totalXp: 185,
        level: 2,
        leveledUp: true,
      },
    })
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(await screen.findByText('+185 XP')).toBeInTheDocument()
    expect(screen.getByText('New account best')).toBeInTheDocument()
    expect(screen.getByText('Achievement: First Coin')).toBeInTheDocument()
    expect(screen.getByText('Daily challenge: Snack Time')).toBeInTheDocument()
    expect(screen.getByText('Level 2!')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in to earn XP' })).not.toBeInTheDocument()
  })

  it('shows only what was earned: no best, achievement or level badge for an ordinary run', async () => {
    mockApi({ user: pixel })
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(await screen.findByText('+10 XP')).toBeInTheDocument()
    expect(screen.queryByText('New account best')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Achievement:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Daily challenge:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Level \d+!$/)).not.toBeInTheDocument()
  })

  it('tells a guest that signing in earns XP, and brings them back to the game afterwards', async () => {
    mockApi()
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(await screen.findByRole('link', { name: 'Log in to earn XP' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fgames%2Fsnake',
    )
    expect(screen.queryByText(/^\+\d+ XP$/)).not.toBeInTheDocument()
  })

  it('submits a run only once, however often the game reports it', async () => {
    const fetchSpy = mockApi()
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))

    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    await screen.findByText(/saved\./)
    expect(postsTo(fetchSpy)).toHaveLength(2)
  })

  it('tells the player when the score could not be saved and lets them retry', async () => {
    const failing = mockApi({ finishStatus: 500 })
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(await screen.findByText(/couldn't be saved/)).toBeInTheDocument()

    failing.mockRestore()
    mockApi()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/saved\./)).toHaveTextContent('Score 42 saved.')
  })

  it('does not offer a retry when the server rejects the score', async () => {
    mockApi({ finishStatus: 400 })
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(await screen.findByText(/couldn't be saved/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('sends nothing for a result that has no started run', async () => {
    const fetchSpy = mockApi()
    renderRoute('/games/snake')

    fireEvent.click(await screen.findByRole('button', { name: 'Finish run' }))

    expect(postsTo(fetchSpy)).toEqual([])
    expect(screen.queryByText(/saved|saving/i)).not.toBeInTheDocument()
  })

  it('clears the previous result when a new run starts', async () => {
    mockApi()
    renderRoute('/games/snake')
    fireEvent.click(await screen.findByRole('button', { name: 'Start run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish run' }))
    await screen.findByText(/saved\./)

    fireEvent.click(screen.getByRole('button', { name: 'Start run' }))

    expect(screen.queryByText(/saved\./)).not.toBeInTheDocument()
  })
})
