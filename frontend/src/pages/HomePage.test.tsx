import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { catalogFixture, challengesFixture, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** A titled section of the home page. */
const section = (name: string) => within(screen.getByRole('region', { name }))

/** The paths the page has asked the API for. */
const requested = (fetchSpy: ReturnType<typeof mockApi>) => fetchSpy.mock.calls.map(([input]) => String(input))

describe('daily challenges on the home page', () => {
  it('shows a guest what there is to win and how to start earning it', async () => {
    const fetchSpy = mockApi({ challenges: challengesFixture })
    renderRoute('/')

    const challenges = section('Daily challenges')
    const snake = await challenges.findByRole('link', { name: /snack time/i })
    expect(snake).toHaveAttribute('href', '/games/snake')
    expect(snake).toHaveTextContent('Eat 10 apples in one game of Snake.')
    expect(snake).toHaveTextContent('+35 XP')
    expect(challenges.getByRole('link', { name: /five twelve/i })).toHaveAttribute('href', '/games/2048')
    expect(challenges.getByRole('link', { name: /tidy up/i })).toHaveTextContent('+30 XP')

    // Nobody's progress is shown to a guest, only the way to get some.
    expect(challenges.queryByText('Completed')).not.toBeInTheDocument()
    expect(challenges.queryByText(/ done$/)).not.toBeInTheDocument()
    expect(challenges.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?redirect=%2F')
    expect(challenges.getByRole('link', { name: 'create an account' })).toHaveAttribute('href', '/register?redirect=%2F')
    expect(requested(fetchSpy)).toContain('/api/daily-challenges')
    expect(requested(fetchSpy)).not.toContain('/api/daily-challenges/me')
  })

  it("shows a signed-in player what they have completed", async () => {
    const fetchSpy = mockApi({ user: pixel, challenges: challengesFixture })
    renderRoute('/')

    const challenges = section('Daily challenges')
    expect(await challenges.findByText('1 of 3 done')).toBeInTheDocument()
    expect(within(challenges.getByRole('link', { name: /snack time/i })).getByText('Completed')).toBeInTheDocument()
    const open = challenges.getByRole('link', { name: /tidy up/i })
    expect(within(open).queryByText('Completed')).not.toBeInTheDocument()
    expect(within(open).getByText('Play Tetris')).toBeInTheDocument()

    expect(challenges.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
    expect(requested(fetchSpy)).toContain('/api/daily-challenges/me')
    expect(requested(fetchSpy)).not.toContain('/api/daily-challenges')
  })

  it('says when the next set arrives', async () => {
    const inFiveHours = new Date(Date.now() + (5 * 60 + 12) * 60_000 + 30_000).toISOString()
    mockApi({ challenges: challengesFixture, challengesResetAt: inFiveHours })
    renderRoute('/')

    expect(await section('Daily challenges').findByText('New challenges in 5h 12m')).toBeInTheDocument()
  })

  it('says so when there are no challenges today', async () => {
    mockApi()
    renderRoute('/')

    expect(await section('Daily challenges').findByText('No challenges today.')).toBeInTheDocument()
  })

  it('offers to reload when the challenges cannot be loaded, and leaves the rest of the page working', async () => {
    const failing = mockApi({ challengesStatus: 500 })
    renderRoute('/')

    const challenges = section('Daily challenges')
    const reload = await challenges.findByRole('button', { name: 'Reload challenges' })
    expect(await section('Featured games').findByRole('link', { name: /snake/i })).toBeInTheDocument()

    failing.mockRestore()
    mockApi({ challenges: challengesFixture })
    await userEvent.click(reload)

    expect(await challenges.findByRole('link', { name: /snack time/i })).toBeInTheDocument()
    expect(challenges.queryByRole('button', { name: 'Reload challenges' })).not.toBeInTheDocument()
  })
})

describe('the rest of the hub', () => {
  it('greets a signed-in player by name', async () => {
    mockApi({ user: pixel })
    renderRoute('/')

    expect(await screen.findByText('Welcome back, pixel!')).toBeInTheDocument()
  })

  it('puts only the featured games in the spotlight', async () => {
    mockApi({ games: [catalogFixture[0], { ...catalogFixture[1], featured: false }, catalogFixture[2]] })
    renderRoute('/')

    const featured = section('Featured games')
    await featured.findByRole('link', { name: /snake/i })
    expect(featured.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Snake',
      'Tetris',
    ])
    expect(featured.getByRole('link', { name: 'All games' })).toHaveAttribute('href', '/games')
  })

  it('still has a front row when the catalog features nothing', async () => {
    mockApi({ games: catalogFixture.map((game) => ({ ...game, featured: false })) })
    renderRoute('/')

    const featured = section('Featured games')
    await featured.findByRole('link', { name: /snake/i })
    expect(featured.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })

  it('offers the games played most recently on this device, newest first', async () => {
    // "pong" was played once but has since left the catalog.
    window.localStorage.setItem('cyan-arcade:recent-games', JSON.stringify(['tetris', 'pong', 'snake']))
    mockApi()
    renderRoute('/')

    const recent = within(await screen.findByRole('region', { name: 'Jump back in' }))
    const links = recent.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/games/tetris', '/games/snake'])
    expect(links[0]).toHaveTextContent('Tetris')
    expect(links[0]).toHaveTextContent('Puzzle')
  })

  it('has no "jump back in" row for someone who has not played here yet', async () => {
    mockApi()
    renderRoute('/')

    await section('Featured games').findByRole('link', { name: /snake/i })
    expect(screen.queryByRole('region', { name: 'Jump back in' })).not.toBeInTheDocument()
  })

  it('previews the top three scores of each game', async () => {
    mockApi({
      scores: {
        snake: [
          { score: 40, player: { username: 'pixel', avatar: 'CAT' }, you: true },
          { score: 30, player: { username: 'zelda_fan', avatar: 'ROBOT' } },
          { score: 20 },
          { score: 10 },
        ],
      },
    })
    renderRoute('/')

    const boards = within(await screen.findByRole('region', { name: 'Top scores' }))
    const snake = within(await boards.findByRole('list', { name: 'Top Snake scores' }))
    expect(snake.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['1pixelYou40', '2zelda_fan30', '3Guest20'])
    expect(boards.getByRole('link', { name: 'Full Snake leaderboard' })).toHaveAttribute('href', '/leaderboard?game=snake')
    expect(boards.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', '/leaderboard')

    // A game nobody has finished yet invites the first score instead.
    const tetris = boards.getByRole('heading', { name: 'Tetris' }).closest('li')!
    expect(await within(tetris).findByText(/no scores yet/i)).toBeInTheDocument()
    expect(within(tetris).getByRole('link', { name: 'Be the first' })).toHaveAttribute('href', '/games/tetris')
  })

  it('links to the catalog by category, with how many games each has', async () => {
    mockApi()
    renderRoute('/')

    const categories = within(await screen.findByRole('region', { name: 'Browse by category' }))
    expect(categories.getByRole('link', { name: /arcade/i })).toHaveAttribute('href', '/games?category=arcade')
    expect(categories.getByRole('link', { name: /arcade/i })).toHaveTextContent('1 game')
    expect(categories.getByRole('link', { name: /puzzle/i })).toHaveTextContent('2 games')
    // Categories without games are not offered.
    expect(categories.getAllByRole('link')).toHaveLength(2)
  })
})
