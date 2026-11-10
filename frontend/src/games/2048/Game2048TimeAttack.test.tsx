import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { finishGameSession, startGameSession, type GameSessionResponse } from '@/api/gameSessions'
import { useScoreSubmission } from '@/hooks/useScoreSubmission'
import { aiActionDelay } from '@/games/shared/ai'
import type { GameProps } from '@/games/types'
import { createGame2048Ai, type Game2048AI } from './ai/game2048Ai'
import { TIME_ATTACK_MS, applyMove, createGame2048, legalMoves } from './engine/game2048Engine'
import Game2048 from './Game2048'
import type { Game2048State, Move } from './types/game2048Types'

// A fixed seed makes tile spawns, and therefore every AI decision in this file, repeatable.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 2048,
}))

// A test can stage the board; the rules (the clock) are the real ones, passed through.
let startingBoard: number[] | null = null

vi.mock('./engine/game2048Engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('./engine/game2048Engine')>()
  return {
    ...original,
    createGame2048: (seed: number, rules?: Parameters<typeof original.createGame2048>[1]): Game2048State => {
      const real = original.createGame2048(seed, rules)
      if (!startingBoard) return real
      return {
        ...real,
        board: startingBoard,
        tileIds: startingBoard.map((value, index) => (value === 0 ? 0 : index + 1)),
        nextTileId: 100,
      }
    },
  }
})

vi.mock('@/api/gameSessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/gameSessions')>()),
  startGameSession: vi.fn(),
  finishGameSession: vi.fn(),
}))

/**
 * 2048's Time Attack on its screen: two minutes of game time from the first valid move, counted down
 * between moves, frozen and hidden while paused (a hidden tab pauses it), reported once when the time
 * runs out or the board is stuck, never reported past its pause allowance; the AI plays it at 250 ms of
 * game time a move whatever its speed, and never reports a run.
 */

const ALL_MODES = ['classic', 'moves', 'time-attack']
const board = (...rows: number[][]) => rows.flat()
/** Packed to the left with nothing to merge: LEFT changes nothing, RIGHT does. */
const PACKED_LEFT = board([2, 4, 0, 0], [8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
/** One merge to make, with room to spare. */
const ONE_MERGE = board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
/** Nearly full, with few merges: stuck after a few moves. */
const CROWDED = board([0, 0, 16, 32], [64, 128, 256, 512], [8, 16, 32, 64], [128, 256, 512, 1024])
const KEYS: Record<Move, string> = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' }

const press = (key: string) => fireEvent.keyDown(window, { key })
/** The first button of that name: a paused run has Resume both in the sidebar and on the board. */
const click = (name: string) => fireEvent.click(screen.getAllByRole('button', { name })[0])
const statText = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? ''
const picker = () => screen.queryByRole('group', { name: 'Game mode' })
const choose = (name: string) => fireEvent.click(within(picker()!).getByRole('button', { name }))
const heading = (name: string | RegExp) => screen.queryByRole('heading', { name })
const hiddenBoard = () => screen.queryByRole('img', { name: 'Board hidden while paused' })
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))

/** The game time played, read from the screen (`m:ss.hh`). */
function playedMs() {
  const [minutes, rest] = statText('Played').split(':')
  return Math.round((Number(minutes) * 60 + Number(rest)) * 1000)
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function game(props: Partial<GameProps<Game2048AI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  const view = render(<Game2048 {...handlers} ai={createGame2048Ai} modes={ALL_MODES} {...props} />)
  return { ...handlers, ...view }
}

/** A Time Attack run under way: chosen, and started with a valid first move. */
function started(first = 'ArrowRight', props: Partial<GameProps<Game2048AI>> = {}) {
  startingBoard ??= PACKED_LEFT
  const view = game(props)
  choose('Time Attack')
  press(first)
  return view
}

beforeEach(() => {
  window.localStorage.clear()
  startingBoard = null
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (document as { hidden?: boolean }).hidden
})

describe('choosing Time Attack', () => {
  it('is offered after Classic and Moves Limit when the server declares it, with its two minutes', () => {
    game()
    const buttons = within(picker()!).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Classic', 'Moves Limit', 'Time Attack'])

    choose('Time Attack')
    expect(within(picker()!).getByRole('button', { name: 'Time Attack' })).toHaveAttribute('aria-pressed', 'true')
    expect(statText('Time left')).toBe('2:00')
    expect(statText('Played')).toBe('0:00.00')
    expect(statText('Pause left')).toBe('1:00')
    expect(screen.getByText(/Score as many points as you can in 2 minutes\./)).toBeInTheDocument()
  })

  it('is not offered while the server does not declare it, and a chosen one never falls back to Classic', () => {
    const view = game({ modes: ['classic', 'moves'] })
    expect(within(picker()!).queryByRole('button', { name: 'Time Attack' })).not.toBeInTheDocument()
    view.unmount()

    startingBoard = ONE_MERGE
    const declared = game()
    choose('Time Attack')
    declared.rerender(
      <Game2048 onGameStart={declared.onGameStart} onGameOver={declared.onGameOver} ai={createGame2048Ai} modes={['classic', 'moves']} />,
    )
    expect(heading('Time Attack unavailable')).toBeInTheDocument()
    press('ArrowLeft')
    tick(5000)
    expect(declared.onGameStart).not.toHaveBeenCalled()
    expect(statText('Played')).toBe('0:00.00')

    click('Play Classic')
    press('ArrowLeft')
    expect(declared.onGameStart).toHaveBeenCalledTimes(1)
    expect(declared.onGameStart).toHaveBeenCalledWith()
  })

  it('keeps Human or AI, and the AI speed, when the mode changes', () => {
    game()
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    choose('Time Attack')
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')
    choose('Classic')
    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('the clock', () => {
  it('starts only with the first valid move, under the Time Attack mode', () => {
    startingBoard = PACKED_LEFT
    const view = game()
    choose('Time Attack')

    press('ArrowLeft') // changes nothing
    tick(5000)
    expect(view.onGameStart).not.toHaveBeenCalled()
    expect(statText('Played')).toBe('0:00.00')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()

    press('ArrowRight')
    expect(view.onGameStart).toHaveBeenCalledTimes(1)
    expect(view.onGameStart).toHaveBeenCalledWith('time-attack')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
  })

  it('counts down between moves, while the player thinks', () => {
    started()
    tick(10_050)
    expect(playedMs()).toBeGreaterThanOrEqual(10_000)
    expect(playedMs()).toBeLessThanOrEqual(10_050)
    expect(statText('Time left')).toBe('1:50')
    tick(30_000)
    expect(statText('Time left')).toBe('1:20')
  })

  it('pausing hides the board and freezes game time; resuming carries on', () => {
    started()
    tick(5000)
    const before = playedMs()

    click('Pause')
    expect(hiddenBoard()).toBeInTheDocument()
    expect(heading('Paused')).toBeInTheDocument()
    tick(20_000)
    expect(playedMs()).toBe(before)
    expect(screen.getByText(/Pause time left/)).toHaveTextContent('Pause time left: 0:40')
    expect(statText('Pause left')).toBe('0:40')
    // No move is taken while paused.
    press('ArrowLeft')
    expect(hiddenBoard()).toBeInTheDocument()

    click('Resume')
    expect(hiddenBoard()).not.toBeInTheDocument()
    tick(1000)
    expect(playedMs()).toBeGreaterThan(before + 900)

    // The finished run still shows the allowance it had left, not a fresh one.
    tick(120_000)
    expect(heading(/Time's up!|New best!/)).toBeInTheDocument()
    expect(statText('Pause left')).toBe('0:40')
  })

  it('pauses itself when the tab is hidden, and stays paused until the player resumes', () => {
    started()
    tick(3000)
    const before = playedMs()

    setHidden(true)
    expect(heading('Paused')).toBeInTheDocument()
    expect(hiddenBoard()).toBeInTheDocument()
    tick(30_000)
    expect(playedMs()).toBe(before)

    setHidden(false)
    expect(heading('Paused')).toBeInTheDocument()
    expect(hiddenBoard()).toBeInTheDocument()
    tick(5000)
    expect(playedMs()).toBe(before)

    click('Resume')
    tick(2000)
    expect(playedMs()).toBeGreaterThan(before + 1900)
    expect(playedMs()).toBeLessThanOrEqual(before + 2000)
  })
})

describe('the end of a run', () => {
  it('a timeout between moves ends the run and reports it exactly once', () => {
    const view = started()
    tick(121_000)

    expect(heading(/Time's up!|New best!/)).toBeInTheDocument()
    expect(screen.getByText(/You scored 0 in 1 move, with a best tile of 8\./)).toBeInTheDocument()
    expect(statText('Time left')).toBe('0:00')
    expect(statText('Played')).toBe('2:00.00')
    expect(view.onGameOver).toHaveBeenCalledTimes(1)
    expect(view.onGameOver.mock.calls[0][0]).toMatchObject({
      score: 0,
      metadata: { highestTile: 8, moves: 1, gameMs: TIME_ATTACK_MS, timeUp: 1 },
    })

    // Nothing more: no move, no second report.
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) press(key)
    tick(10_000)
    expect(view.onGameOver).toHaveBeenCalledTimes(1)
    expect(within(picker()!).getByRole('button', { name: 'Classic' })).toBeEnabled()
  })

  it('a board stuck before the time is up ends the run and reports it, without the time up', () => {
    startingBoard = CROWDED
    // The moves to stuck, by the real engine on the same seed: the first legal one each time.
    let state = createGame2048(2048, { timeLimitMs: TIME_ATTACK_MS })
    const moves: Move[] = []
    while (state.status === 'playing') {
      const move = (['LEFT', 'UP', 'RIGHT', 'DOWN'] as const).find((m) => legalMoves(state.board).includes(m))!
      moves.push(move)
      state = applyMove(state, move)
    }
    expect(moves.length).toBeGreaterThan(1)

    const view = game()
    choose('Time Attack')
    press(KEYS[moves[0]])
    tick(2000)
    for (const move of moves.slice(1)) {
      press(KEYS[move])
      tick(100)
    }

    const result = heading(/No moves left|New best!/)
    expect(result).toBeInTheDocument()
    expect(result?.parentElement).toHaveTextContent(/Stuck with 1:5\d to go.*Only a run that lasts until the time is up earns the completion reward\./)
    expect(view.onGameOver).toHaveBeenCalledTimes(1)
    const reported = view.onGameOver.mock.calls[0][0] as { score: number; metadata: Record<string, number> }
    expect(reported.score).toBe(state.score)
    expect(reported.metadata).toMatchObject({ moves: moves.length, timeUp: 0 })
    expect(reported.metadata.gameMs).toBeGreaterThan(0)
    expect(reported.metadata.gameMs).toBeLessThan(TIME_ATTACK_MS)
    expect(reported.metadata.gameMs % 10).toBe(0)
    // The clock stops with the run.
    const final = playedMs()
    tick(5000)
    expect(playedMs()).toBe(final)
  })

  it('reaching 2048 does not stop the clock or ask to keep going', () => {
    startingBoard = board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const view = started('ArrowLeft')
    expect(heading('You made 2048!')).not.toBeInTheDocument()
    tick(3000)
    expect(playedMs()).toBeGreaterThan(2900)
    expect(view.onGameOver).not.toHaveBeenCalled()
  })

  it('a run paused for more than a minute in all is unranked and never reported', () => {
    const view = started()
    tick(1000)
    click('Pause')
    tick(50_000)
    expect(screen.getByRole('alert')).toHaveTextContent('Resume within 0:10 to keep this run ranked.')
    tick(11_000)
    expect(screen.getByRole('alert')).toHaveTextContent('This run is now unranked')
    expect(statText('Pause left')).toBe('Unranked')

    click('Resume')
    tick(121_000)
    expect(heading('Unranked run')).toBeInTheDocument()
    expect(view.onGameOver).not.toHaveBeenCalled()
  })

  it('is not reported when the player restarts before it ends', () => {
    const view = started()
    tick(5000)
    click('Restart')
    tick(130_000)
    expect(view.onGameOver).not.toHaveBeenCalled()
    expect(statText('Played')).toBe('0:00.00')
  })

  it('keeps a best of its own, apart from Classic and Moves Limit', () => {
    startingBoard = ONE_MERGE
    started('ArrowLeft')
    tick(121_000)

    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-time-attack')).toBe('4')
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048')).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-moves')).toBeNull()
    expect(statText('Best')).toBe('4')
    click('Play again')
    choose('Classic')
    expect(statText('Best')).toBe('0')
  })
})

describe('the AI', () => {
  /** The game time the AI has played after this many of its moves at this speed. */
  function aiPlayed(speed: '1x' | '8x', aiMoves: number) {
    const view = game()
    choose('Time Attack')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: speed }))
    tick(aiActionDelay(320, speed === '1x' ? 1 : 8) * aiMoves)
    const ms = playedMs()
    expect(view.onGameStart).not.toHaveBeenCalled()
    expect(view.onGameOver).not.toHaveBeenCalled()
    view.unmount()
    return ms
  }

  it('spends 250 ms of game time a move, whatever its playback speed', () => {
    expect(aiPlayed('1x', 20)).toBe(5000)
    expect(aiPlayed('8x', 20)).toBe(5000)
  })

  it('plays until the time is up after 480 moves, and never reports a run', () => {
    const view = game()
    choose('Time Attack')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))
    for (let i = 0; i < 25; i++) tick(1000)

    expect(heading("Time's up!")).toBeInTheDocument()
    expect(screen.getByText(/The AI scored .* in 480 moves/)).toBeInTheDocument()
    expect(statText('Played')).toBe('2:00.00')
    expect(view.onGameStart).not.toHaveBeenCalled()
    expect(view.onGameOver).not.toHaveBeenCalled()
    expect(startGameSession).not.toHaveBeenCalled()
    expect(finishGameSession).not.toHaveBeenCalled()
  })
})

describe('on the platform', () => {
  const session: GameSessionResponse = { id: 'session-1', gameSlug: '2048', startedAt: '2026-11-06T10:00:00Z', mode: 'time-attack' }

  /** The game with the platform's real score flow, which shows how the save stands. */
  function Platform() {
    const { submission, onGameStart, onGameOver, currentSession } = useScoreSubmission('2048')
    return (
      <>
        <Game2048 onGameStart={onGameStart} onGameOver={onGameOver} currentSession={currentSession} modes={ALL_MODES} />
        <p data-testid="submission">{submission.status === 'failed' ? `failed:${submission.reason}` : submission.status}</p>
      </>
    )
  }

  function platform() {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Platform />
      </QueryClientProvider>,
    )
    choose('Time Attack')
  }

  const flush = () => act(async () => {})
  const submission = () => screen.getByTestId('submission').textContent

  beforeEach(() => {
    vi.mocked(startGameSession).mockReset()
    vi.mocked(finishGameSession).mockReset()
  })

  it('starts the clock once the server has opened the run, then sends its details once', async () => {
    let open!: (value: GameSessionResponse) => void
    vi.mocked(startGameSession).mockReturnValue(new Promise((resolve) => (open = resolve)))
    vi.mocked(finishGameSession).mockResolvedValue({
      sessionId: 'session-1',
      gameSlug: '2048',
      score: 0,
      durationMs: 120_000,
      recordedAt: '2026-11-06T10:02:00Z',
      rewards: null,
    })
    startingBoard = PACKED_LEFT
    platform()
    press('ArrowRight')

    expect(startGameSession).toHaveBeenCalledWith('2048', 'time-attack')
    expect(heading('Starting…')).toBeInTheDocument()
    tick(3000)
    expect(statText('Played')).toBe('0:00.00')
    // No move is taken until the clock can run.
    press('ArrowLeft')

    await act(async () => open(session))
    expect(heading('Starting…')).not.toBeInTheDocument()
    tick(121_000)
    await flush()

    expect(finishGameSession).toHaveBeenCalledTimes(1)
    expect(finishGameSession).toHaveBeenCalledWith('session-1', 0, { highestTile: 8, moves: 1, gameMs: 120_000, timeUp: 1 })
    expect(submission()).toBe('saved')
  })

  it('a save the server refuses is reported as failed, never as saved', async () => {
    vi.mocked(startGameSession).mockResolvedValue(session)
    vi.mocked(finishGameSession).mockRejectedValue(new ApiError(400, 'SCORE_REJECTED', 'Score submission rejected.'))
    startingBoard = PACKED_LEFT
    platform()
    press('ArrowRight')
    await flush()
    tick(121_000)
    await flush()
    tick(10_000)
    await flush()

    expect(finishGameSession).toHaveBeenCalledTimes(1)
    expect(submission()).toBe('failed:rejected')
  })

  it('a save that cannot reach the server is reported as failed after its retries', async () => {
    vi.mocked(startGameSession).mockResolvedValue(session)
    vi.mocked(finishGameSession).mockRejectedValue(new TypeError('Failed to fetch'))
    startingBoard = PACKED_LEFT
    platform()
    press('ArrowRight')
    await flush()
    tick(121_000)
    for (let i = 0; i < 6; i++) {
      await flush()
      tick(1000)
    }
    await flush()

    expect(finishGameSession).toHaveBeenCalledTimes(3)
    expect(submission()).toBe('failed:error')
  })

  it('a run whose session could not be opened never starts its clock and sends nothing', async () => {
    vi.mocked(startGameSession).mockRejectedValue(new TypeError('Failed to fetch'))
    startingBoard = PACKED_LEFT
    platform()
    press('ArrowRight')
    await flush()

    expect(heading("Couldn't start the run")).toBeInTheDocument()
    tick(130_000)
    expect(statText('Played')).toBe('0:00.00')
    expect(finishGameSession).not.toHaveBeenCalled()
    click('Try again')
    expect(heading("Couldn't start the run")).not.toBeInTheDocument()
  })
})
