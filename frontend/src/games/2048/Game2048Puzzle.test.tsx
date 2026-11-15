import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps, GameResult } from '@/games/types'
import { createGame2048Ai, type Game2048AI } from './ai/game2048Ai'
import Game2048 from './Game2048'
import { PROGRESS_KEY } from './puzzleProgress'

// A fixed seed for Classic and the ranked modes; a Puzzle stage always plays on its own seed.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 2048,
}))

/**
 * 2048 Puzzle on its screen: six stages offered only when the server declares them, opened one by one
 * on this device, each only once the server has saved a human clear of the one before. Running out of
 * moves, or of moves to make, fails a stage and is never reported; the AI plays stages and never
 * reports one, nor opens a stage.
 */

const PUZZLE = ['puzzle-1', 'puzzle-2', 'puzzle-3', 'puzzle-4', 'puzzle-5', 'puzzle-6']
const RANKED = ['classic', 'moves', 'time-attack']
const ALL_MODES = [...RANKED, ...PUZZLE]
const KEYS: Record<string, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }

/** Stage 1's recorded clearing line (`game2048Puzzle.test.ts`): a 128 in 39 moves, 576 points. */
const STAGE_1_CLEAR = 'RRRRDULURUULRDRURUDDLLDLDULULDULRURULUL'
/** Stage 5 (10 moves): a clear on the 10th, every move used without the 512, and stuck after 3. */
const STAGE_5_LAST_MOVE_CLEAR = 'UURULDRDUL'
const STAGE_5_OUT_OF_MOVES = 'UURUULUDLD'
const STAGE_5_STUCK = 'UUL'

const press = (key: string) => fireEvent.keyDown(window, { key })
const playLine = (line: string) => [...line].forEach((move) => press(KEYS[move]))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const stat = (label: string) => Number(screen.getByText(label).nextElementSibling?.textContent)
const heading = (name: string) => screen.queryByRole('heading', { name })
const modePicker = () => screen.queryByRole('group', { name: 'Game mode' })
const chooseMode = (name: string) => fireEvent.click(within(modePicker()!).getByRole('button', { name }))
const stagePicker = () => screen.queryByRole('group', { name: 'Puzzle stage' })
const stageButton = (n: number) => within(stagePicker()!).getByRole('button', { name: new RegExp(`^Stage ${n}:`) })
const chooseStage = (n: number) => fireEvent.click(stageButton(n))
const board = () => screen.getByRole('img', { name: /2048 board/ })

function game(props: Partial<GameProps<Game2048AI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn<(result: GameResult) => void>() }
  const view = render(<Game2048 {...handlers} ai={createGame2048Ai} {...props} />)
  return { ...handlers, ...view }
}

/** Opens Puzzle, then the stage (open on this device). */
function playStage(n: number) {
  chooseMode('Puzzle')
  if (stageButton(n).getAttribute('aria-pressed') !== 'true') chooseStage(n)
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('choosing Puzzle', () => {
  it('is offered after the ranked modes while the server declares its stages', () => {
    game({ modes: ALL_MODES })

    expect(within(modePicker()!).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Classic',
      'Moves Limit',
      'Time Attack',
      'Puzzle',
    ])
    // Classic is chosen, and no stage is shown until Puzzle is.
    expect(within(modePicker()!).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
    expect(stagePicker()).not.toBeInTheDocument()
  })

  it('is not offered while the server declares none of its stages', () => {
    game({ modes: RANKED })
    expect(within(modePicker()!).queryByRole('button', { name: 'Puzzle' })).not.toBeInTheDocument()
  })

  it('shows the six stages, only the first open on a new device', () => {
    game({ modes: ALL_MODES })
    chooseMode('Puzzle')

    expect(within(modePicker()!).getByRole('button', { name: 'Puzzle' })).toHaveAttribute('aria-pressed', 'true')
    const buttons = within(stagePicker()!).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Stage 1: First Steps, make a 128 within 60 moves',
      'Stage 2: Chain Reaction, make a 256 within 20 moves, locked',
      'Stage 3: Clutter, make a 128 within 26 moves, locked',
      'Stage 4: Half Built, make a 512 within 36 moves, locked',
      'Stage 5: Locked Column, make a 512 within 10 moves, locked',
      'Stage 6: Endgame, make a 1024 within 36 moves, locked',
    ])
    expect(buttons[0]).toBeEnabled()
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    for (const locked of buttons.slice(1)) expect(locked).toBeDisabled()
    expect(screen.getByText('0 of 6 cleared. Progress is saved on this device only.')).toBeInTheDocument()
  })

  it('shows cleared stages, the next one open and the rest locked, and opens on the furthest open stage', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    game({ modes: ALL_MODES })
    chooseMode('Puzzle')

    expect(stageButton(1)).toHaveAccessibleName('Stage 1: First Steps, make a 128 within 60 moves, cleared')
    expect(stageButton(2)).toHaveAccessibleName('Stage 2: Chain Reaction, make a 256 within 20 moves, cleared')
    expect(stageButton(3)).toHaveAccessibleName('Stage 3: Clutter, make a 128 within 26 moves')
    expect(stageButton(3)).toHaveAttribute('aria-pressed', 'true')
    expect([1, 2, 3].map((n) => stageButton(n).hasAttribute('disabled'))).toEqual([false, false, false])
    expect([4, 5, 6].map((n) => stageButton(n).hasAttribute('disabled'))).toEqual([true, true, true])
    expect(screen.getByText('2 of 6 cleared. Progress is saved on this device only.')).toBeInTheDocument()
  })

  it.each(['junk', '-2', '2.5', ''])('treats stored progress of %j as none', (stored) => {
    window.localStorage.setItem(PROGRESS_KEY, stored)
    game({ modes: ALL_MODES })
    chooseMode('Puzzle')

    expect(stageButton(1)).toBeEnabled()
    expect(stageButton(2)).toBeDisabled()
  })

  it.each([
    [1, /^Rows: empty empty empty empty.*32 empty empty 16$/, 128, 60],
    [2, /^Rows: 128 64 32 16/, 256, 20],
    [5, /^Rows: 256 4 2 4/, 512, 10],
  ])('sets stage %i up on its own board, target and moves', (n, rows, target, moves) => {
    window.localStorage.setItem(PROGRESS_KEY, '6')
    game({ modes: ALL_MODES })
    playStage(n)

    expect(board().getAttribute('aria-label')?.replace(/^2048 board\. Score 0\. /, '')).toMatch(rows)
    expect(stat('Score')).toBe(0)
    expect(stat('Target')).toBe(target)
    expect(stat('Moves used')).toBe(0)
    expect(stat('Moves left')).toBe(moves)
    expect(screen.getByText(new RegExp(`Make a ${target} within ${moves} moves\\.$`))).toBeInTheDocument()
    // The board is there to plan on before the first move.
    expect(screen.queryByRole('heading', { name: /Ready|unavailable|cleared|moves/i })).not.toBeInTheDocument()
  })

  it('keeps its stage, and the mode, while a run is under way', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    game({ modes: ALL_MODES })
    playStage(2)
    press('ArrowUp')

    expect(stageButton(1)).toBeDisabled()
    expect(stageButton(3)).toBeDisabled()
    expect(within(modePicker()!).getByRole('button', { name: 'Classic' })).toBeDisabled()
  })

  it('stays on the chosen stage when Puzzle is pressed again, and goes back to Classic', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    game({ modes: ALL_MODES })
    playStage(1)
    chooseMode('Puzzle')
    expect(stageButton(1)).toHaveAttribute('aria-pressed', 'true')

    chooseMode('Classic')
    expect(stagePicker()).not.toBeInTheDocument()
    expect(screen.getByText('Best tile')).toBeInTheDocument()
    expect(screen.queryByText('Target')).not.toBeInTheDocument()
  })
})

describe('a human clear', () => {
  it('opens no run on a move that changes nothing', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    const { onGameStart } = game({ modes: ALL_MODES })
    playStage(3)
    // Clutter's only gap is at the left of its second row: sliding right changes nothing.
    for (let i = 0; i < 3; i++) press('ArrowRight')

    expect(onGameStart).not.toHaveBeenCalled()
    expect(stat('Moves used')).toBe(0)
  })

  it('is reported once under its stage, with its target tile and moves', () => {
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    playStage(1)
    playLine(STAGE_1_CLEAR)

    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('puzzle-1')
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const [{ score, metadata, onSaved }] = onGameOver.mock.calls[0]
    expect(score).toBe(576)
    expect(metadata).toEqual({ highestTile: 128, moves: 39 })
    expect(onSaved).toBeTypeOf('function')

    expect(heading('Stage cleared!')).toBeInTheDocument()
    expect(
      screen.getByText('You made the 128 in 39 of 60 moves, scoring 576. Stage 2 opens once this clear is saved.'),
    ).toBeInTheDocument()
    expect(stat('Moves used')).toBe(39)
    expect(stat('Moves left')).toBe(21)
    // Nothing moves, and nothing more is reported, after the clear.
    const held = board().getAttribute('aria-label')
    playLine('UDLR')
    expect(board().getAttribute('aria-label')).toBe(held)
    expect(onGameOver).toHaveBeenCalledTimes(1)
  })

  it('opens the next stage only once the server has saved it, then offers it', () => {
    const { onGameOver } = game({ modes: ALL_MODES })
    playStage(1)
    playLine(STAGE_1_CLEAR)

    // Reported, not yet saved: still locked, and no way on.
    expect(stageButton(2)).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Next stage' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()

    act(() => onGameOver.mock.calls[0][0].onSaved?.())

    expect(stageButton(2)).toBeEnabled()
    expect(stageButton(2)).toHaveAccessibleName('Stage 2: Chain Reaction, make a 256 within 20 moves')
    expect(stageButton(1)).toHaveAccessibleName(/, cleared$/)
    expect(stageButton(3)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
    expect(screen.getByText(/ Stage 2 is open\.$/)).toBeInTheDocument()

    click('Next stage')
    expect(stageButton(2)).toHaveAttribute('aria-pressed', 'true')
    expect(stat('Target')).toBe(256)
  })

  it('opens nothing when the save is refused, fails or never arrives, then or after a reload', () => {
    const view = game({ modes: ALL_MODES })
    playStage(1)
    playLine(STAGE_1_CLEAR)
    // A refused, failed or offline save never calls `onSaved`.
    expect(view.onGameOver).toHaveBeenCalledTimes(1)
    expect(stageButton(2)).toBeDisabled()
    view.unmount()

    game({ modes: ALL_MODES })
    chooseMode('Puzzle')
    expect(stageButton(2)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })

  it('keeps the next stage open after a reload', () => {
    const view = game({ modes: ALL_MODES })
    playStage(1)
    playLine(STAGE_1_CLEAR)
    act(() => view.onGameOver.mock.calls[0][0].onSaved?.())
    view.unmount()

    game({ modes: ALL_MODES })
    chooseMode('Puzzle')
    expect(stageButton(2)).toHaveAttribute('aria-pressed', 'true')
    expect(stageButton(2)).toBeEnabled()
    expect(stageButton(3)).toBeDisabled()
  })

  it('replaying a cleared stage opens nothing more', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    const { onGameOver } = game({ modes: ALL_MODES })
    playStage(1)
    playLine(STAGE_1_CLEAR)
    act(() => onGameOver.mock.calls[0][0].onSaved?.())

    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('2')
    expect(stageButton(4)).toBeDisabled()
    expect(screen.getByText(/ Stage 2 is open\.$/)).toBeInTheDocument()
  })

  it('counts a clear made on the last allowed move', () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    playStage(5)
    playLine(STAGE_5_LAST_MOVE_CLEAR)

    expect(onGameStart).toHaveBeenCalledWith('puzzle-5')
    expect(heading('Stage cleared!')).toBeInTheDocument()
    expect(screen.getByText(/^You made the 512 in 10 of 10 moves, scoring \d+\. Stage 6 opens once this clear is saved\.$/))
      .toBeInTheDocument()
    expect(stat('Moves left')).toBe(0)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0].metadata).toEqual({ highestTile: 512, moves: 10 })

    act(() => onGameOver.mock.calls[0][0].onSaved?.())
    expect(stageButton(6)).toBeEnabled()
    expect(screen.getByText(/ Stage 6 is open\.$/)).toBeInTheDocument()
  })

  it('keeps its own best per stage, apart from Classic and the ranked modes', () => {
    window.localStorage.setItem('cyan-arcade:high-score:2048', '9000')
    game({ modes: ALL_MODES })
    playStage(1)
    playLine(STAGE_1_CLEAR)

    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-puzzle-1')).toBe('576')
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048')).toBe('9000')
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-moves')).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-time-attack')).toBeNull()
  })
})

describe('a failed stage', () => {
  it('ends when every move is used without the target, and is never reported', () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    playStage(5)
    playLine(STAGE_5_OUT_OF_MOVES)

    expect(onGameStart).toHaveBeenCalledWith('puzzle-5')
    expect(heading('Out of moves')).toBeInTheDocument()
    expect(
      screen.getByText(/^All 10 moves used without making the 512\. Best tile: \d+\. Only a cleared stage is saved\.$/),
    ).toBeInTheDocument()
    expect(stat('Moves left')).toBe(0)
    expect(onGameOver).not.toHaveBeenCalled()
    expect(stageButton(6)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('4')
  })

  it('ends when no move is left, and is never reported', () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    const { onGameOver } = game({ modes: ALL_MODES })
    playStage(5)
    playLine(STAGE_5_STUCK)

    expect(heading('No moves left')).toBeInTheDocument()
    expect(
      screen.getByText(/^Stuck after 3 of 10 moves, short of the 512\. Best tile: \d+\. Only a cleared stage is saved\.$/),
    ).toBeInTheDocument()
    expect(stat('Moves left')).toBe(7)
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('gets stuck on Clutter after one careless move', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    playStage(3)
    press('ArrowUp')

    expect(onGameStart).toHaveBeenCalledWith('puzzle-3')
    expect(heading('No moves left')).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('starts the stage again from the same board', () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    game({ modes: ALL_MODES })
    playStage(5)
    const start = board().getAttribute('aria-label')
    playLine(STAGE_5_STUCK)
    click('Play again')

    expect(board().getAttribute('aria-label')).toBe(start)
    expect(stat('Moves used')).toBe(0)
    expect(stat('Moves left')).toBe(10)
  })
})

describe('the AI on Puzzle', () => {
  it('clears a stage on its seed and never reports it, saves a best or opens the next stage', () => {
    vi.useFakeTimers()
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    playStage(1)
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    for (let i = 0; i < 200 && !heading('Stage cleared!'); i++) act(() => vi.advanceTimersToNextTimer())

    // The game's AI clears stage 1 in 49 moves on its seed (`game2048Puzzle.test.ts`).
    expect(screen.getByText(/^The AI made the 128 in 49 of 60 moves, scoring [\d,]+\.$/)).toBeInTheDocument()
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(stageButton(2)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-puzzle-1')).toBeNull()
  })

  it('plays only open stages, and keeps AI mode and its speed across stages and modes', () => {
    window.localStorage.setItem(PROGRESS_KEY, '1')
    vi.useFakeTimers()
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))
    playStage(1)
    expect(stageButton(3)).toBeDisabled()

    chooseStage(2)
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')
    for (let i = 0; i < 5; i++) act(() => vi.advanceTimersToNextTimer())
    expect(stat('Moves used')).toBeGreaterThan(0)

    chooseMode('Moves Limit')
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('keeps Human mode across stage changes', () => {
    window.localStorage.setItem(PROGRESS_KEY, '1')
    game({ modes: ALL_MODES })
    playStage(2)
    expect(screen.getByRole('button', { name: 'Human' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('a stage the server does not declare', () => {
  it('is never played for a score, and never falls back to Classic', () => {
    const view = game({ modes: ALL_MODES })
    playStage(1)
    view.rerender(<Game2048 onGameStart={view.onGameStart} onGameOver={view.onGameOver} ai={createGame2048Ai} modes={RANKED} />)

    expect(heading('Stage unavailable')).toBeInTheDocument()
    expect(screen.getByText('Stage 1, First Steps, cannot be played right now.')).toBeInTheDocument()
    expect(stat('Target')).toBe(128)
    playLine('UDLR')
    expect(view.onGameStart).not.toHaveBeenCalled()
    expect(stat('Moves used')).toBe(0)

    click('Play Classic')
    expect(heading('Stage unavailable')).not.toBeInTheDocument()
    playLine('UDLR')
    expect(view.onGameStart).toHaveBeenCalledWith()
  })

  it('is shown as unavailable when Puzzle opens on it', () => {
    const { onGameStart } = game({ modes: [...RANKED, 'puzzle-2', 'puzzle-3'] })
    chooseMode('Puzzle')

    expect(stageButton(1)).toHaveAttribute('aria-pressed', 'true')
    expect(stageButton(1)).toHaveAccessibleName(/, unavailable$/)
    expect(heading('Stage unavailable')).toBeInTheDocument()
    playLine('UDLR')
    expect(onGameStart).not.toHaveBeenCalled()
  })

  it('cannot be chosen while open but undeclared', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    game({ modes: [...RANKED, 'puzzle-1', 'puzzle-3'] })
    chooseMode('Puzzle')

    expect(stageButton(3)).toHaveAttribute('aria-pressed', 'true')
    expect(stageButton(2)).toBeDisabled()
    expect(stageButton(2)).toHaveAccessibleName(/, unavailable$/)
  })
})

describe('Classic and the ranked modes beside Puzzle', () => {
  it('begin under their own modes and report without a save callback, as before', () => {
    const classic = game({ modes: ALL_MODES })
    playLine('UDLR')
    expect(classic.onGameStart).toHaveBeenCalledTimes(1)
    expect(classic.onGameStart).toHaveBeenCalledWith()
    expect(screen.getByText('Best tile')).toBeInTheDocument()
    classic.unmount()

    const moves = game({ modes: ALL_MODES })
    chooseMode('Moves Limit')
    expect(stat('Moves left')).toBe(300)
    playLine('UDLR')
    expect(moves.onGameStart).toHaveBeenCalledWith('moves')
    moves.unmount()

    const timed = game({ modes: ALL_MODES })
    chooseMode('Time Attack')
    expect(screen.getByText('Time left')).toBeInTheDocument()
    playLine('UDLR')
    expect(timed.onGameStart).toHaveBeenCalledWith('time-attack')
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })
})
