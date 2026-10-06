import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** The bodies of the PATCH requests sent for the player's profile. */
const patches = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls
    .filter(([input, init]) => String(input) === '/api/users/me' && init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)

const openEditor = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
  return within(screen.getByRole('dialog', { name: 'Edit profile' }))
}

describe('editing your profile', () => {
  it('shows who the player is: display name, @username and bio', async () => {
    mockApi({ user: { ...pixel, displayName: 'Pixel Pal' }, profile: { bio: 'Tetris every day.' } })
    renderRoute('/profile')

    expect(await screen.findByRole('heading', { level: 2, name: 'Pixel Pal' })).toBeInTheDocument()
    expect(screen.getByText('@pixel')).toBeInTheDocument()
    expect(screen.getByText('Tetris every day.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Public profile' })).toHaveAttribute('href', '/players/pixel')
  })

  it('saves a new display name, bio and avatar, and the header follows', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/profile')

    const editor = await openEditor()
    expect(editor.getByRole('textbox', { name: /display name/i })).toHaveValue('pixel')
    await userEvent.clear(editor.getByRole('textbox', { name: /display name/i }))
    await userEvent.type(editor.getByRole('textbox', { name: /display name/i }), '  Pixel   Pal ')
    await userEvent.type(editor.getByRole('textbox', { name: /bio/i }), 'Java backend developer.')
    await userEvent.click(editor.getByRole('button', { name: 'Ghost' }))
    expect(editor.getByRole('button', { name: 'Ghost' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Pixel Pal' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.getByText('Java backend developer.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Your profile, Pixel Pal' })).toHaveAttribute('href', '/profile')
    // Only the three fields, tidied, and nothing about the username.
    expect(patches(fetchSpy)).toEqual([{ displayName: 'Pixel Pal', bio: 'Java backend developer.', avatar: 'GHOST' }])
  })

  it('sends only what changed, and nothing when nothing did', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/profile')

    let editor = await openEditor()
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))
    expect(patches(fetchSpy)).toEqual([])

    editor = await openEditor()
    await userEvent.type(editor.getByRole('textbox', { name: /bio/i }), 'Hi')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))
    await screen.findByText('Hi')
    expect(patches(fetchSpy)).toEqual([{ bio: 'Hi' }])
  })

  it('points out a display name that will not do, before sending it', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/profile')

    const editor = await openEditor()
    const name = editor.getByRole('textbox', { name: /display name/i })
    await userEvent.clear(name)
    await userEvent.type(name, 'A')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))

    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(editor.getByText('Use 2 to 24 characters.')).toBeInTheDocument()

    await userEvent.clear(name)
    await userEvent.type(name, '<script>')
    expect(editor.getByText("Use letters, digits, spaces and . _ ' ! - only.")).toBeInTheDocument()
    expect(patches(fetchSpy)).toEqual([])
  })

  it("shows the server's verdict on a field", async () => {
    mockApi({
      user: pixel,
      handlers: [
        ({ path, method }) =>
          path === '/api/users/me' && method === 'PATCH'
            ? mockProblem(400, 'VALIDATION_FAILED', 'Request validation failed', {
                errors: [{ field: 'displayName', message: 'is not allowed' }],
              })
            : undefined,
      ],
    })
    renderRoute('/profile')

    const editor = await openEditor()
    await userEvent.type(editor.getByRole('textbox', { name: /display name/i }), '_two')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))

    expect(await editor.findByText('is not allowed')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeInTheDocument()
  })

  it('says so when saving fails, and keeps what was typed', async () => {
    mockApi({ user: pixel, profileUpdateStatus: 500 })
    renderRoute('/profile')

    const editor = await openEditor()
    await userEvent.type(editor.getByRole('textbox', { name: /bio/i }), 'Still here')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))

    expect(await editor.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(editor.getByRole('textbox', { name: /bio/i })).toHaveValue('Still here')
  })

  it('cancels without saving', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/profile')

    const editor = await openEditor()
    await userEvent.type(editor.getByRole('textbox', { name: /bio/i }), 'Never mind')
    await userEvent.click(editor.getByRole('button', { name: 'Cancel' }))

    expect(patches(fetchSpy)).toEqual([])
    expect(screen.queryByText('Never mind')).not.toBeInTheDocument()
  })
})

describe('public profiles', () => {
  const zelda = {
    displayName: 'Zelda Fan',
    avatar: 'CAT' as const,
    bio: 'Loves 2048.',
    level: 7,
    title: { code: 'TITLE_CARD_SHARK', name: 'Card Shark', icon: 'cards' },
    badge: { code: 'BADGE_STAR', name: 'Superstar', icon: 'star' },
    stats: {
      gamesPlayed: 40,
      totalScore: 99000,
      playTimeMs: 7_200_000,
      activities: [{ key: 'tcg.packsOpened', label: 'Packs opened', value: 12 }],
      games: [
        { slug: '2048', name: '2048', gamesPlayed: 40, bestScore: 20480, averageScore: 9000, playTimeMs: 7_200_000, lastPlayedAt: '2026-10-01T10:00:00Z' },
      ],
    },
    achievements: [{ code: 'FIRST_GAME', name: 'First Coin', description: 'Finish your first game.', unlockedAt: '2026-09-02T10:00:00Z' }],
    ranks: {
      bestRank: 2,
      bestRankGame: { slug: '2048', name: '2048' },
      games: [{ game: { slug: '2048', name: '2048' }, daily: null, weekly: { rank: 4, score: 8000 }, allTime: { rank: 2, score: 20480 } }],
    },
  }

  it("shows another player's profile, without anything to edit", async () => {
    mockApi({ user: pixel, publicProfiles: { zelda_fan: zelda } })
    renderRoute('/players/zelda_fan')

    expect(await screen.findByRole('heading', { level: 1, name: 'Zelda Fan' })).toBeInTheDocument()
    expect(screen.getByText('@zelda_fan')).toBeInTheDocument()
    expect(screen.getByText('Card Shark')).toBeInTheDocument()
    expect(screen.getByText('Badge: Superstar')).toBeInTheDocument()
    expect(screen.getByText('Loves 2048.')).toBeInTheDocument()
    expect(screen.getByText('Level 7')).toBeInTheDocument()
    expect(screen.getByText(/Playing since/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Statistics' })).getByText('Packs opened')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Rankings' })).getByText('#2', { selector: 'span' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'By game' })).getByText('20,480')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /Achievements/ })).getByText('First Coin')).toBeInTheDocument()
    // Not theirs: no editing, and nothing private to show.
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByText(/coins/i)).not.toBeInTheDocument()
  })

  it('lets the owner edit from their public profile', async () => {
    mockApi({ user: pixel })
    renderRoute('/players/pixel')

    const editor = await openEditor()
    await userEvent.clear(editor.getByRole('textbox', { name: /display name/i }))
    await userEvent.type(editor.getByRole('textbox', { name: /display name/i }), 'Pixie')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Pixie' })).toBeInTheDocument()
    expect(screen.getByText('@pixel')).toBeInTheDocument()
  })

  it('says so when there is no such player', async () => {
    mockApi()
    renderRoute('/players/nobody_here')

    expect(await screen.findByRole('heading', { name: 'Player not found' })).toBeInTheDocument()
    expect(screen.getByText('Nobody here goes by @nobody_here.')).toBeInTheDocument()
  })

  it('shows a guest the profile too', async () => {
    mockApi({ publicProfiles: { zelda_fan: zelda } })
    renderRoute('/players/zelda_fan')

    expect(await screen.findByRole('heading', { level: 1, name: 'Zelda Fan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
  })

  it('is linked from the leaderboard, which shows display names', async () => {
    mockApi({
      scores: { snake: [{ score: 40, player: { username: 'zelda_fan', displayName: 'Zelda Fan', avatar: 'CAT' } }] },
    })
    renderRoute('/leaderboard')

    const link = await screen.findByRole('link', { name: /Zelda Fan/ })
    expect(link).toHaveAttribute('href', '/players/zelda_fan')
    expect(screen.queryByText('zelda_fan')).not.toBeInTheDocument()
  })
})
