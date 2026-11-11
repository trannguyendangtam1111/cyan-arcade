import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps, RunSession } from '@/games/types'
import { BOARDS, TIMED_LIMIT_MS, neighbours, replayMines } from './engine/minesweeperEngine'
import MinesweeperGame from './MinesweeperGame'
import { createTimedSeed } from './modes'

// A fixed seed lays the same mines every game, so a test knows where they are.
const SEED = 4242
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => SEED,
}))

/** A timed game's seed: the same seed, below 2^31. */
const TIMED_SEED = SEED >>> 1
const ALL_MODES = ['classic', 'beginner', 'intermediate', 'expert']

const cells = () => screen.getAllByRole('gridcell')
const cell = (index: number) => cells()[index]
const hidden = (index: number) => cell(index).getAttribute('aria-label')?.endsWith('hidden') === true
const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
const modeButton = (name: string | RegExp) => within(screen.getByRole('group', { name: 'Game mode' })).getByRole('button', { name })

// The player's clock: performance.now, moved by hand, with the ticker's timeouts.
let now = 0
function advance(ms: number) {
  act(() => {
    now += ms
    vi.advanceTimersByTime(ms)
  })
}

function renderGame(props: Partial<GameProps> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  const view = render(
    <MemoryRouter>
      <MinesweeperGame {...handlers} modes={ALL_MODES} {...props} />
    </MemoryRouter>,
  )
  const rerender = (next: Partial<GameProps>) =>
    view.rerender(
      <MemoryRouter>
        <MinesweeperGame {...handlers} modes={ALL_MODES} {...props} {...next} />
      </MemoryRouter>,
    )
  return { ...handlers, rerender }
}

beforeEach(() => {
  window.localStorage.clear()
  now = 1_000
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})
afterEach(() => vi.useRealTimers())

describe('the mode picker', () => {
  it('offers Classic and only the races the server declares, Classic first and chosen', () => {
    renderGame({ modes: ['classic', 'beginner', 'expert'] })

    const group = screen.getByRole('group', { name: 'Game mode' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Classic', 'Beginner', 'Expert'])
    expect(modeButton('Classic')).toHaveAttribute('aria-pressed', 'true')
    expect(cells()).toHaveLength(81)
    expect(stat('Score')).toBe('0')
  })

  it('shows no picker when the server declares no race', () => {
    renderGame({ modes: ['classic'] })
    expect(screen.queryByRole('group', { name: 'Game mode' })).not.toBeInTheDocument()
    renderGame({ modes: undefined })
    expect(screen.queryAllByRole('group', { name: 'Game mode' })).toHaveLength(0)
  })

  it('sets up each race on its own board, in the responsive frame for the large ones', () => {
    renderGame()

    fireEvent.click(modeButton('Beginner'))
    expect(cells()).toHaveLength(81)
    expect(stat('Mines')).toBe('10')
    expect(screen.queryByTestId('minefield-viewport')).not.toBeInTheDocument()

    fireEvent.click(modeButton('Intermediate'))
    expect(cells()).toHaveLength(256)
    expect(stat('Mines')).toBe('40')
    expect(screen.getByRole('grid', { name: 'Minefield' })).toHaveAttribute('aria-colcount', '16')

    fireEvent.click(modeButton('Expert'))
    expect(cells()).toHaveLength(480)
    expect(stat('Mines')).toBe('99')
    expect(screen.getByRole('grid', { name: 'Minefield' })).toHaveAttribute('aria-rowcount', '16')
    expect(screen.getByRole('grid', { name: 'Minefield' })).toHaveAttribute('aria-colcount', '30')
    // MS-001b's frame: Fit and Zoom, which change the view and not the game.
    expect(screen.getByTestId('minefield-viewport')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: 'Board view' })).getByRole('button', { name: 'Zoom' }))
    expect(screen.getByTestId('minefield-viewport')).toHaveAttribute('data-view', 'zoom')
    expect(cells()).toHaveLength(480)
  })

  it('locks while a run is under way and opens again when it ends', () => {
    renderGame()
    fireEvent.click(modeButton('Beginner'))
    const first = 40
    const mine = replayMines(BOARDS.beginner, TIMED_SEED, first)[0]

    fireEvent.click(cell(first))
    expect(modeButton('Classic')).toBeDisabled()
    expect(modeButton('Expert')).toBeDisabled()
    expect(modeButton('Beginner')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('The mode can change once this run ends.')).toBeInTheDocument()

    fireEvent.click(cell(mine))
    expect(modeButton('Classic')).toBeEnabled()
    expect(modeButton('Expert')).toBeEnabled()
  })

  it('links each race to its own leaderboard', () => {
    renderGame()
    expect(screen.queryByRole('link', { name: /leaderboard/ })).not.toBeInTheDocument()
    for (const [name, mode] of [
      ['Beginner', 'beginner'],
      ['Intermediate', 'intermediate'],
      ['Expert', 'expert'],
    ]) {
      fireEvent.click(modeButton(name))
      expect(screen.getByRole('link', { name: `${name} leaderboard →` })).toHaveAttribute(
        'href',
        `/leaderboard?game=minesweeper&mode=${mode}`,
      )
    }
  })
})

describe('a race the server stops declaring', () => {
  it('shows as unavailable, starts no run and never turns into Classic', () => {
    const { onGameStart, onGameOver, rerender } = renderGame()
    fireEvent.click(modeButton('Intermediate'))

    rerender({ modes: ['classic', 'beginner'] })

    expect(screen.getByRole('heading', { name: 'Intermediate unavailable' })).toBeInTheDocument()
    expect(modeButton('Intermediate, unavailable')).toHaveAttribute('aria-pressed', 'true')
    expect(modeButton('Classic')).toHaveAttribute('aria-pressed', 'false')
    expect(cells()).toHaveLength(256)
    expect(screen.queryByText('Pick any square to start')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /leaderboard/ })).not.toBeInTheDocument()
    // Revealing does nothing: no run, no clock, no mines laid.
    fireEvent.click(cell(0))
    fireEvent.keyDown(cell(0), { key: 'Enter' })
    expect(onGameStart).not.toHaveBeenCalled()
    expect(hidden(0)).toBe(true)
    expect(onGameOver).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Play Classic' }))
    expect(modeButton('Classic')).toHaveAttribute('aria-pressed', 'true')
    expect(cells()).toHaveLength(81)
    expect(screen.queryByRole('button', { name: /Intermediate/ })).not.toBeInTheDocument()
  })
})

describe('a timed run', () => {
  it('lays a safe opening around the first square on every board', () => {
    renderGame()
    for (const [name, board, first] of [
      ['Beginner', 'beginner', 0],
      ['Intermediate', 'intermediate', 135],
      ['Expert', 'expert', 479],
    ] as const) {
      fireEvent.click(modeButton(name))
      expect(createTimedSeed()).toBe(TIMED_SEED)
      fireEvent.click(cell(first))
      const mines = new Set(replayMines(BOARDS[board], TIMED_SEED, first))
      const around = [first, ...neighbours(BOARDS[board], first)]
      expect(around.some((index) => mines.has(index))).toBe(false)
      for (const index of around) expect(cell(index)).not.toHaveAccessibleName(/: mine$/)
      expect(hidden(first)).toBe(false)
      // A new race on another board: the picker opens again once this run ends with a mine.
      fireEvent.click(cell([...mines][0]))
    }
  })

  it('starts its clock and its session only with the first valid reveal', () => {
    const { onGameStart } = renderGame()
    fireEvent.click(modeButton('Beginner'))
    expect(stat('Time')).toBe('0:00.00')
    expect(stat('Best')).toBe('–')

    // Waiting, and flags (there is nothing to flag before the mines are laid), start nothing.
    advance(5_000)
    fireEvent.contextMenu(cell(3))
    expect(onGameStart).not.toHaveBeenCalled()
    expect(stat('Time')).toBe('0:00.00')

    fireEvent.click(cell(40))
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('beginner')
    advance(1_500)
    expect(stat('Time')).toBe('0:01.50')

    // Further reveals belong to the same run.
    const safe = cells().findIndex((_, index) => hidden(index) && !replayMines(BOARDS.beginner, TIMED_SEED, 40).includes(index))
    fireEvent.click(cell(safe))
    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('keeps counting while the tab is hidden', () => {
    const { onGameOver } = renderGame()
    fireEvent.click(modeButton('Beginner'))
    fireEvent.click(cell(40))
    advance(2_000)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // A hidden tab may run no timer at all: the clock is read from performance.now, not counted in ticks.
    act(() => {
      now += 30_000
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    advance(50)
    expect(stat('Time')).toBe('0:32.05')

    // Still one run: clear the rest of the board.
    const mines = new Set(replayMines(BOARDS.beginner, TIMED_SEED, 40))
    for (let index = 0; index < 81; index++) if (!mines.has(index) && hidden(index)) fireEvent.click(cell(index))
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0].score).toBe(32_050)
  })

  it('submits a cleared board as its game time with the details the server checks', () => {
    const { onGameOver } = renderGame()
    fireEvent.click(modeButton('Intermediate'))
    const first = 135
    const mines = replayMines(BOARDS.intermediate, TIMED_SEED, first)

    fireEvent.click(cell(first))
    // Two flags on mines, then one taken off again.
    fireEvent.contextMenu(cell(mines[0]))
    fireEvent.contextMenu(cell(mines[1]))
    fireEvent.contextMenu(cell(mines[1]))
    advance(45_000)
    act(() => {
      now += 678
    })
    let moves = 1
    for (let index = 0; index < 256; index++) {
      if (mines.includes(index) || !hidden(index)) continue
      fireEvent.click(cell(index))
      moves++
    }

    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 45_678,
        metadata: {
          rows: 16,
          columns: 16,
          mines: 40,
          seed: TIMED_SEED,
          firstCell: first,
          revealedCells: 216,
          flagsUsed: 1,
          won: 1,
          moves,
          gameMs: 45_678,
        },
      }),
    )
    expect(screen.getByRole('heading', { name: 'New best!' })).toBeInTheDocument()
    expect(screen.getByText('You cleared Intermediate in 0:45.67. Your fastest on this device yet.')).toBeInTheDocument()
    expect(stat('Time')).toBe('0:45.67')
    expect(stat('Best')).toBe('0:45.67')
  })

  it('submits nothing for a loss', () => {
    const { onGameStart, onGameOver } = renderGame()
    fireEvent.click(modeButton('Expert'))
    const first = 200
    fireEvent.click(cell(first))
    advance(3_000)
    fireEvent.click(cell(replayMines(BOARDS.expert, TIMED_SEED, first)[0]))

    expect(onGameStart).toHaveBeenCalledWith('expert')
    expect(onGameOver).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Boom!' })).toBeInTheDocument()
    expect(screen.getByText(/Only a cleared board is saved\./)).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:minesweeper-expert')).toBeNull()
  })

  it('times out at the limit and submits nothing, even for a board cleared after it', () => {
    const { onGameOver } = renderGame()
    fireEvent.click(modeButton('Beginner'))
    fireEvent.click(cell(40))
    advance(TIMED_LIMIT_MS + 100)

    expect(screen.getByRole('heading', { name: "Time's up" })).toBeInTheDocument()
    expect(stat('Time')).toBe('16:39.99')
    // The board takes no more input.
    const mines = new Set(replayMines(BOARDS.beginner, TIMED_SEED, 40))
    const safe = cells().findIndex((_, index) => hidden(index) && !mines.has(index))
    fireEvent.click(cell(safe))
    expect(hidden(safe)).toBe(true)
    expect(onGameOver).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(stat('Time')).toBe('0:00.00')
    expect(screen.getByText('Pick any square to start')).toBeInTheDocument()
  })

  it('keeps a best time for each mode on this device, the lowest winning', () => {
    window.localStorage.setItem('cyan-arcade:high-score:minesweeper-beginner', '20000')
    window.localStorage.setItem('cyan-arcade:high-score:minesweeper', '1500')
    renderGame()
    fireEvent.click(modeButton('Beginner'))
    expect(stat('Best')).toBe('0:20.00')

    // Slower than the best: no new best.
    fireEvent.click(cell(40))
    act(() => {
      now += 30_000
    })
    clearRest('beginner', 40)
    expect(screen.getByRole('heading', { name: 'Board cleared!' })).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:minesweeper-beginner')).toBe('20000')

    // Faster: the new best.
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    fireEvent.click(cell(40))
    act(() => {
      now += 12_345
    })
    clearRest('beginner', 40)
    expect(screen.getByRole('heading', { name: 'New best!' })).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:minesweeper-beginner')).toBe('12345')
    expect(stat('Best')).toBe('0:12.34')

    // Every other mode keeps its own: Classic's points untouched, Expert none yet.
    expect(window.localStorage.getItem('cyan-arcade:high-score:minesweeper')).toBe('1500')
    fireEvent.click(modeButton('Expert'))
    expect(stat('Best')).toBe('–')
    fireEvent.click(modeButton('Classic'))
    expect(stat('Best')).toBe('1500')
  })

  it('plays with the keyboard as on Classic: Enter reveals, F flags', () => {
    const { onGameStart } = renderGame()
    fireEvent.click(modeButton('Intermediate'))
    const grid = screen.getByRole('grid', { name: 'Minefield' })
    const start = within(grid).getAllByRole('gridcell').find((button) => button.tabIndex === 0)!
    fireEvent.keyDown(start, { key: 'Enter' })
    expect(onGameStart).toHaveBeenCalledWith('intermediate')
    expect(hidden(0)).toBe(false)
  })
})

describe('Classic beside the races', () => {
  it('is still the points game: no mode named, scored by seconds', () => {
    const { onGameStart, onGameOver } = renderGame()
    const first = 40
    const mines = replayMines(BOARDS.beginner, SEED, first)

    fireEvent.click(cell(first))
    expect(onGameStart).toHaveBeenCalledWith()
    act(() => {
      now += 90_400
    })
    fireEvent.click(cell(mines[0]))

    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(Object.keys(metadata).sort()).toEqual(['columns', 'flagsUsed', 'mines', 'moves', 'revealedCells', 'rows', 'seconds', 'won'])
    expect(metadata.seconds).toBe(90)
    expect(score).toBe(metadata.revealedCells * 10)
    expect(stat('Time')).toBe('1:30')
  })
})

/** A session start the test answers when it chooses: as the server would, after a delay, or not at all. */
function sessionStart() {
  let resolve!: () => void
  let reject!: () => void
  const promise = new Promise<RunSession>((ok, fail) => {
    resolve = () => ok({ id: 'session-1' })
    reject = () => fail(new Error('the server could not open the session'))
  })
  const settled = promise.then(
    () => undefined,
    () => undefined,
  )
  return {
    promise,
    /** The server opens the session now. */
    open: () =>
      act(async () => {
        resolve()
        await settled
      }),
    /** The server refuses the session, or cannot be reached. */
    fail: () =>
      act(async () => {
        reject()
        await settled
      }),
  }
}

/** A platform whose sessions open one after the other, each when the test says. */
function platformSessions(...starts: ReturnType<typeof sessionStart>[]) {
  const queue = [...starts]
  return vi.fn(() => queue.shift()?.promise)
}

const coveredCells = () => cells().filter((_, index) => hidden(index)).length

describe("a race's session start", () => {
  it('uncovers the first square and starts the clock as soon as the server opens the session', async () => {
    const start = sessionStart()
    const currentSession = platformSessions(start)
    const { onGameStart } = renderGame({ currentSession })
    fireEvent.click(modeButton('Beginner'))

    fireEvent.click(cell(40))
    expect(onGameStart).toHaveBeenCalledExactlyOnceWith('beginner')
    expect(currentSession).toHaveBeenCalledTimes(1)
    await start.open()

    expect(hidden(40)).toBe(false)
    expect(stat('Time')).toBe('0:00.00')
    advance(1_250)
    expect(stat('Time')).toBe('0:01.25')
  })

  it('waits for a slow session: no square, no clock and no second session until it opens', async () => {
    const start = sessionStart()
    const currentSession = platformSessions(start)
    const { onGameStart, onGameOver } = renderGame({ currentSession })
    fireEvent.click(modeButton('Beginner'))
    const first = 40

    fireEvent.click(cell(first))
    expect(screen.getByRole('status')).toHaveTextContent('Starting the race…')
    expect(modeButton('Classic')).toBeDisabled()
    // 3.5 s of waiting, with impatient clicks, a key and a flag: nothing is played or counted.
    advance(3_500)
    fireEvent.click(cell(first))
    fireEvent.click(cell(0))
    fireEvent.keyDown(cell(0), { key: 'Enter' })
    fireEvent.contextMenu(cell(1))
    expect(coveredCells()).toBe(81)
    expect(stat('Time')).toBe('0:00.00')
    expect(stat('Mines')).toBe('10')
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(currentSession).toHaveBeenCalledTimes(1)

    // Open: the square the player picked is uncovered once, and the clock starts from here.
    await start.open()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(hidden(first)).toBe(false)
    expect(hidden(0)).toBe(true)
    expect(stat('Time')).toBe('0:00.00')

    act(() => {
      now += 4_321
    })
    clearRest('beginner', first)
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { score, metadata } = onGameOver.mock.calls[0][0]
    // Game time from the session's opening: the 3.5 s spent waiting are not in it.
    expect(score).toBe(4_321)
    expect(metadata).toMatchObject({ gameMs: 4_321, firstCell: first, seed: TIMED_SEED, won: 1 })
    expect(stat('Time')).toBe('0:04.32')
  })

  it('plays nothing when the session cannot be opened, and starts afresh with a new session', async () => {
    const refused = sessionStart()
    const retried = sessionStart()
    const currentSession = platformSessions(refused, retried)
    const { onGameStart, onGameOver } = renderGame({ currentSession })
    fireEvent.click(modeButton('Expert'))

    fireEvent.click(cell(200))
    advance(2_000)
    await refused.fail()

    expect(screen.getByRole('heading', { name: "Couldn't start the race" })).toBeInTheDocument()
    expect(screen.queryByText('Starting the race…')).not.toBeInTheDocument()
    expect(coveredCells()).toBe(480)
    expect(stat('Time')).toBe('0:00.00')
    // Not an unranked run: the board takes no input, and the mode is free again.
    fireEvent.click(cell(200))
    expect(coveredCells()).toBe(480)
    expect(modeButton('Classic')).toBeEnabled()
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Pick any square to start')).toBeInTheDocument()
    fireEvent.click(cell(200))
    expect(onGameStart).toHaveBeenCalledTimes(2)
    expect(onGameStart).toHaveBeenLastCalledWith('expert')
    await retried.open()
    expect(hidden(200)).toBe(false)
  })

  it('ignores the answer for a race restarted while it was opening', async () => {
    const abandoned = sessionStart()
    const currentSession = platformSessions(abandoned)
    const { onGameOver } = renderGame({ currentSession })
    fireEvent.click(modeButton('Beginner'))

    fireEvent.click(cell(40))
    fireEvent.click(screen.getByRole('button', { name: /Restart/ }))
    await abandoned.open()

    expect(coveredCells()).toBe(81)
    expect(stat('Time')).toBe('0:00.00')
    expect(screen.getByText('Pick any square to start')).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('still sends nothing for a loss or a timeout, counted from the opening', async () => {
    const lost = sessionStart()
    const timedOut = sessionStart()
    const currentSession = platformSessions(lost, timedOut)
    const { onGameOver } = renderGame({ currentSession })
    fireEvent.click(modeButton('Beginner'))

    fireEvent.click(cell(40))
    advance(3_500)
    await lost.open()
    advance(1_000)
    fireEvent.click(cell(replayMines(BOARDS.beginner, TIMED_SEED, 40)[0]))
    expect(screen.getByRole('heading', { name: 'Boom!' })).toBeInTheDocument()
    expect(stat('Time')).toBe('0:01.00')

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    fireEvent.click(cell(40))
    advance(3_500)
    await timedOut.open()
    advance(TIMED_LIMIT_MS - 1_000)
    expect(screen.queryByRole('heading', { name: "Time's up" })).not.toBeInTheDocument()
    advance(1_100)
    expect(screen.getByRole('heading', { name: "Time's up" })).toBeInTheDocument()
    expect(stat('Time')).toBe('16:39.99')
    expect(onGameOver).not.toHaveBeenCalled()
  })

})

describe("Classic's session start", () => {
  /** Clears the rest of a Classic board opened at `first`; returns the reveals it took. */
  function clearClassic(first: number) {
    const mines = new Set(replayMines(BOARDS.beginner, SEED, first))
    let reveals = 0
    for (let index = 0; index < 81; index++) {
      if (mines.has(index) || !hidden(index)) continue
      fireEvent.click(cell(index))
      reveals++
    }
    return reveals
  }

  it('uncovers the first square and starts the clock as soon as the server opens the session', async () => {
    const start = sessionStart()
    const currentSession = platformSessions(start)
    const { onGameStart } = renderGame({ currentSession })

    fireEvent.click(cell(40))
    expect(onGameStart).toHaveBeenCalledExactlyOnceWith()
    expect(currentSession).toHaveBeenCalledTimes(1)
    expect(hidden(40)).toBe(true)
    await start.open()

    expect(hidden(40)).toBe(false)
    expect(stat('Time')).toBe('0:00')
    advance(1_000)
    expect(stat('Time')).toBe('0:01')
  })

  it('waits for a slow session, then scores the win on the time from the opening, as before', async () => {
    const start = sessionStart()
    const currentSession = platformSessions(start)
    const { onGameStart, onGameOver } = renderGame({ currentSession })
    const first = 40

    fireEvent.click(cell(first))
    expect(screen.getByRole('status')).toHaveTextContent('Starting the game…')
    expect(modeButton('Beginner')).toBeDisabled()
    // 3.5 s of waiting, with impatient clicks, keys and a flag: nothing is played, counted or scored.
    advance(3_500)
    fireEvent.click(cell(first))
    fireEvent.click(cell(0))
    fireEvent.keyDown(cell(0), { key: 'Enter' })
    fireEvent.keyDown(cell(0), { key: ' ' })
    fireEvent.keyDown(cell(0), { key: 'f' })
    fireEvent.contextMenu(cell(1))
    expect(coveredCells()).toBe(81)
    expect(stat('Time')).toBe('0:00')
    expect(stat('Score')).toBe('0')
    expect(stat('Mines')).toBe('10')
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(currentSession).toHaveBeenCalledTimes(1)

    await start.open()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(hidden(first)).toBe(false)
    expect(hidden(0)).toBe(true)
    expect(stat('Time')).toBe('0:00')

    act(() => {
      now += 42_000
    })
    const reveals = clearClassic(first)
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { score, metadata } = onGameOver.mock.calls[0][0]
    // Classic's own details and formula: 10 a safe cell, 500 for the clear, 600 − seconds. The 3.5 s
    // spent waiting are not in the seconds.
    expect(metadata).toEqual({ rows: 9, columns: 9, mines: 10, revealedCells: 71, flagsUsed: 0, won: 1, moves: reveals + 1, seconds: 42 })
    expect(score).toBe(71 * 10 + 500 + (600 - 42))
    expect(screen.getByRole('heading', { name: 'New best!' })).toBeInTheDocument()
    expect(stat('Time')).toBe('0:42')
  })

  it('plays nothing when the session cannot be opened, and starts afresh with a new session', async () => {
    const refused = sessionStart()
    const retried = sessionStart()
    const currentSession = platformSessions(refused, retried)
    const { onGameStart, onGameOver } = renderGame({ currentSession })

    fireEvent.click(cell(40))
    advance(2_000)
    await refused.fail()

    expect(screen.getByRole('heading', { name: "Couldn't start the game" })).toBeInTheDocument()
    expect(screen.getByText(/didn't open this Classic run/)).toBeInTheDocument()
    expect(coveredCells()).toBe(81)
    expect(stat('Time')).toBe('0:00')
    fireEvent.click(cell(40))
    expect(coveredCells()).toBe(81)
    expect(modeButton('Beginner')).toBeEnabled()
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Pick any square to start')).toBeInTheDocument()
    fireEvent.click(cell(40))
    expect(onGameStart).toHaveBeenCalledTimes(2)
    expect(onGameStart).toHaveBeenLastCalledWith()
    await retried.open()
    expect(hidden(40)).toBe(false)
  })

  it('ignores the answer for a game restarted while it was opening', async () => {
    const abandoned = sessionStart()
    const currentSession = platformSessions(abandoned)
    const { onGameOver } = renderGame({ currentSession })

    fireEvent.click(cell(40))
    fireEvent.click(screen.getByRole('button', { name: /Restart/ }))
    await abandoned.open()

    expect(coveredCells()).toBe(81)
    expect(stat('Time')).toBe('0:00')
    expect(screen.getByText('Pick any square to start')).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('still reports a loss with its points, timed from the opening', async () => {
    const start = sessionStart()
    const { onGameOver } = renderGame({ currentSession: platformSessions(start) })
    const first = 40

    fireEvent.click(cell(first))
    advance(3_500)
    await start.open()
    act(() => {
      now += 7_250
    })
    fireEvent.click(cell(replayMines(BOARDS.beginner, SEED, first)[0]))

    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(metadata).toMatchObject({ won: 0, seconds: 7, moves: 2 })
    expect(score).toBe(metadata.revealedCells * 10)
    expect(screen.getByRole('heading', { name: 'Boom!' })).toBeInTheDocument()
  })
})

/** Clears the rest of a board already opened at `first`. */
function clearRest(board: keyof typeof BOARDS, first: number) {
  const mines = new Set(replayMines(BOARDS[board], TIMED_SEED, first))
  for (let index = 0; index < cells().length; index++) if (!mines.has(index) && hidden(index)) fireEvent.click(cell(index))
}
