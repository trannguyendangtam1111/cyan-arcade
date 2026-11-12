import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CLASSIC } from '@/api/games'
import { formatScore } from '@/lib/format'
import { catalogFixture, mockApi, mockJson, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const historySection = async () => within(await screen.findByRole('region', { name: 'Recent games' }))

describe('recent result modes and units', () => {
  it('uses declared labels and units for mixed points, timed and Daily results', async () => {
    const fetchSpy = mockApi({ user: pixel,
      games: [...catalogFixture, { ...catalogFixture[0], id: 4, slug: 'sudoku', name: 'Sudoku', category: 'PUZZLE' }],
      modes: {
        tetris: [CLASSIC,
          { id: 'sprint', name: 'Sprint 40L', ranked: true, order: 'ASC', unit: 'MILLISECONDS' },
          { id: 'ultra', name: 'Ultra', ranked: true, order: 'DESC', unit: 'POINTS' },
        ],
        sudoku: [CLASSIC, { id: 'daily', name: 'Daily', ranked: true, order: 'DESC', unit: 'POINTS' }],
        snake: [CLASSIC, { id: 'adventure-1', name: 'First Adventure', ranked: false, order: 'ASC', unit: 'MILLISECONDS' }],
      },
      history: [
        { gameSlug: '2048', gameName: '2048', mode: 'classic', score: 24680 },
        { gameSlug: 'tetris', gameName: 'Tetris', mode: 'sprint', score: 48120, durationMs: 1800000 },
        { gameSlug: 'tetris', gameName: 'Tetris', mode: 'ultra', score: 96000 },
        { gameSlug: 'sudoku', gameName: 'Sudoku', mode: 'daily', score: 7500 },
        { gameSlug: 'snake', gameName: 'Snake', mode: 'adventure-1', score: 65040 },
      ],
    })
    renderRoute('/profile')
    const section = await historySection()
    await section.findByText('Sprint 40L')
    await section.findByText('Daily')
    await section.findByText('First Adventure')
    const rows = section.getAllByRole('row').slice(1).map((row) => within(row))
    expect(rows[0].getByText('Classic')).toBeInTheDocument()
    expect(rows[0].getByText(formatScore(24680))).toBeInTheDocument()
    expect(rows[0].getByText('Points')).toBeInTheDocument()
    expect(rows[1].getByText('0:48.12')).toBeInTheDocument()
    expect(rows[1].getByText('Time')).toBeInTheDocument()
    expect(rows[1].queryByText(formatScore(48120))).not.toBeInTheDocument()
    expect(rows[1].queryByText('30:00.00')).not.toBeInTheDocument()
    expect(rows[2].getByText('Ultra')).toBeInTheDocument()
    expect(rows[2].getByText(formatScore(96000))).toBeInTheDocument()
    expect(rows[2].getByText('Points')).toBeInTheDocument()
    expect(rows[3].getByText(formatScore(7500))).toBeInTheDocument()
    expect(rows[3].getByText('Points')).toBeInTheDocument()
    expect(rows[4].getByText('1:05.04')).toBeInTheDocument()
    expect(section.getByRole('columnheader', { name: 'Score / time' })).toBeInTheDocument()
    expect(section.getByText('Includes saved results from all modes.')).toBeInTheDocument()
    // Repeated Tetris rows share the existing mode query, rather than fetching per result.
    expect(fetchSpy.mock.calls.filter(([url]) => String(url) === '/api/games/tetris/modes')).toHaveLength(1)
  })

  it.each([undefined, null, ''])('treats legacy mode %s as Classic points without metadata requests', async (mode) => {
    const fetchSpy = mockApi({ user: pixel, handlers: [({ path }) => path === '/api/users/me/game-history'
      ? mockJson({ entries: [{ gameSlug: 'sudoku', gameName: 'Sudoku', mode, score: 7500, durationMs: 90000,
        playedAt: '2026-09-30T10:00:00Z', xpEarned: 10, personalBest: false }], page: 0, size: 8, totalEntries: 1, totalPages: 1 })
      : undefined] })
    renderRoute('/profile')
    const section = await historySection()
    expect(await section.findByText('Classic')).toBeInTheDocument()
    expect(section.getByText(formatScore(7500))).toBeInTheDocument()
    expect(section.getByText('Points')).toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([url]) => /\/modes$/.test(String(url)))).toBe(false)
  })

  it('formats a new timed mode from metadata rather than hardcoded game or mode IDs', async () => {
    mockApi({ user: pixel, modes: { snake: [CLASSIC,
      { id: 'trial', name: 'Speed Trial', ranked: true, order: 'ASC', unit: 'MILLISECONDS' },
    ] }, history: [{ gameSlug: 'snake', gameName: 'Snake', mode: 'trial', score: 59960 }] })
    renderRoute('/profile')
    const section = await historySection()
    expect(await section.findByText('Speed Trial')).toBeInTheDocument()
    expect(section.getByText('0:59.96')).toBeInTheDocument()
  })

  it('shows a non-Classic ranked result without implying it counts in Classic totals or ranks', async () => {
    mockApi({ user: pixel, modes: { tetris: [CLASSIC,
      { id: 'sprint', name: 'Sprint 40L', ranked: true, order: 'ASC', unit: 'MILLISECONDS' },
    ] }, history: [{ gameSlug: 'tetris', gameName: 'Tetris', mode: 'sprint', score: 50000 }],
    profile: { gamesPlayed: 0, totalScore: 0 },
    stats: { gamesPlayed: 0, totalScore: 0, playTimeMs: 0, games: [] },
    ranks: { bestRank: null, bestRankGame: null, games: [] },
    })
    renderRoute('/profile')
    const section = await historySection()
    expect(await section.findByText('0:50.00')).toBeInTheDocument()
    const value = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div')!.querySelector('dd')
    expect(value('Games played (Classic)')).toHaveTextContent('0')
    expect(value('Total score (Classic)')).toHaveTextContent('0')
    expect(value('Play time (Classic)')).toHaveTextContent('0.0s')
    expect(screen.getByText('No Classic rank yet.')).toBeInTheDocument()
  })

  it('keeps a retired mode identifiable without guessing its score unit', async () => {
    mockApi({ user: pixel, history: [{ gameSlug: 'tetris', gameName: 'Tetris', mode: 'retired-race', score: 48120 }] })
    renderRoute('/profile')
    const section = await historySection()
    expect(await section.findByText('Recorded value · unit unavailable')).toBeInTheDocument()
    expect(section.getByText('retired-race')).toBeInTheDocument()
    expect(section.getByText(formatScore(48120))).toBeInTheDocument()
    expect(section.queryByText('Points')).not.toBeInTheDocument()
    expect(section.queryByText('Time', { exact: true })).not.toBeInTheDocument()
  })

  it('keeps history available on metadata failure and can retry the mode details', async () => {
    let unavailable = true
    mockApi({ user: pixel, history: [{ gameSlug: 'tetris', gameName: 'Tetris', mode: 'sprint', score: 48120 }],
      handlers: [({ path }) => path === '/api/games/tetris/modes'
        ? unavailable ? mockProblem(503, 'UNAVAILABLE', 'Unavailable') : mockJson([
          CLASSIC, { id: 'sprint', name: 'Sprint 40L', ranked: true, order: 'ASC', unit: 'MILLISECONDS' },
        ]) : undefined],
    })
    renderRoute('/profile')
    const section = await historySection()
    const retry = await section.findByRole('button', { name: 'Retry mode details for Tetris' })
    expect(section.getByText('sprint')).toBeInTheDocument()
    expect(section.getByText('Recorded value · unit unavailable')).toBeInTheDocument()
    unavailable = false
    await userEvent.click(retry)
    expect(await section.findByText('Sprint 40L')).toBeInTheDocument()
    expect(section.getByText('0:48.12')).toBeInTheDocument()
    expect(section.queryByText('Recorded value · unit unavailable')).not.toBeInTheDocument()
  })
})
