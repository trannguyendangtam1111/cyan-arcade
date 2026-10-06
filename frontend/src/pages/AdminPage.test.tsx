import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** The paths the app asked the API for. */
const requested = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname)

describe('the admin page', () => {
  it('tells an admin who they are and what they may do', async () => {
    mockApi({ user: admin })
    renderRoute('/admin')

    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument()
    const account = within(await screen.findByRole('region', { name: 'Your account' }))
    expect(account.getByText('admin')).toBeInTheDocument()
    expect(account.getByText('ADMIN')).toBeInTheDocument()

    // AI mode: every game that has an AI, a click away.
    const ai = within(screen.getByRole('region', { name: 'AI mode' }))
    expect(await ai.findByRole('link', { name: /snake/i })).toHaveAttribute('href', '/games/snake')
    expect(ai.getByRole('link', { name: /2048/i })).toHaveAttribute('href', '/games/2048')
    expect(ai.getByRole('link', { name: /tetris/i })).toHaveAttribute('href', '/games/tetris')

    const packs = within(screen.getByRole('region', { name: 'Unlimited card packs' }))
    expect(packs.getByText(/as many packs a day as you like/)).toHaveTextContent('Players have 10 a day.')
    expect(packs.getByRole('link', { name: 'Open packs' })).toHaveAttribute('href', '/tcg')
  })

  it.each([
    ['a player', pixel],
    ['a guest', null],
  ])('shows %s nothing but that it is for admins, and asks the server nothing', async (_, user) => {
    const fetchSpy = mockApi({ user })
    renderRoute('/admin')

    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'AI mode' })).not.toBeInTheDocument()
    expect(requested(fetchSpy)).not.toContain('/api/admin/overview')
  })
})

describe('the header', () => {
  it('has a way to the admin page for an admin', async () => {
    mockApi({ user: admin })
    renderRoute('/')

    expect(await screen.findByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })

  it('has none for a player', async () => {
    mockApi({ user: pixel })
    renderRoute('/')

    expect(await screen.findByRole('link', { name: 'Your profile, pixel' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})
