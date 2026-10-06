import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const [desktop, mobile] = [0, 1]
const primary = (which: number) => within(screen.getAllByRole('navigation', { name: 'Primary' })[which])
const header = () => within(screen.getByRole('banner'))

describe('the navigation', () => {
  it('leads to every part of the platform, in the same order on every screen', async () => {
    mockApi()
    renderRoute('/')

    const links = primary(desktop).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Games',
      'Cards',
      'Challenges',
      'Shop',
      'Leaderboard',
      'Profile',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/games',
      '/tcg',
      '/challenges',
      '/shop',
      '/leaderboard',
      '/profile',
    ])
    // The phone's tab bar has the same places, with labels short enough for a seventh of the screen.
    const tabs = primary(mobile).getAllByRole('link')
    expect(tabs.map((link) => link.getAttribute('href'))).toEqual(links.map((link) => link.getAttribute('href')))
    expect(tabs.map((link) => link.textContent)).toEqual(['Home', 'Games', 'Cards', 'Daily', 'Shop', 'Ranks', 'Profile'])
    expect(await header().findByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })

  it('marks where the player is', async () => {
    mockApi()
    renderRoute('/shop')

    expect(primary(desktop).getByRole('link', { name: 'Shop' })).toHaveAttribute('aria-current', 'page')
    expect(primary(desktop).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })
})

describe('the header', () => {
  it("shows a player's coins, leading to the shop", async () => {
    mockApi({ user: pixel, coins: 12_480 })
    renderRoute('/')

    const coins = await header().findByRole('link', { name: '12,480 coins' })
    expect(coins).toHaveAttribute('href', '/shop')
    expect(header().queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('shows no coins to a guest', async () => {
    mockApi()
    renderRoute('/')

    expect(await header().findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(header().queryByRole('link', { name: /coins/ })).not.toBeInTheDocument()
  })

  it('shows an admin their coins and the way to the admin page', async () => {
    mockApi({ user: admin, coins: 0 })
    renderRoute('/')

    expect(await header().findByRole('link', { name: '0 coins' })).toBeInTheDocument()
    expect(header().getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })
})

describe('the home page for a signed-in player', () => {
  it('puts their coins, level and daily reward up front', async () => {
    mockApi({ user: pixel, coins: 1240 })
    renderRoute('/')

    const progress = within(await screen.findByRole('region', { name: 'Your progress' }))
    expect(await progress.findByText('1,240 coins')).toBeInTheDocument()
    expect(await progress.findByText('Level 2')).toBeInTheDocument()
    expect(progress.getByRole('link', { name: /spend them in the shop/i })).toHaveAttribute('href', '/shop')
    expect(await progress.findByRole('button', { name: /claim day 1/i })).toBeInTheDocument()
  })

  it('lists their latest achievements', async () => {
    mockApi({ user: pixel })
    renderRoute('/')

    const recent = within(await screen.findByRole('region', { name: 'Recent achievements' }))
    expect(recent.getByText('First Coin')).toBeInTheDocument()
    expect(recent.queryByText('Regular')).not.toBeInTheDocument()
    expect(recent.getByRole('link', { name: 'All achievements' })).toHaveAttribute('href', '/profile')
  })

  it('shows a guest none of it', async () => {
    mockApi()
    renderRoute('/')

    expect(await screen.findByRole('region', { name: 'Featured games' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your progress' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recent achievements' })).not.toBeInTheDocument()
  })
})
