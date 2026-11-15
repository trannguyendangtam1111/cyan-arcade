/// <reference types="node" />
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import {
  A_MINE,
  DAY,
  LONE_TWO,
  SAFE_CELLS,
  START_CELL,
  TIME_LIMIT_MS,
  WINNING_CELL,
  clockFrom,
  minesweeperDailyServer,
  type DailyServerOptions,
} from '@/test/minesweeperDailyServer'
import { DAILY_LOGIN_PATH } from './components/DailyBoard'
import MinesweeperGame from './MinesweeperGame'

/** Where the game remembers, for this tab, that the Daily Board was open. */
const VIEW_KEY = 'cyan-arcade:minesweeper:view'
const ALL_MODES = ['classic', 'beginner', 'intermediate', 'expert']

const grid = () => screen.getByRole('grid', { name: 'Minefield' })
const cells = () => within(grid()).getAllByRole('gridcell')
/** The button of a board cell, wherever it is drawn. */
const cellAt = (index: number) => cells().find((button) => Number(button.dataset.index) === index) as HTMLElement
const labelOf = (index: number) => cellAt(index).getAttribute('aria-label') ?? ''
const isCovered = (index: number) => /: (hidden|flagged)$/.test(labelOf(index))
const stat = (label: string) => screen.getAllByText(label, { selector: 'dt' }).at(-1)?.nextElementSibling?.textContent
const dailyEntry = () => screen.getByRole('region', { name: 'Daily Board' })
const tapTool = (name: string) => within(screen.getByRole('group', { name: 'What a tap does' })).getByRole('button', { name })

type Server = ReturnType<typeof minesweeperDailyServer>

/** Minesweeper as the game page shows it, with the Daily Board's server behind it. */
function setup({
  daily = true,
  user = pixel,
  before,
  ...options
}: DailyServerOptions & { daily?: boolean; user?: typeof pixel | null; before?: (server: Server) => void } = {}) {
  const server = minesweeperDailyServer(options)
  // What the server already has when the page loads, such as an attempt started earlier.
  before?.(server)
  mockApi({ user, handlers: [server.handler] })
  if (daily) sessionStorage.setItem(VIEW_KEY, 'daily')
  return { server, ...show() }
}

function show() {
  const onRewarded = vi.fn()
  const view = render(
    <MemoryRouter>
      <MinesweeperGame onGameStart={vi.fn()} onGameOver={vi.fn()} onRewarded={onRewarded} modes={ALL_MODES} />
    </MemoryRouter>,
  )
  return { unmount: view.unmount, onRewarded }
}

/** Waits for the attempt's board: the opening uncovered. */
const opened = () => waitFor(() => expect(labelOf(START_CELL)).toMatch(/: empty$/))

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
  await opened()
}

/** The win screen's reward line as a screen reader reads it, or `null` without one. */
function reward(): string | null {
  const line = screen.queryByText('Earned:')?.parentElement
  if (!line) return null
  return [...line.children]
    .map((part) => {
      const read = part.cloneNode(true) as HTMLElement
      read.querySelectorAll('[aria-hidden]').forEach((hidden) => hidden.remove())
      return read.textContent?.trim()
    })
    .join(' ')
}

const reveals = (server: Server) => server.sent(/^POST .*\/reveal$/)
const flags = (server: Server) => server.sent(/^POST .*\/flag$/)

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('finding the Daily Board', () => {
  it('sits beside the four modes, opens, and leads back to them', async () => {
    const { server } = setup({ daily: false })

    const modes = within(screen.getByRole('group', { name: 'Game mode' })).getAllByRole('button')
    expect(modes.map((button) => button.textContent)).toEqual(['Classic', 'Beginner', 'Intermediate', 'Expert'])
    expect(within(dailyEntry()).getByText(/One shared 16 × 16 board a day/)).toBeInTheDocument()
    // Nothing is asked of the Daily Board's server until it is opened.
    expect(server.requests).toEqual([])

    fireEvent.click(within(dailyEntry()).getByRole('button', { name: 'Play the Daily Board' }))
    expect(await screen.findByRole('heading', { name: 'Daily Board #7' })).toBeInTheDocument()
    expect(screen.getByText('Sat 7 Nov 2026 (UTC)')).toBeInTheDocument()
    expect(screen.getByText(/One attempt per account per\s+day/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Start' })).toBeEnabled()
    expect(sessionStorage.getItem(VIEW_KEY)).toBe('daily')
    expect(screen.queryByRole('group', { name: 'Game mode' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '← Classic and timed modes' }))
    expect(within(screen.getByRole('group', { name: 'Game mode' })).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
    expect(sessionStorage.getItem(VIEW_KEY)).toBeNull()
  })

  it('waits until a Classic run is over', () => {
    setup({ daily: false })
    // A Classic board is 9 × 9: its first reveal starts the run.
    fireEvent.click(cells()[40])
    expect(within(dailyEntry()).getByRole('button', { name: 'Play the Daily Board' })).toBeDisabled()
    expect(within(dailyEntry()).getByText('Open it once this run ends.')).toBeInTheDocument()
  })

  it('cannot be left while an attempt is being played: the server keeps timing it', async () => {
    setup()
    await start()
    expect(screen.getByRole('button', { name: '← Classic and timed modes' })).toBeDisabled()
    expect(screen.getByText(/The server's clock keeps running/)).toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('is needed to play: the board stays covered, with a way to sign in and come back', async () => {
    const { server } = setup({ user: null })
    expect(await screen.findByRole('heading', { name: 'Sign in to play' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', DAILY_LOGIN_PATH)
    expect(DAILY_LOGIN_PATH).toBe('/login?redirect=%2Fgames%2Fminesweeper')
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    expect(cells()).toHaveLength(256)
    expect(cells().every((button) => /: hidden$/.test(button.getAttribute('aria-label') ?? ''))).toBe(true)
    expect(server.sent(/^POST /)).toEqual([])
    expect(server.sent(/leaderboard/)).toEqual([])
  })

  it('is asked for again when the session ends mid-attempt', async () => {
    const { server } = setup()
    await start()
    server.failNext(/\/reveal$/, 401)
    fireEvent.click(cellAt(LONE_TWO))
    expect(await screen.findByRole('heading', { name: 'Sign in to play' })).toBeInTheDocument()
  })
})

describe('an attempt', () => {
  it('starts on the server, with the day’s opening already uncovered', async () => {
    const { server } = setup()
    expect(await screen.findByRole('heading', { name: "Today's board is ready" })).toBeInTheDocument()
    expect(cells()).toHaveLength(256)

    await start()
    const started = server.sent(/^POST \/api\/minesweeper\/daily\/attempts$/)
    expect(started).toHaveLength(1)
    expect(started[0].body).toBeUndefined()
    // Rows 8–15: the opening and its border, as the server uncovered them.
    expect(cells().filter((button) => !/: (hidden|flagged)$/.test(button.getAttribute('aria-label') ?? ''))).toHaveLength(128)
    expect(labelOf(8 * 16)).toMatch(/: 2 nearby$/)
    expect(isCovered(LONE_TWO)).toBe(true)
    expect(screen.queryByRole('heading', { name: "Today's board is ready" })).not.toBeInTheDocument()
    expect(stat('Mines')).toBe('40')
    expect(stat('Moves')).toBe('0')
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('sends each reveal and flag, and shows the board the server answers with', async () => {
    const { server } = setup()
    await start()

    fireEvent.click(cellAt(LONE_TWO))
    await waitFor(() => expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/))
    expect(reveals(server).map(({ body }) => body)).toEqual([{ cell: LONE_TWO }])
    expect(stat('Moves')).toBe('1')

    fireEvent.contextMenu(cellAt(80))
    await waitFor(() => expect(labelOf(80)).toMatch(/: flagged$/))
    expect(flags(server).map(({ body }) => body)).toEqual([{ cell: 80, flagged: true }])
    expect(stat('Mines')).toBe('39')

    // A flagged cell is not revealed, and an uncovered one asks for nothing.
    fireEvent.click(cellAt(80))
    fireEvent.click(cellAt(START_CELL))
    fireEvent.contextMenu(cellAt(START_CELL))
    expect(reveals(server)).toHaveLength(1)
    expect(flags(server)).toHaveLength(1)

    fireEvent.contextMenu(cellAt(80))
    await waitFor(() => expect(labelOf(80)).toMatch(/: hidden$/))
    expect(flags(server).map(({ body }) => body)).toEqual([
      { cell: 80, flagged: true },
      { cell: 80, flagged: false },
    ])
  })

  it('takes taps with the Flag tool, and the keyboard', async () => {
    const { server } = setup()
    await start()

    fireEvent.click(tapTool('Flag'))
    fireEvent.click(cellAt(81))
    await waitFor(() => expect(labelOf(81)).toMatch(/: flagged$/))
    fireEvent.click(tapTool('Reveal'))

    fireEvent.keyDown(cellAt(LONE_TWO), { key: 'Enter' })
    await waitFor(() => expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/))
    fireEvent.keyDown(cellAt(82), { key: 'f' })
    await waitFor(() => expect(labelOf(82)).toMatch(/: flagged$/))

    expect(flags(server).map(({ body }) => body)).toEqual([
      { cell: 81, flagged: true },
      { cell: 82, flagged: true },
    ])
    expect(reveals(server).map(({ body }) => body)).toEqual([{ cell: LONE_TWO }])
  })

  it('sends one move at a time, and guesses nothing while the server is slow', async () => {
    const { server } = setup()
    await start()
    const release = server.hold(/\/reveal$/)

    fireEvent.click(cellAt(LONE_TWO))
    fireEvent.click(cellAt(LONE_TWO))
    fireEvent.click(cellAt(97))
    fireEvent.contextMenu(cellAt(80))
    await waitFor(() => expect(reveals(server)).toHaveLength(1))
    expect(grid().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')

    // Still unanswered: the player is told, and the cell stays as the server last showed it.
    expect(await screen.findByText('Waiting for the server…', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(isCovered(LONE_TWO)).toBe(true)
    // The other clicks were never sent.
    expect(reveals(server)).toHaveLength(1)
    expect(flags(server)).toHaveLength(0)

    act(release)
    await waitFor(() => expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/))
    expect(screen.queryByText('Waiting for the server…')).not.toBeInTheDocument()
    expect(grid().closest('[aria-busy]')).toBeNull()
    // Answered: the next move goes.
    fireEvent.contextMenu(cellAt(80))
    await waitFor(() => expect(flags(server)).toHaveLength(1))
  })

  it('can send a move again after it fails to get through', async () => {
    const { server } = setup()
    await start()
    server.failNext(/\/reveal$/, 'network')

    fireEvent.click(cellAt(LONE_TWO))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server. Check your connection and try again.")
    expect(isCovered(LONE_TWO)).toBe(true)

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/))
    expect(reveals(server).map(({ body }) => body)).toEqual([{ cell: LONE_TWO }, { cell: LONE_TWO }])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says when the server fails, and starting again after that works', async () => {
    const { server } = setup()
    server.failNext(/^POST \/api\/minesweeper\/daily\/attempts$/, 503)
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("The server couldn't take that just now.")
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }))
    await opened()
    expect(server.sent(/^POST \/api\/minesweeper\/daily\/attempts$/)).toHaveLength(2)
  })

  it('picks up again after a reload, as the server has it', async () => {
    const { server, unmount } = setup()
    await start()
    fireEvent.click(cellAt(LONE_TWO))
    await waitFor(() => expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/))
    fireEvent.contextMenu(cellAt(80))
    await waitFor(() => expect(labelOf(80)).toMatch(/: flagged$/))

    unmount()
    show()
    await opened()
    expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/)
    expect(labelOf(80)).toMatch(/: flagged$/)
    expect(stat('Moves')).toBe('1')
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    expect(server.sent(/^POST \/api\/minesweeper\/daily\/attempts$/)).toHaveLength(1)
  })
})

describe('how an attempt ends', () => {
  it('cleared: the server’s time, and no second attempt that day', async () => {
    let now = Date.parse(`${DAY}T12:00:00Z`)
    const { server, unmount, onRewarded } = setup({ clock: () => now })
    await start()
    expect(onRewarded).not.toHaveBeenCalled()

    now += 83_450
    fireEvent.click(cellAt(WINNING_CELL))
    expect(await screen.findByRole('heading', { name: 'Board cleared!' })).toBeInTheDocument()
    // The platform is told once, so the header's coins and the player's XP are read again.
    expect(onRewarded).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/You cleared the Daily Board in 1:23\.45, as the server timed it\./)).toBeInTheDocument()
    expect(screen.getByText(/The next board comes out at 00:00 UTC, in 11:58:\d\d\./)).toBeInTheDocument()
    expect(stat('Time')).toBe('1:23.45')
    expect(screen.queryByRole('button', { name: /Start|Play today's board/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'What a tap does' })).not.toBeInTheDocument()
    expect(reward()).toBe('Earned: +10 XP +5 coins')

    // A move after the end is not sent.
    fireEvent.contextMenu(cellAt(A_MINE))
    expect(flags(server)).toHaveLength(0)

    expect(onRewarded).toHaveBeenCalledTimes(1)

    unmount()
    const reloaded = show()
    expect(await screen.findByRole('heading', { name: 'Board cleared!' })).toBeInTheDocument()
    expect(reward()).toBe('Earned: +10 XP +5 coins')
    // A win loaded from before is not new: nothing to read again.
    expect(reloaded.onRewarded).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    expect(server.sent(/^POST \/api\/minesweeper\/daily\/attempts$/)).toHaveLength(1)
  })

  it('cleared after the day’s paid games: the XP, and why no coins', async () => {
    setup({ winCoins: 0 })
    await start()
    fireEvent.click(cellAt(WINNING_CELL))
    expect(await screen.findByRole('heading', { name: 'Board cleared!' })).toBeInTheDocument()
    expect(reward()).toBe('Earned: +10 XP')
    expect(screen.getByText("No coins this time: today's paid games were used up already.")).toBeInTheDocument()
  })

  it('lost: only the mine that went off is shown', async () => {
    const { onRewarded } = setup()
    await start()
    fireEvent.click(cellAt(A_MINE))
    expect(await screen.findByRole('heading', { name: 'Boom!' })).toBeInTheDocument()
    expect(screen.getByText(`You hit a mine with 128 of ${SAFE_CELLS} safe squares uncovered. Only a cleared board ranks.`, { exact: false })).toBeInTheDocument()
    expect(labelOf(A_MINE)).toMatch(/: mine$/)
    // The server never sent the others: they stay covered.
    expect(cells().filter((button) => /: mine$/.test(button.getAttribute('aria-label') ?? ''))).toHaveLength(1)
    expect(isCovered(1)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    expect(reward()).toBeNull()
    expect(onRewarded).not.toHaveBeenCalled()
  })

  it('out of time, found on a move: the server’s board, without an error', async () => {
    const { server } = setup()
    await start()
    const [attempt] = server.sent(/^POST \/api\/minesweeper\/daily\/attempts$/)
    expect(attempt).toBeDefined()
    server.expire(server.begin())

    fireEvent.click(cellAt(LONE_TWO))
    expect(await screen.findByRole('heading', { name: "Time's up" })).toBeInTheDocument()
    expect(screen.getByText(/ran out of its time limit before the board was cleared, so it doesn't rank\./)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(isCovered(LONE_TWO)).toBe(true)
    expect(stat('Time')).toBe('16:39.99')
    expect(TIME_LIMIT_MS).toBe(999_999)
  })

  it('out of time by the clock: the server is asked how it ended', async () => {
    // Started long ago: its limit is moments away.
    const { server } = setup({ before: (fake) => fake.begin('pixel', Date.parse(`${DAY}T12:00:00Z`) - TIME_LIMIT_MS + 1500) })
    await opened()
    expect(screen.queryByRole('heading', { name: "Time's up" })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: "Time's up" }, { timeout: 4000 })).toBeInTheDocument()
    expect(server.sent(/^GET \/api\/minesweeper\/daily\/attempts\/[^/]+$/).length).toBeGreaterThan(0)
  })
})

describe('the clock', () => {
  it('runs from the server’s start, by the server’s clock, whatever this device’s says', async () => {
    // The server is three hours ahead of this device, and the attempt began 65 s ago by its clock.
    setup({ clock: clockFrom(`${DAY}T15:00:00Z`), before: (fake) => fake.begin('pixel', Date.parse(`${DAY}T15:00:00Z`) - 65_000) })
    await opened()
    await waitFor(() => expect(stat('Time')).toMatch(/^1:0[5-9]\.\d\d$/))
    expect(screen.getByText(/^8:59:5\d$/)).toBeInTheDocument()
  })

  it('counts down to 00:00 UTC, then brings the next day’s board; an attempt from before goes on', async () => {
    const { server } = setup({ clock: clockFrom(`${DAY}T23:59:59.300Z`), before: (fake) => fake.begin() })
    await opened()
    expect(screen.getByRole('heading', { name: 'Daily Board #7' })).toBeInTheDocument()
    expect(screen.getByText('0:00:00')).toBeInTheDocument()

    // Past midnight: the new day is fetched, and the attempt started before it stays.
    await waitFor(() => expect(screen.getByText(/^23:59:5\d$/)).toBeInTheDocument(), { timeout: 4000 })
    expect(screen.getByRole('heading', { name: 'Daily Board #7' })).toBeInTheDocument()
    expect(screen.getByText('Sat 7 Nov 2026 (UTC)')).toBeInTheDocument()
    expect(screen.getByText(/Started before the reset/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()

    // It is still played, and counts for its own day.
    fireEvent.click(cellAt(WINNING_CELL))
    expect(await screen.findByRole('heading', { name: 'Board cleared!' })).toBeInTheDocument()
    expect(screen.getByText(/A new day's board is out\./)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: "Board #7's fastest" })).toBeInTheDocument()
    expect(server.sent(/leaderboard/).every(({ query }) => query.includes('date=2026-11-07'))).toBe(true)

    // Then the new day's attempt.
    fireEvent.click(screen.getByRole('button', { name: "Play today's board" }))
    expect(await screen.findByRole('heading', { name: 'Daily Board #8' })).toBeInTheDocument()
    await opened()
    expect(screen.getByText('Sun 8 Nov 2026 (UTC)')).toBeInTheDocument()
    await waitFor(() => expect(server.sent(/leaderboard/).at(-1)?.query).toContain('date=2026-11-08'))
    expect(await screen.findByRole('heading', { name: "Today's fastest" })).toBeInTheDocument()
  })
})

describe('the leaderboard', () => {
  const others = { [DAY]: [{ username: 'ada', displayName: 'Ada', elapsedMs: 61_000 }, { username: 'bo', displayName: 'Bo', elapsedMs: 120_500 }] }

  it('lists the day’s fastest first, and places the player once they clear it', async () => {
    let now = Date.parse(`${DAY}T12:00:00Z`)
    const { server } = setup({ clock: () => now, leaderboard: others })
    const list = () => screen.getByRole('list', { name: 'Daily Board #7 leaderboard' })

    expect(await screen.findByText('2 players have cleared it. Clear it to rank.')).toBeInTheDocument()
    expect(within(list()).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1Ada1:01.00', '2Bo2:00.50'])
    expect(server.sent(/leaderboard/)[0].query).toBe('?date=2026-11-07&page=0&size=10')

    await start()
    now += 83_450
    fireEvent.click(cellAt(WINNING_CELL))
    expect(await screen.findByText("You're #2 of 3, in 1:23.45.")).toBeInTheDocument()
    const items = within(list()).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['1Ada1:01.00', '2pixel (you)1:23.45', '3Bo2:00.50'])
    expect(items[1]).toHaveAttribute('aria-current', 'true')
  })

  it('says when nobody has cleared it, and when it could not be loaded', async () => {
    const { server } = setup()
    expect(await screen.findByText('Nobody has cleared this board yet.')).toBeInTheDocument()
    server.failNext(/leaderboard/, 'network')
    await start()
    fireEvent.click(cellAt(A_MINE))
    // The attempt's end brings the board again; this time it fails.
    expect(await screen.findByText(/Couldn't load the leaderboard\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Nobody has cleared this board yet.')).toBeInTheDocument()
  })
})

describe('on a phone and on a desktop', () => {
  /** Makes the board's frame this wide, as a browser's `ResizeObserver` would report it. */
  function frameWidth(width: number) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        report: ResizeObserverCallback
        constructor(report: ResizeObserverCallback) {
          this.report = report
        }
        observe(element: Element) {
          this.report([{ target: element, contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
        }
        unobserve() {}
        disconnect() {}
      },
    )
  }

  it.each([
    // A phone opens the board zoomed, to cells big enough for a finger; a desktop fits it.
    ['a phone', 343, 'zoom', 'Fit'],
    ['a desktop', 900, 'fit', 'Zoom'],
  ])('on %s, the 16 × 16 board opens as the other boards do, and switches, keeping the attempt', async (_, width, opening, other) => {
    frameWidth(width)
    setup()
    await start()
    const viewport = screen.getByTestId('minefield-viewport')
    const view = (name: string) => within(screen.getByRole('group', { name: 'Board view' })).getByRole('button', { name })
    expect(viewport).toHaveAttribute('data-view', opening)
    expect(grid()).toHaveAttribute('aria-rowcount', '16')
    expect(grid()).toHaveAttribute('aria-colcount', '16')

    fireEvent.click(view(other))
    expect(viewport).toHaveAttribute('data-view', other.toLowerCase())
    expect(labelOf(START_CELL)).toMatch(/: empty$/)
    fireEvent.click(cellAt(LONE_TWO))
    await waitFor(() => expect(labelOf(LONE_TWO)).toMatch(/: 2 nearby$/))

    fireEvent.click(view(opening === 'zoom' ? 'Zoom' : 'Fit'))
    expect(viewport).toHaveAttribute('data-view', opening)
    // The tap tool for touch screens, while the attempt is played.
    expect(screen.getByRole('group', { name: 'What a tap does' })).toBeInTheDocument()
  })
})

describe('the Daily Board’s code', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), 'src/games/minesweeper', path), 'utf8')
  const files = ['daily/dailyView.ts', 'hooks/useDailyBoard.ts', 'components/DailyBoard.tsx', 'api/minesweeperApi.ts', 'types/dailyTypes.ts']

  it.each(files)('%s does not use the game’s engine: the server decides every reveal', (file) => {
    expect(read(file)).not.toMatch(/from '[^']*engine[^']*'/)
    // Nothing here holds the day's secret or its mines; the shared board's unused seeds are zero.
    expect(read(file)).not.toMatch(/secret|mineCells|mine_cells/i)
    for (const line of read(file).match(/\b(?:seed|startSeed)\b\s*[:=].*/g) ?? []) expect(line).toMatch(/^(seed|startSeed): 0,$/)
  })
})
