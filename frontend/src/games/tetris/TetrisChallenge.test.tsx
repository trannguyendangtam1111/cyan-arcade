import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps, GameResult } from '@/games/types'
import { formatGameTime } from '@/lib/format'
import { createTetrisAi, type TetrisAI } from './ai/tetrisAi'
import { PROGRESS_KEY } from './challengeProgress'
import TetrisGame from './TetrisGame'
import type { Cell, TetrisState } from './types/tetrisTypes'

// The same pieces in every Classic, Ultra and Sprint game, so runs can be compared.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 42,
}))

/**
 * A real stage takes dozens of pieces to clear, more than a test can place by hand: while
 * `nearClear.on`, a new stage starts one clear from its objective. Its bottom row is garbage but for
 * a gap under a flat I, and the rest of its garbage is gone (a dig stage) or its lines are one short
 * of the goal (a line stage), so a hard drop clears it. With `nearClear.limitMs`, the stage's clock
 * ends sooner than its real limit (pinned in `tetrisChallenge.test.ts`). Every other game is the
 * real one.
 */
const nearClear = vi.hoisted(() => ({ on: false, limitMs: null as number | null }))
vi.mock('./engine/tetrisEngine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('./engine/tetrisEngine')>()
  const oneClearShort = (state: TetrisState): TetrisState => {
    const challenge = state.challenge!
    return {
      ...state,
      board: state.board.map((_, index): Cell => {
        const x = index % engine.WIDTH
        const y = Math.floor(index / engine.WIDTH)
        return y === engine.HEIGHT - 1 && (x < 3 || x > 6) ? 'G' : null
      }),
      lines: challenge.dig ? 0 : state.clock!.lineGoal! - 1,
      challenge: { ...challenge, garbageCleared: challenge.garbageAdded - 1 },
      piece: { type: 'I', rotation: 0, x: 3, y: -1 },
    }
  }
  return {
    ...engine,
    createTetrisGame: (...args: Parameters<typeof engine.createTetrisGame>) => {
      let state = engine.createTetrisGame(...args)
      if (!state.challenge || !state.clock) return state
      if (nearClear.limitMs !== null) state = { ...state, clock: { ...state.clock, limitMs: nearClear.limitMs } }
      return nearClear.on ? oneClearShort(state) : state
    },
  }
})

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const picker = () => screen.queryByRole('group', { name: 'Game mode' })
const stagePicker = () => screen.getByRole('group', { name: 'Challenge stage' })
const stageButton = (name: string | RegExp) => within(stagePicker()).getByRole('button', { name })
const stat = (label: string) => screen.getByText(label).parentElement?.textContent?.replace(label, '')
const heading = (name: string | RegExp) => screen.getByRole('heading', { name })

const STAGE_MODES = ['challenge-1', 'challenge-2', 'challenge-3', 'challenge-4', 'challenge-5', 'challenge-6']
const ALL_MODES = ['classic', 'ultra', 'sprint', ...STAGE_MODES]
const STAGE_NAMES = ['Clean-up', 'Ten on top', 'Deep dig', 'Rising tide', 'Pressure', 'Last stand']

/** The props of the game rendered last, so a test can play the platform's part. */
let rendered: { onGameStart: ReturnType<typeof vi.fn>; onGameOver: ReturnType<typeof vi.fn<(result: GameResult) => void>> }

function renderTetris(modes: readonly string[] = ALL_MODES, ai?: GameProps<TetrisAI>['ai']) {
  const props = { onGameStart: vi.fn(), onGameOver: vi.fn<(result: GameResult) => void>() }
  rendered = props
  const view = render(<TetrisGame {...props} modes={modes} ai={ai} />)
  return { ...props, view }
}

/** Which stages the picker shows open: their ids. */
const openStages = () =>
  within(stagePicker())
    .getAllByRole('button')
    .filter((button) => !(button as HTMLButtonElement).disabled)
    .map((button) => Number(button.textContent))

/** Hard-drops pieces until the stack tops out. */
function topOut() {
  for (let piece = 0; piece < 60 && screen.queryByRole('button', { name: 'Play again' }) === null; piece++) press(' ')
}

/** The platform's answer to the last run reported: the server has recorded it. */
const confirmSaved = () => act(() => rendered.onGameOver.mock.lastCall?.[0].onSaved?.())

/**
 * Starts the stage chosen (one clear short, with `nearClear.on` set before it was chosen), plays `ms`
 * of it, then makes the clear; with `saved`, the platform then confirms it was recorded.
 */
function clearStageAfter(ms: number, { saved = true } = {}) {
  click('Start')
  advance(ms)
  press(' ')
  if (saved) confirmSaved()
}

beforeEach(() => {
  nearClear.on = false
  nearClear.limitMs = null
  window.localStorage.clear()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('choosing Challenge', () => {
  it('is offered only while the server declares its stages, after Classic, Ultra and Sprint', () => {
    const offered = (modes: readonly string[]) => {
      const { view } = renderTetris(modes)
      const choices = within(picker()!).getAllByRole('button').map((choice) => choice.textContent)
      view.unmount()
      return choices
    }
    expect(offered(ALL_MODES)).toEqual(['Classic', 'Ultra', 'Sprint', 'Challenge'])
    expect(offered(['classic', 'ultra', 'sprint'])).toEqual(['Classic', 'Ultra', 'Sprint'])
    expect(offered(['classic', ...STAGE_MODES])).toEqual(['Classic', 'Challenge'])
  })

  it('shows six stages, only the first open, and says progress stays on this device', () => {
    renderTetris()
    click('Challenge')

    const buttons = within(stagePicker()).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      STAGE_NAMES.map((name, index) => `Stage ${index + 1}: ${name}${index > 0 ? ', locked' : ''}`),
    )
    expect(openStages()).toEqual([1])
    expect(stageButton('Stage 1: Clean-up')).toHaveAttribute('aria-pressed', 'true')
    expect(stageButton('Stage 2: Ten on top, locked')).toHaveAttribute('title', 'Clear stage 1 to open it')
    expect(screen.getByText('Progress and best times are saved on this device only.')).toBeInTheDocument()

    // A locked stage cannot be chosen.
    fireEvent.click(stageButton('Stage 3: Deep dig, locked'))
    expect(stageButton('Stage 1: Clean-up')).toHaveAttribute('aria-pressed', 'true')
  })

  it("starts stage 1 under its own mode, showing its objective, garbage, time and pause allowance", () => {
    const { onGameStart } = renderTetris()
    click('Challenge')

    expect(screen.getByText('Stage 1, Clean-up: Clear all the garbage within 2:00. Press Enter or tap Start.')).toBeInTheDocument()
    expect(stat('Stage')).toBe('1/6')
    expect(stat('Garbage left')).toBe('4')
    expect(stat('Time left')).toBe('2:00')
    expect(stat('Pause left')).toBe('1:00')
    expect(screen.queryByText('Score')).not.toBeInTheDocument()

    click('Start')
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('challenge-1')
    expect(picker()).not.toBeInTheDocument()
    advance(2_100)
    expect(stat('Time left')).toBe('1:58')
  })

  it("shows a line stage's goal and its rising garbage", () => {
    window.localStorage.setItem(PROGRESS_KEY, '3')
    renderTetris()
    click('Challenge')

    // The furthest open stage is chosen first.
    expect(stageButton('Stage 4: Rising tide')).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByText('Stage 4, Rising tide: Clear 15 lines within 3:00. A garbage row rises every 10 pieces. Press Enter or tap Start.'),
    ).toBeInTheDocument()
    expect(stat('Lines')).toBe('0/15')
    expect(screen.queryByText('Garbage left')).not.toBeInTheDocument()
  })
})

describe('a cleared stage', () => {
  it('stops at the clear and reports its game time, with the lines, pieces and garbage cleared', () => {
    const { onGameOver } = renderTetris()
    nearClear.on = true
    click('Challenge')
    clearStageAfter(2_000)

    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(metadata).toEqual({ lines: 1, pieces: 1, gameMs: score, garbage: 4 })
    expect(score % 40).toBe(0)
    expect(score).toBeGreaterThan(1_800)
    expect(score).toBeLessThanOrEqual(2_000)
    expect(heading('Stage cleared!')).toBeInTheDocument()
    expect(
      screen.getByText(`You cleared stage 1 in ${formatGameTime(score)}. Your fastest yet. Stage 2 is open.`),
    ).toBeInTheDocument()
    expect(stat('Garbage left')).toBe('0')

    // The clock stopped with the clear.
    const left = stat('Time left')
    advance(5_000)
    expect(stat('Time left')).toBe(left)
  })

  it("reports a line stage's goal as its lines", () => {
    window.localStorage.setItem(PROGRESS_KEY, '1')
    const { onGameStart, onGameOver } = renderTetris()
    nearClear.on = true
    click('Challenge')
    expect(stageButton('Stage 2: Ten on top')).toHaveAttribute('aria-pressed', 'true')
    clearStageAfter(1_000)

    expect(onGameStart).toHaveBeenCalledWith('challenge-2')
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(metadata).toEqual({ lines: 10, pieces: 1, gameMs: score, garbage: 6 })
    expect(stat('Lines')).toBe('10/10')
    expect(screen.getByText(/Stage 3 is open\.$/)).toBeInTheDocument()
  })

  it('opens the next stage, and keeps it open after a reload', () => {
    const { view } = renderTetris()
    nearClear.on = true
    click('Challenge')
    clearStageAfter(1_000)
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')

    // The cleared stage stays chosen; the next one is open to choose.
    click('Play again')
    expect(stageButton('Stage 1: Clean-up')).toHaveAttribute('aria-pressed', 'true')
    expect(openStages()).toEqual([1, 2])
    fireEvent.click(stageButton('Stage 2: Ten on top'))
    expect(screen.getByText(/^Stage 2, Ten on top: Clear 10 lines within 2:00\./)).toBeInTheDocument()

    view.unmount()
    renderTetris()
    click('Challenge')
    expect(openStages()).toEqual([1, 2])
    expect(stageButton('Stage 2: Ten on top')).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens stages one at a time, and the last opens nothing more', () => {
    renderTetris()
    nearClear.on = true
    click('Challenge')
    for (let id = 1; id <= 6; id++) {
      if (id > 1) {
        click('Play again')
        fireEvent.click(stageButton(new RegExp(`^Stage ${id}:`)))
      }
      clearStageAfter(500)
      expect(window.localStorage.getItem(PROGRESS_KEY)).toBe(String(id))
    }
    expect(screen.getByText(/That was the last stage\.$/)).toBeInTheDocument()
    click('Play again')
    expect(openStages()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("does not move progress back when an earlier stage is cleared again", () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    renderTetris()
    nearClear.on = true
    click('Challenge')
    fireEvent.click(stageButton('Stage 2: Ten on top'))
    clearStageAfter(500)

    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('4')
    expect(screen.getByText(/Stage 3 is open\.$/)).toBeInTheDocument()
    click('Play again')
    expect(openStages()).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps the lowest time of each stage as its best on this device, apart from the other modes', () => {
    window.localStorage.setItem('cyan-arcade:high-score:tetris', '999999')
    window.localStorage.setItem('cyan-arcade:high-score:tetris-sprint', '50000')
    const { onGameOver } = renderTetris()
    nearClear.on = true
    click('Challenge')
    clearStageAfter(3_000)
    const first = onGameOver.mock.calls[0][0].score
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-challenge-1')).toBe(String(first))

    // The best, shown before the next attempt, as a time.
    click('Play again')
    expect(screen.getByText(new RegExp(`Your best: ${formatGameTime(first).replace('.', '\\.')}\\.`))).toBeInTheDocument()

    // Slower: cleared, not a best.
    clearStageAfter(5_000)
    expect(heading('Stage cleared!')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Your best is ${formatGameTime(first).replace('.', '\\.')}\\.`))).toBeInTheDocument()

    // Faster: a new best.
    click('Play again')
    clearStageAfter(1_000)
    const fastest = onGameOver.mock.calls[2][0].score
    expect(fastest).toBeLessThan(first)
    expect(screen.getByText(/Your fastest yet\./)).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-challenge-1')).toBe(String(fastest))

    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-challenge-2')).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris')).toBe('999999')
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-sprint')).toBe('50000')
  })
})

describe('a failed stage', () => {
  it('reports nothing and opens nothing when it tops out', () => {
    const { onGameStart, onGameOver } = renderTetris()
    click('Challenge')
    click('Start')
    advance(400)
    topOut()

    expect(heading('Topped out')).toBeInTheDocument()
    expect(screen.getByText(/rows were left\. Only a cleared stage is saved, so this run was not saved\./)).toBeInTheDocument()
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-challenge-1')).toBeNull()
    click('Play again')
    expect(openStages()).toEqual([1])
  })

  it('times out at its limit of game time, reports nothing and opens nothing', () => {
    // A limit of four seconds in place of two minutes: the same clock, sooner.
    nearClear.limitMs = 4_000
    window.localStorage.setItem(PROGRESS_KEY, '1')
    const { onGameOver } = renderTetris()
    click('Challenge')
    click('Start')
    advance(3_000)
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument()
    advance(2_000)

    expect(heading("Time's up!")).toBeInTheDocument()
    expect(stat('Time left')).toBe('0:00')
    expect(screen.getByText(/^You cleared 0 of 10 lines\. Only a cleared stage is saved/)).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
  })

  it('never reports, nor opens the next stage for, a clear that used up the pause allowance', () => {
    const { onGameOver } = renderTetris()
    nearClear.on = true
    click('Challenge')
    click('Start')
    press('p')
    advance(61_000)
    expect(screen.getByRole('alert')).toHaveTextContent('This run will not be saved')
    press('p')
    press(' ')

    expect(heading('Run not saved')).toBeInTheDocument()
    expect(screen.getByText(/^You cleared stage 1 in .* It paused for more than a minute in all/)).toBeInTheDocument()
    expect(stat('Pause left')).toBe('Used up')
    expect(onGameOver).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })

  it('reports a clear after a pause within the allowance', () => {
    const { onGameOver } = renderTetris()
    nearClear.on = true
    click('Challenge')
    click('Start')
    press('p')
    advance(50_000)
    expect(screen.getByRole('alert')).toHaveTextContent('so that a clear still counts')
    press('p')
    advance(500)
    press(' ')

    expect(onGameOver).toHaveBeenCalledTimes(1)
    confirmSaved()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
  })
})

describe('opening the next stage', () => {
  it('waits for the server to record the clear', () => {
    nearClear.on = true
    const { onGameOver } = renderTetris()
    click('Challenge')
    clearStageAfter(1_000, { saved: false })

    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0].onSaved).toEqual(expect.any(Function))
    expect(screen.getByText(/ Stage 2 opens once this clear is saved\.$/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()

    confirmSaved()
    expect(screen.getByText(/ Stage 2 is open\.$/)).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
  })

  it('stays locked when the clear is never recorded (refused or not saved)', () => {
    nearClear.on = true
    const { view } = renderTetris()
    click('Challenge')
    clearStageAfter(1_000, { saved: false })
    click('Play again')

    expect(openStages()).toEqual([1])
    view.unmount()
    renderTetris()
    click('Challenge')
    expect(openStages()).toEqual([1])
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })

  it('opens it once however often the save is confirmed', () => {
    nearClear.on = true
    const { onGameOver } = renderTetris()
    click('Challenge')
    clearStageAfter(1_000)
    act(() => onGameOver.mock.calls[0][0].onSaved?.())
    act(() => onGameOver.mock.calls[0][0].onSaved?.())

    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
    click('Play again')
    expect(openStages()).toEqual([1, 2])
  })

  it('opens nothing more for a late confirmation of an earlier stage', () => {
    nearClear.on = true
    const { onGameOver } = renderTetris()
    click('Challenge')
    clearStageAfter(500)
    click('Play again')
    fireEvent.click(stageButton('Stage 2: Ten on top'))
    clearStageAfter(500)
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('2')

    // Stage 1's confirmation again, after stage 2's.
    act(() => onGameOver.mock.calls[0][0].onSaved?.())
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('2')
    click('Play again')
    expect(openStages()).toEqual([1, 2, 3])
  })
})

describe('a stage played by the AI', () => {
  it('can clear it, but never starts or reports a run, and opens nothing', () => {
    const { onGameStart, onGameOver } = renderTetris(ALL_MODES, createTetrisAi)
    nearClear.on = true
    click('Challenge')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))
    advance(10_000)

    expect(heading('Stage cleared!')).toBeInTheDocument()
    // No best and no next stage: the AI's clear is not the player's.
    expect(screen.getByText(/^You cleared stage 1 in \d:\d\d\.\d\d\.$/)).toBeInTheDocument()
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-challenge-1')).toBeNull()
  })
})

describe('Classic, Ultra and Sprint beside Challenge', () => {
  it('leaves a Classic run reported by its points, as before', () => {
    const { onGameStart, onGameOver } = renderTetris()
    click('Start')
    topOut()

    expect(onGameStart).toHaveBeenCalledWith()
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(score).toBeGreaterThan(0)
    expect(metadata).toEqual({ lines: expect.any(Number), level: expect.any(Number), pieces: expect.any(Number) })
    expect(screen.queryByRole('group', { name: 'Challenge stage' })).not.toBeInTheDocument()
    // Nothing waits on its save.
    expect(onGameOver.mock.calls[0][0]).not.toHaveProperty('onSaved')
  })

  it('leaves Ultra and Sprint started under their own modes, without garbage', () => {
    const { onGameStart, view } = renderTetris()
    click('Ultra')
    expect(screen.queryByRole('group', { name: 'Challenge stage' })).not.toBeInTheDocument()
    expect(screen.queryByText('Garbage left')).not.toBeInTheDocument()
    click('Start')
    expect(onGameStart).toHaveBeenLastCalledWith('ultra')
    view.unmount()

    const sprint = renderTetris()
    click('Sprint')
    expect(stat('Lines')).toBe('0/40')
    click('Start')
    expect(sprint.onGameStart).toHaveBeenLastCalledWith('sprint')
  })
})
