import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** A labelled section of the page, once the profile has loaded. */
const section = async (name: string | RegExp) => within(await screen.findByRole('region', { name }))

/** The site header. A page's own <header> is also reported as a banner, so take the first. */
const siteHeader = () => within(screen.getAllByRole('banner')[0])

/** 11 finished games, newest first: scores 110, 100, ... 10. */
const history = Array.from({ length: 11 }, (_, index) => ({
  gameSlug: index % 2 === 0 ? 'snake' : 'tetris',
  gameName: index % 2 === 0 ? 'Snake' : 'Tetris',
  score: (11 - index) * 10,
  xpEarned: index === 0 ? 85 : 10,
  personalBest: index === 0,
}))

describe('profile page as a guest', () => {
  it('invites the visitor to sign in and shows nothing personal', async () => {
    const fetchSpy = mockApi()
    renderRoute('/profile')

    expect(await screen.findByRole('heading', { name: 'Guest player' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    // A guest has no profile to ask for, so the protected endpoints are never called.
    expect(fetchSpy.mock.calls.some(([input]) => String(input).startsWith('/api/users/me'))).toBe(false)
  })
})

describe('profile page when signed in', () => {
  it('shows who the player is and their level', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    expect(await screen.findByRole('heading', { level: 2, name: 'pixel' })).toBeInTheDocument()
    expect(screen.getByText('Level 2', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Playing since .*2026/)).toBeInTheDocument()
  })

  it('shows progress towards the next level', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const bar = await screen.findByRole('progressbar', { name: 'Progress to level 3' })
    expect(bar).toHaveAttribute('aria-valuenow', '85')
    expect(bar).toHaveAttribute('aria-valuemax', '200')
    expect(screen.getByText('85 / 200 XP')).toBeInTheDocument()
    expect(screen.getByText(/115 XP to level 3/)).toBeInTheDocument()
    expect(screen.getByText('185 XP in total')).toBeInTheDocument()
  })

  it('shows games played, total score and achievements', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const value = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div')!.querySelector('dd')
    await screen.findByText('Games played')
    expect(value('Games played')).toHaveTextContent('12')
    expect(value('Total score')).toHaveTextContent('4,321')
    expect(value('Achievements')).toHaveTextContent('1 / 3')
  })

  it('lists recent games with their result', async () => {
    mockApi({ user: pixel, history })
    renderRoute('/profile')

    const games = await section('Recent games')
    const rows = (await games.findAllByRole('row')).slice(1)
    expect(rows).toHaveLength(8)
    const newest = within(rows[0])
    expect(newest.getByRole('link', { name: 'Snake' })).toHaveAttribute('href', '/games/snake')
    expect(newest.getByText('110')).toBeInTheDocument()
    expect(newest.getByText('New best')).toBeInTheDocument()
    expect(newest.getByText('+85 XP')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('New best')).not.toBeInTheDocument()
    expect(within(rows[1]).getByText('+10 XP')).toBeInTheDocument()
  })

  it('pages through older games', async () => {
    mockApi({ user: pixel, history })
    renderRoute('/profile')
    const games = await section('Recent games')
    await games.findByText('Page 1 of 2')
    expect(games.getByRole('button', { name: 'Newer' })).toBeDisabled()

    await userEvent.click(games.getByRole('button', { name: 'Older' }))

    expect(await games.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(await games.findByText('30')).toBeInTheDocument()
    expect(games.getAllByRole('row').slice(1)).toHaveLength(3)
    expect(games.getByRole('button', { name: 'Older' })).toBeDisabled()
  })

  it('invites a player with no games yet to play', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const games = await section('Recent games')

    expect(await games.findByRole('heading', { name: 'No games yet' })).toBeInTheDocument()
  })

  it('shows every achievement, unlocked or not', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const achievements = await section(/^Achievements/)
    const cards = await achievements.findAllByRole('listitem')
    expect(cards).toHaveLength(3)
    expect(achievements.getByRole('heading', { name: /Achievements/ })).toHaveTextContent('1 of 3')
    expect(within(cards[0]).getByRole('heading', { name: 'First Coin' })).toBeInTheDocument()
    expect(cards[0]).toHaveTextContent(/Unlocked .*2026 · \+50 XP/)
    expect(within(cards[1]).getByRole('heading', { name: 'Regular' })).toBeInTheDocument()
    expect(cards[1]).toHaveTextContent('Locked · worth 100 XP')
  })

  it('lets the player pick a new avatar', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: 'Change avatar' }))
    const dialog = screen.getByRole('dialog', { name: 'Choose your avatar' })
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('button', { name: 'Robot' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getAllByRole('button', { pressed: false })).toHaveLength(7)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Ghost' }))

    await expect.poll(() => dialog.hasAttribute('open')).toBe(false)
    const patch = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect([String(patch[0]), JSON.parse(String(patch[1]?.body))]).toEqual(['/api/users/me', { avatar: 'GHOST' }])
    // Reopening shows the new choice.
    await userEvent.click(screen.getByRole('button', { name: 'Change avatar' }))
    expect(within(dialog).getByRole('button', { name: 'Ghost' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('logs out and returns to the guest view', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Guest player' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'pixel' })).not.toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([input, init]) => String(input) === '/api/auth/logout' && init?.method === 'POST')).toBe(
      true,
    )
    expect(siteHeader().getByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })
})
