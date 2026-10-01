import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** Names of the game cards on the page, in order. */
const cardNames = () =>
  within(screen.getByRole('region', { name: /games$/i }))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)

const filters = () => within(screen.getByRole('group', { name: 'Filter by category' }))

describe('browsing the catalog by category', () => {
  it('offers a filter for every category that has games, with how many', async () => {
    mockApi()
    renderRoute('/games')

    await screen.findByRole('link', { name: /snake/i })
    expect(filters().getAllByRole('button').map((button) => button.textContent)).toEqual(['All3', 'Arcade1', 'Puzzle2'])
    expect(filters().getByRole('button', { name: /all/i })).toHaveAttribute('aria-pressed', 'true')
    expect(cardNames()).toEqual(['Snake', '2048', 'Tetris'])
  })

  it('shows only the chosen category, and everything again on "All"', async () => {
    mockApi()
    renderRoute('/games')
    await screen.findByRole('link', { name: /snake/i })

    await userEvent.click(filters().getByRole('button', { name: /puzzle/i }))

    expect(filters().getByRole('button', { name: /puzzle/i })).toHaveAttribute('aria-pressed', 'true')
    expect(filters().getByRole('button', { name: /all/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { level: 2, name: 'Puzzle games' })).toBeInTheDocument()
    expect(cardNames()).toEqual(['2048', 'Tetris'])

    await userEvent.click(filters().getByRole('button', { name: /all/i }))

    expect(screen.getByRole('heading', { level: 2, name: 'All games' })).toBeInTheDocument()
    expect(cardNames()).toEqual(['Snake', '2048', 'Tetris'])
  })

  it('opens already filtered from a link', async () => {
    mockApi()
    renderRoute('/games?category=arcade')

    expect(await screen.findByRole('link', { name: /snake/i })).toBeInTheDocument()
    expect(cardNames()).toEqual(['Snake'])
    expect(filters().getByRole('button', { name: /arcade/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows everything when the link names a category that does not exist', async () => {
    mockApi()
    renderRoute('/games?category=racing')

    await screen.findByRole('link', { name: /snake/i })
    expect(cardNames()).toEqual(['Snake', '2048', 'Tetris'])
  })

  it('explains an empty category and offers the way back', async () => {
    mockApi()
    renderRoute('/games?category=card')

    expect(await screen.findByRole('heading', { name: 'No card games yet' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show all games' }))

    expect(cardNames()).toEqual(['Snake', '2048', 'Tetris'])
  })

  it('offers recently played games above the catalog, but not while filtering', async () => {
    window.localStorage.setItem('cyan-arcade:recent-games', JSON.stringify(['tetris']))
    mockApi()
    renderRoute('/games')

    const recent = within(await screen.findByRole('region', { name: 'Jump back in' }))
    expect(recent.getByRole('link', { name: /tetris/i })).toHaveAttribute('href', '/games/tetris')

    await userEvent.click(filters().getByRole('button', { name: /arcade/i }))

    expect(screen.queryByRole('region', { name: 'Jump back in' })).not.toBeInTheDocument()
  })
})
