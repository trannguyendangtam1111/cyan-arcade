import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CLASSIC, type GameMode } from '@/api/games'
import { catalogFixture, mockApi, mockJson, mockProblem, type MockHandler } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

// Test-only declarations exercise the shared board contract independently of game implementations.
const SPRINT: GameMode = { id: 'sprint', name: 'Sprint', ranked: true, order: 'ASC', unit: 'MILLISECONDS' }
const PRACTICE: GameMode = { id: 'practice', name: 'Practice', ranked: false, order: 'DESC', unit: 'POINTS' }

/** Sprint times, fastest first, in milliseconds. */
const sprintTimes = [{ score: 12_345 }, { score: 65_432 }, { score: 70_000 }, { score: 80_000 }]

const modeGroup = () => screen.queryByRole('group', { name: 'Choose a mode' })
const modeButtons = () => within(modeGroup()!).getAllByRole('button')
const podium = () => within(screen.getByRole('list', { name: /^Top \d in/ })).getAllByRole('listitem')
const rows = () => screen.getAllByRole('row').slice(1) // without the header row
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)

function requests(fetchSpy: ReturnType<typeof mockApi>, prefix: string) {
  return fetchSpy.mock.calls.map(([input]) => String(input)).filter((path) => path.startsWith(prefix))
}
const boardRequests = (fetchSpy: ReturnType<typeof mockApi>) => requests(fetchSpy, '/api/leaderboards/')
const modeRequests = (fetchSpy: ReturnType<typeof mockApi>) =>
  requests(fetchSpy, '/api/games/').filter((path) => path.endsWith('/modes'))

const status = (code: number) => new Response('{}', { status: code, headers: { 'Content-Type': 'application/json' } })

const sudokuBoard = (id: string, name: string): GameMode => ({ id, name, ranked: true, order: 'DESC', unit: 'POINTS' })
const sudokuGame = { ...catalogFixture[1], id: 8, slug: 'sudoku', name: 'Sudoku', thumbnailUrl: '/thumbnails/sudoku.svg' }
const sudokuModes = [
  CLASSIC,
  sudokuBoard('daily', 'Daily'),
  sudokuBoard('easy', 'Easy'),
  sudokuBoard('medium', 'Medium'),
  sudokuBoard('hard', 'Hard'),
  sudokuBoard('expert', 'Expert'),
]
const TODAY = '2026-11-07'
const FIRST_DAY = Date.UTC(2026, 0, 1)

/**
 * Sudoku's dated Daily boards as the server answers them: today is 2026-11-07, a date after it has no
 * puzzle (404), and each date's scores are those given for it.
 */
function sudokuDailyBoards(scores: Record<string, number[]>): MockHandler {
  return ({ url }) => {
    if (url.pathname !== '/api/sudoku/daily/leaderboard') return undefined
    const date = url.searchParams.get('date') ?? TODAY
    if (date > TODAY) return mockProblem(404, 'NOT_FOUND', `Daily Sudoku of '${date}' was not found`)
    const entries = (scores[date] ?? []).map((score, index) => ({
      rank: index + 1,
      player: null,
      score,
      durationMs: 300_000,
      achievedAt: `${date}T23:59:00Z`,
      you: false,
    }))
    return mockJson({
      date,
      puzzleNumber: (Date.parse(`${date}T00:00:00Z`) - FIRST_DAY) / 86_400_000 + 1,
      difficulty: 'HARD',
      today: TODAY,
      nextPuzzleAt: '2026-11-08T00:00:00Z',
      entries,
      page: 0,
      size: 20,
      totalEntries: entries.length,
      totalPages: entries.length > 0 ? 1 : 0,
      myRank: null,
      myScore: null,
    })
  }
}

const dailyRequests = (fetchSpy: ReturnType<typeof mockApi>) => requests(fetchSpy, '/api/sudoku/daily/leaderboard')
const periodGroup = () => screen.queryByRole('group', { name: 'Choose a period' })

describe('leaderboard modes', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows no mode tabs for a game with Classic alone, and asks for its Classic board', async () => {
    const fetchSpy = mockApi({ scores: { snake: [{ score: 31 }] } })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('list', { name: 'Top 1 in Snake' })).toBeInTheDocument()
    await waitFor(() => expect(modeRequests(fetchSpy)).toEqual(['/api/games/snake/modes']))
    expect(modeGroup()).not.toBeInTheDocument()
    expect(boardRequests(fetchSpy)).toEqual(['/api/leaderboards/snake?mode=classic&period=ALL_TIME&page=0&size=20'])
  })

  it("shows a tab for each of the server's ranked modes, Classic first, and none for an unranked one", async () => {
    mockApi({ modes: { snake: [CLASSIC, SPRINT, PRACTICE] }, scores: { snake: [{ score: 31 }] } })
    renderRoute('/leaderboard')

    await waitFor(() => expect(modeGroup()).toBeInTheDocument())
    expect(modeButtons().map((button) => button.textContent)).toEqual(['Classic', 'Sprint'])
    expect(within(modeGroup()!).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches mode on the same period, from the first page, and writes a timed board as times', async () => {
    const classic = Array.from({ length: 25 }, (_, index) => ({ score: 1000 - index }))
    const fetchSpy = mockApi({
      modes: { snake: [CLASSIC, SPRINT] },
      scores: { snake: classic, 'snake@sprint': sprintTimes },
      standings: { 'snake@sprint': { rank: 2, score: 65_432 } },
    })
    renderRoute('/leaderboard?game=snake&period=weekly&page=2')
    await screen.findByRole('navigation', { name: 'Leaderboard pages' })

    fireEvent.click(await screen.findByRole('button', { name: 'Sprint' }))

    expect(await screen.findByRole('list', { name: 'Top 3 in Snake' })).toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/snake?mode=sprint&period=WEEKLY&page=0&size=20')
    expect(screen.getByRole('button', { name: 'Sprint' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true')

    // The server ranked it fastest first; the page only writes each time as a time.
    expect(podium().map((place) => place.textContent)).toEqual([
      '🥇Rank 1Guest0:12.34',
      '🥈Rank 2Guest1:05.43',
      '🥉Rank 3Guest1:10.00',
    ])
    // The score is the time, so there is no second time column.
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Rank', 'Player', 'Time', 'Date'])
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['4', 'Guest', '1:20.00'])
    expect(screen.getByRole('table', { name: /fastest first/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Your rank' })).getByText('1:05.43')).toBeInTheDocument()
  })

  it("never shows one mode's board for another's, even while the other is loading", async () => {
    let release!: () => void
    const sprintBoard = new Promise<Response>((resolve) => {
      release = () =>
        resolve(
          mockJson({
            gameSlug: 'snake',
            mode: 'sprint',
            order: 'ASC',
            unit: 'MILLISECONDS',
            period: 'ALL_TIME',
            periodStart: null,
            periodEnd: null,
            entries: [{ rank: 1, player: null, score: 9_000, durationMs: 9_000, achievedAt: '2026-09-30T10:00:00Z', you: false }],
            page: 0,
            size: 20,
            totalEntries: 1,
            totalPages: 1,
            myRank: null,
            myScore: null,
          }),
        )
    })
    const fetchSpy = mockApi({
      modes: { snake: [CLASSIC, SPRINT] },
      scores: { snake: [{ score: 31 }] },
      handlers: [({ url }) => (url.searchParams.get('mode') === 'sprint' ? sprintBoard : undefined)],
    })
    renderRoute('/leaderboard?game=snake')
    expect(await screen.findByText('31')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Sprint' }))

    // Classic's scores are gone at once: the Sprint board loads on its own.
    expect(screen.queryByText('31')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading leaderboard' })).toBeInTheDocument()

    release()
    expect(await screen.findByText('0:09.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Classic' }))
    expect(await screen.findByText('31')).toBeInTheDocument()
    expect(screen.queryByText('0:09.00')).not.toBeInTheDocument()
    expect(boardRequests(fetchSpy).map((path) => new URL(path, 'http://localhost').searchParams.get('mode'))).toEqual(
      expect.arrayContaining(['classic', 'sprint']),
    )
  })

  it('shows the Classic board for a mode in the URL that has no board of its own', async () => {
    const fetchSpy = mockApi({ modes: { snake: [CLASSIC, SPRINT, PRACTICE] }, scores: { snake: [{ score: 31 }] } })
    renderRoute('/leaderboard?game=snake&mode=practice')

    expect(await screen.findByText('31')).toBeInTheDocument()
    expect(boardRequests(fetchSpy)).toEqual(['/api/leaderboards/snake?mode=classic&period=ALL_TIME&page=0&size=20'])
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers Classic alone when the backend has no modes endpoint', async () => {
    const fetchSpy = mockApi({
      scores: { snake: [{ score: 31 }] },
      handlers: [({ path }) => (path.endsWith('/modes') ? status(404) : undefined)],
    })
    renderRoute('/leaderboard?game=snake&mode=sprint')

    expect(await screen.findByText('31')).toBeInTheDocument()
    expect(modeGroup()).not.toBeInTheDocument()
    expect(boardRequests(fetchSpy)).toEqual(['/api/leaderboards/snake?mode=classic&period=ALL_TIME&page=0&size=20'])
  })

  it('still shows the Classic board when the modes cannot be loaded, without taking that for Classic only', async () => {
    mockApi({
      modes: { snake: [CLASSIC, SPRINT] },
      scores: { snake: [{ score: 31 }] },
      handlers: [({ path }) => (path.endsWith('/modes') ? status(503) : undefined)],
    })
    renderRoute('/leaderboard?game=snake')

    expect(await screen.findByText('31')).toBeInTheDocument()
    expect(modeGroup()).not.toBeInTheDocument()
  })

  it('says so, with a retry, when the modes cannot be loaded for a board other than Classic', async () => {
    let down = true
    const fetchSpy = mockApi({
      modes: { snake: [CLASSIC, SPRINT] },
      scores: { 'snake@sprint': sprintTimes },
      handlers: [({ path }) => (down && path.endsWith('/modes') ? status(503) : undefined)],
    })
    renderRoute('/leaderboard?game=snake&mode=sprint')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the modes of Snake")
    expect(boardRequests(fetchSpy)).toEqual([])

    down = false
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }))
    expect(await screen.findByText('0:12.34')).toBeInTheDocument()
    expect(boardRequests(fetchSpy)).toEqual(['/api/leaderboards/snake?mode=sprint&period=ALL_TIME&page=0&size=20'])
  })

  it("asks for a game's modes once, however often the period changes", async () => {
    const fetchSpy = mockApi({ modes: { snake: [CLASSIC, SPRINT] }, scores: { snake: [{ score: 31 }] } })
    renderRoute('/leaderboard?game=snake')
    await screen.findByText('31')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    await screen.findByText('31')

    expect(modeRequests(fetchSpy)).toEqual(['/api/games/snake/modes'])
  })

  it('starts another game on its Classic board', async () => {
    const fetchSpy = mockApi({
      modes: { snake: [CLASSIC, SPRINT] },
      scores: { 'snake@sprint': sprintTimes, tetris: [{ score: 500 }] },
    })
    renderRoute('/leaderboard?game=snake&mode=sprint')
    await screen.findByText('0:12.34')

    fireEvent.click(screen.getByRole('button', { name: 'Tetris' }))

    expect(await screen.findByText('500')).toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/tetris?mode=classic&period=ALL_TIME&page=0&size=20')
    expect(modeGroup()).not.toBeInTheDocument()
  })
})

describe('a timed board, written to the hundredth', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps times a fraction of a second apart distinct, in the order and with the values the server sent', async () => {
    // Fastest first, as the server ranks them; within one second of each other above a minute.
    const times = [65_040, 65_920, 65_960, 66_000, 66_040]
    const fetchSpy = mockApi({
      modes: { snake: [CLASSIC, SPRINT] },
      scores: { snake: [{ score: 1234 }], 'snake@sprint': times.map((score) => ({ score })) },
      standings: { 'snake@sprint': { rank: 4, score: 66_000 } },
    })
    renderRoute('/leaderboard?game=snake&mode=sprint')

    expect(await screen.findByRole('list', { name: 'Top 3 in Snake' })).toBeInTheDocument()
    expect(podium().map((place) => place.textContent)).toEqual([
      '🥇Rank 1Guest1:05.04',
      '🥈Rank 2Guest1:05.92',
      '🥉Rank 3Guest1:05.96',
    ])
    expect(rows().map((row) => cells(row).slice(0, 3))).toEqual([
      ['4', 'Guest', '1:06.00'],
      ['5', 'Guest', '1:06.04'],
    ])
    expect(within(screen.getByRole('region', { name: 'Your rank' })).getByText('1:06.00')).toBeInTheDocument()
    // Formatting asks for nothing different: the board is the server's, by mode and page alone.
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/snake?mode=sprint&period=ALL_TIME&page=0&size=20')
  })

  it('opens Sudoku on its Daily board, offers each difficulty, and keeps the old scores apart as Legacy', async () => {
    const fetchSpy = mockApi({
      games: [...catalogFixture, sudokuGame],
      modes: { sudoku: sudokuModes },
      scores: { sudoku: [{ score: 700 }], 'sudoku@daily': [{ score: 800 }], 'sudoku@hard': [{ score: 1200 }] },
      handlers: [sudokuDailyBoards({ [TODAY]: [900] })],
    })
    renderRoute('/leaderboard?game=sudoku')

    await waitFor(() => expect(modeGroup()).toBeInTheDocument())
    expect(modeButtons().map((button) => button.textContent)).toEqual(['Daily', 'Easy', 'Medium', 'Hard', 'Expert', 'Legacy'])
    expect(screen.getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true')
    // Today's puzzle's board, by its date: not the platform's board of scores that arrived today.
    expect(await screen.findByText('900')).toBeInTheDocument()
    expect(dailyRequests(fetchSpy)).toEqual(['/api/sudoku/daily/leaderboard?page=0&size=20'])
    expect(boardRequests(fetchSpy)).toEqual([])
    expect(screen.queryByText('800')).not.toBeInTheDocument()
    expect(screen.queryByText(/kept as they were/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hard' }))
    expect(await screen.findByText('1,200')).toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/sudoku?mode=hard&period=ALL_TIME&page=0&size=20')

    // The scores from before the split: Classic on the server, said plainly to be the old ones.
    fireEvent.click(screen.getByRole('button', { name: 'Legacy' }))
    expect(await screen.findByText('700')).toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/sudoku?mode=classic&period=ALL_TIME&page=0&size=20')
    expect(screen.getByText(/Scores from before Sudoku had a Daily board/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Top 1 in Sudoku' })).toBeInTheDocument()
  })

  it('leaves a points board written as points', async () => {
    mockApi({ modes: { snake: [CLASSIC, SPRINT] }, scores: { snake: [{ score: 65_040 }] } })
    renderRoute('/leaderboard?game=snake')

    expect(await screen.findByText('65,040')).toBeInTheDocument()
    expect(screen.queryByText('1:05.04')).not.toBeInTheDocument()
  })
})

describe('Sudoku Daily boards by puzzle date', () => {
  beforeEach(() => window.localStorage.clear())

  it("shows Sudoku's Daily board by puzzle date, with the puzzles before it and no periods", async () => {
    const fetchSpy = mockApi({
      games: [...catalogFixture, sudokuGame],
      modes: { sudoku: sudokuModes },
      handlers: [sudokuDailyBoards({ [TODAY]: [900, 640], '2026-11-06': [1_150] })],
    })
    renderRoute('/leaderboard?game=sudoku')

    const dates = await screen.findByRole('group', { name: 'Choose a puzzle date' })
    expect(within(dates).getByText('Daily #311 · Sat 7 Nov 2026')).toBeInTheDocument()
    expect(screen.getByText(/ranked by the puzzle's date \(UTC\)/)).toBeInTheDocument()
    expect(await screen.findByText('900')).toBeInTheDocument()
    // One board per puzzle: no periods to choose, and no puzzle after today's.
    expect(periodGroup()).not.toBeInTheDocument()
    expect(within(dates).getByRole('button', { name: 'Next puzzle' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: "Today's puzzle" })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Your rank' })).getByText(/New board in/)).toBeInTheDocument()

    // Yesterday's puzzle has its own board, scores and all, whenever they were submitted.
    fireEvent.click(within(dates).getByRole('button', { name: 'Previous puzzle' }))
    expect(await screen.findByText('Daily #310 · Fri 6 Nov 2026')).toBeInTheDocument()
    expect(await screen.findByText('1,150')).toBeInTheDocument()
    expect(screen.queryByText('900')).not.toBeInTheDocument()
    expect(dailyRequests(fetchSpy).at(-1)).toBe('/api/sudoku/daily/leaderboard?page=0&size=20&date=2026-11-06')
    expect(screen.queryByText(/New board in/)).not.toBeInTheDocument()

    // A day nobody finished says so; today is one click away.
    fireEvent.click(within(screen.getByRole('group', { name: 'Choose a puzzle date' })).getByRole('button', { name: 'Previous puzzle' }))
    expect(await screen.findByText('No scores for Daily #309')).toBeInTheDocument()
    expect(screen.getByText('Nobody finished this puzzle.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "Today's puzzle" }))
    expect(await screen.findByText('Daily #311 · Sat 7 Nov 2026')).toBeInTheDocument()
    expect(dailyRequests(fetchSpy).at(-1)).toBe('/api/sudoku/daily/leaderboard?page=0&size=20')

    // Another board of Sudoku has its periods again.
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }))
    await waitFor(() => expect(periodGroup()).toBeInTheDocument())
  })

  it('says when a Sudoku puzzle date in the link has no board', async () => {
    const fetchSpy = mockApi({
      games: [...catalogFixture, sudokuGame],
      modes: { sudoku: sudokuModes },
      handlers: [sudokuDailyBoards({ [TODAY]: [900] })],
    })
    renderRoute('/leaderboard?game=sudoku&date=2026-11-09')

    expect(await screen.findByText('No Daily Sudoku that day')).toBeInTheDocument()
    expect(dailyRequests(fetchSpy)).toEqual(['/api/sudoku/daily/leaderboard?page=0&size=20&date=2026-11-09'])
    fireEvent.click(screen.getByRole('button', { name: "Today's board" }))
    expect(await screen.findByText('900')).toBeInTheDocument()
    expect(dailyRequests(fetchSpy).at(-1)).toBe('/api/sudoku/daily/leaderboard?page=0&size=20')
  })

  it("asks for today's Sudoku board when the date in the link is not a date", async () => {
    const fetchSpy = mockApi({
      games: [...catalogFixture, sudokuGame],
      modes: { sudoku: sudokuModes },
      handlers: [sudokuDailyBoards({ [TODAY]: [900] })],
    })
    renderRoute('/leaderboard?game=sudoku&date=yesterday')
    expect(await screen.findByText('900')).toBeInTheDocument()
    expect(dailyRequests(fetchSpy)).toEqual(['/api/sudoku/daily/leaderboard?page=0&size=20'])
  })
})
