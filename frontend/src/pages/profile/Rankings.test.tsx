import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const rankings = async () => within(await screen.findByRole('region', { name: 'Rankings' }))

describe('the profile rankings', () => {
  it("shows the player's best rank and their place on every board", async () => {
    mockApi({
      user: pixel,
      ranks: {
        bestRank: 3,
        bestRankGame: { slug: 'tetris', name: 'Tetris' },
        games: [
          { game: { slug: 'snake', name: 'Snake' }, daily: null, weekly: { rank: 17, score: 40 }, allTime: { rank: 120, score: 52 } },
          { game: { slug: 'tetris', name: 'Tetris' }, daily: { rank: 1, score: 9000 }, weekly: { rank: 2, score: 9000 }, allTime: { rank: 3, score: 12000 } },
        ],
      },
    })
    renderRoute('/profile')

    const section = await rankings()
    expect(await section.findByText('#3', { selector: 'span' })).toBeInTheDocument()
    expect(section.getByText(/in Tetris, of all time/)).toBeInTheDocument()

    const table = within(section.getByRole('table', { name: /your rank in every game/i }))
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Game',
      'Today',
      'This week',
      'All time',
    ])
    const snake = table.getByRole('row', { name: /snake/i })
    // No score today: no rank, none made up.
    expect(within(snake).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['–', '#17', '#120'])
    expect(within(snake).getByRole('link', { name: '#17' })).toHaveAttribute(
      'href',
      '/leaderboard?game=snake&period=weekly',
    )
    const tetris = table.getByRole('row', { name: /tetris/i })
    expect(within(tetris).getByRole('link', { name: '#1' })).toHaveAttribute('href', '/leaderboard?game=tetris&period=daily')
  })

  it('says so when the player is not ranked anywhere yet', async () => {
    mockApi({
      user: pixel,
      ranks: {
        bestRank: null,
        bestRankGame: null,
        games: [{ game: { slug: 'snake', name: 'Snake' }, daily: null, weekly: null, allTime: null }],
      },
    })
    renderRoute('/profile')

    const section = await rankings()
    expect(await section.findByText('Not ranked yet.')).toBeInTheDocument()
    expect(section.queryByRole('link')).not.toBeInTheDocument()
  })
})
