import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps, GameResult } from '@/games/types'
import { PROGRESS_KEY } from './adventureProgress'
import { createSnakeAi, type SnakeAI } from './ai/snakeAi'
import { adventureStage, createAdventureGame, type AdventureStageId } from './engine/snakeAdventure'
import { tickDelay, updateSnake, type Direction } from './engine/snakeEngine'
import SnakeGame from './SnakeGame'

/**
 * Snake Adventure on its screen: six stages offered only when the server declares them, opened one by
 * one on this device, each only once the server has saved a human clear of the one before. A crash or
 * a used-up move limit fails a stage and is never reported; the AI plays stages and never reports one.
 */

const ADVENTURE = ['adventure-1', 'adventure-2', 'adventure-3', 'adventure-4', 'adventure-5', 'adventure-6']
const ALL_MODES = ['classic', 'map-pillars', 'map-tunnels', 'map-rooms', ...ADVENTURE]
const KEYS: Record<Direction, string> = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight' }

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const board = () => screen.getByRole('img', { name: /Snake board/ })
const stat = (name: string) => screen.getByText(name, { selector: 'dt, span, div' }).nextElementSibling?.textContent
const stagePicker = () => screen.queryByRole('group', { name: 'Adventure stage' })
const stageButton = (id: number) => within(stagePicker()!).getByRole('button', { name: new RegExp(`^Stage ${id}:`) })
const chooseStage = (id: number) => fireEvent.click(stageButton(id))
const mapPicker = () => screen.queryByRole('group', { name: 'Map' })

function snake(props: Partial<GameProps<SnakeAI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn<(result: GameResult) => void>() }
  const view = render(<SnakeGame {...handlers} {...props} />)
  return { ...handlers, ...view }
}

/** The moves the AI clears a stage with on its fixed seed, each with the human tick it is made at. */
function clearingMoves(id: AdventureStageId) {
  const ai = createSnakeAi()
  let state = createAdventureGame(adventureStage(id))
  const moves: { direction: Direction; delay: number }[] = []
  while (state.status === 'playing') {
    const direction = ai.decide(state).action
    moves.push({ direction, delay: tickDelay(state.score) })
    state = updateSnake(updateSnake(state, { type: 'turn', direction }), { type: 'tick' })
  }
  return { moves, state }
}

/** Plays moves as a player would: each one's key, then its tick. */
function playMoves(moves: readonly { direction: Direction; delay: number }[]) {
  for (const { direction, delay } of moves) {
    press(KEYS[direction])
    advance(delay)
  }
}

/** Stage 1's clear on its fixed seed: 10 apples in 178 moves, a game time of 25.92 s. */
const STAGE_1 = clearingMoves(1)

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('choosing an Adventure stage', () => {
  it('offers no Adventure while the server declares none of its stages', () => {
    snake({ modes: ['classic', 'map-pillars', 'map-tunnels', 'map-rooms'] })

    expect(stagePicker()).not.toBeInTheDocument()
    expect(screen.queryByText('Progress and best times are saved on this device only.')).not.toBeInTheDocument()
    expect(within(mapPicker()!).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Classic',
      'Pillars',
      'Tunnels',
      'Rooms',
    ])
  })

  it('offers no Adventure without the list of modes at all', () => {
    snake()

    expect(stagePicker()).not.toBeInTheDocument()
    expect(mapPicker()).not.toBeInTheDocument()
  })

  it('shows the six stages, only the first open on a new device', () => {
    snake({ modes: ALL_MODES })

    expect(screen.getByRole('heading', { name: 'Adventure' })).toBeInTheDocument()
    const buttons = within(stagePicker()!).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Stage 1: Open board, eat 10 apples',
      'Stage 2: Pillars, eat 15 apples, locked',
      'Stage 3: Tunnels, eat 20 apples, locked',
      'Stage 4: Tunnels, eat 15 apples within 400 moves, locked',
      'Stage 5: Rooms, eat 25 apples, locked',
      'Stage 6: Rooms, eat 30 apples within 900 moves, locked',
    ])
    expect(buttons[0]).toBeEnabled()
    for (const locked of buttons.slice(1)) expect(locked).toBeDisabled()
    expect(screen.getByText('Progress and best times are saved on this device only.')).toBeInTheDocument()
  })

  it('offers a stage only while the server declares it', () => {
    snake({ modes: ['classic', 'adventure-1', 'adventure-2'] })

    expect(within(stagePicker()!).getAllByRole('button')).toHaveLength(2)
  })

  it('opens the stages this device has cleared, and the one after', () => {
    window.localStorage.setItem(PROGRESS_KEY, '3')
    snake({ modes: ALL_MODES })

    expect([1, 2, 3, 4].map((id) => stageButton(id).hasAttribute('disabled'))).toEqual([false, false, false, false])
    expect(stageButton(5)).toBeDisabled()
    expect(stageButton(5)).toHaveAccessibleName('Stage 5: Rooms, eat 25 apples, locked')
    expect(stageButton(6)).toBeDisabled()
  })

  it.each(['junk', '-2', '2.5', ''])('treats stored progress of %j as none', (stored) => {
    window.localStorage.setItem(PROGRESS_KEY, stored)
    snake({ modes: ALL_MODES })

    expect(stageButton(1)).toBeEnabled()
    expect(stageButton(2)).toBeDisabled()
  })

  it('sets the stage up on its board, with its objective and no move limit where it has none', () => {
    snake({ modes: ALL_MODES })
    chooseStage(1)

    expect(stageButton(1)).toHaveAttribute('aria-pressed', 'true')
    expect(within(mapPicker()!).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()
    expect(screen.getByText('Stage 1, Open board.')).toBeInTheDocument()
    expect(screen.getByText(/Eat 10 apples\. Press an arrow key or swipe to start\./)).toBeInTheDocument()
    expect(screen.queryByText(/Walls end the run/)).not.toBeInTheDocument()
    expect(stat('Stage')).toBe('1/6')
    expect(stat('Apples')).toBe('0/10')
    expect(stat('Moves')).toBe('0')
    expect(screen.queryByText('Moves left')).not.toBeInTheDocument()
    expect(stat('Time')).toBe('0:00.00')
    expect(screen.queryByTestId('snake-walls')).not.toBeInTheDocument()
  })

  it('shows a move-limited stage with the moves it has left, on its map', () => {
    window.localStorage.setItem(PROGRESS_KEY, '3')
    snake({ modes: ALL_MODES })
    chooseStage(4)

    expect(screen.getByText('Stage 4, Tunnels.')).toBeInTheDocument()
    expect(screen.getByText(/Eat 15 apples within 400 moves\. Walls end the run\./)).toBeInTheDocument()
    expect(board()).toHaveAccessibleName(/Tunnels map/)
    expect(screen.getByTestId('snake-walls')).toBeInTheDocument()
    expect(stat('Stage')).toBe('4/6')
    expect(stat('Apples')).toBe('0/15')
    expect(stat('Moves left')).toBe('400')

    press('ArrowUp')
    advance(150 * 2)
    expect(stat('Moves left')).toBe('398')
    expect(stat('Time')).toBe('0:00.30')
  })

  it('keeps its stage while a run is under way', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    snake({ modes: ALL_MODES })
    chooseStage(2)
    press('ArrowDown')
    advance(150)

    expect(stageButton(1)).toBeDisabled()
    expect(stageButton(3)).toBeDisabled()
    expect(within(mapPicker()!).getByRole('button', { name: 'Classic' })).toBeDisabled()
  })

  it('goes back to Classic from a stage', () => {
    snake({ modes: ALL_MODES })
    chooseStage(1)
    fireEvent.click(within(mapPicker()!).getByRole('button', { name: 'Classic' }))

    expect(stageButton(1)).toHaveAttribute('aria-pressed', 'false')
    expect(board()).toHaveAccessibleName('Snake board. Length 3, score 0. Head at column 9, row 9.')
    expect(screen.getByText('Press an arrow key or swipe to start.')).toBeInTheDocument()
  })
})

describe('a human clear', () => {
  it('is reported once under its stage, as its game time, with its moves and apples', () => {
    const { onGameStart, onGameOver } = snake({ modes: ALL_MODES })
    chooseStage(1)
    playMoves(STAGE_1.moves)

    expect(STAGE_1.moves).toHaveLength(178)
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('adventure-1')
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const [{ score, metadata, onSaved }] = onGameOver.mock.calls[0]
    expect(score).toBe(25_920)
    expect(metadata).toEqual({ apples: 10, length: 13, level: 3, steps: 178, gameMs: 25_920 })
    expect(onSaved).toBeTypeOf('function')

    expect(screen.getByRole('heading', { name: 'Stage cleared!' })).toBeInTheDocument()
    expect(
      screen.getByText('You ate 10 apples in 178 moves, in 0:25.92. Your fastest yet. Stage 2 opens once this clear is saved.'),
    ).toBeInTheDocument()
    expect(stat('Apples')).toBe('10/10')
    expect(stat('Time')).toBe('0:25.92')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens the next stage only once the server has saved it', () => {
    const { onGameOver } = snake({ modes: ALL_MODES })
    chooseStage(1)
    playMoves(STAGE_1.moves)

    // Reported, not yet saved: still locked.
    expect(stageButton(2)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()

    act(() => onGameOver.mock.calls[0][0].onSaved?.())

    expect(stageButton(2)).toBeEnabled()
    expect(stageButton(2)).toHaveAccessibleName('Stage 2: Pillars, eat 15 apples')
    expect(stageButton(3)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
    expect(screen.getByText(/ Stage 2 is open\.$/)).toBeInTheDocument()
  })

  it('opens nothing when the save never succeeds, then or after a reload', () => {
    const view = snake({ modes: ALL_MODES })
    chooseStage(1)
    playMoves(STAGE_1.moves)
    // A refused or unreachable save never calls `onSaved`.
    view.unmount()

    snake({ modes: ALL_MODES })
    expect(stageButton(2)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })

  it('keeps the next stage open after a reload', () => {
    const view = snake({ modes: ALL_MODES })
    chooseStage(1)
    playMoves(STAGE_1.moves)
    act(() => view.onGameOver.mock.calls[0][0].onSaved?.())
    view.unmount()

    snake({ modes: ALL_MODES })
    expect(stageButton(2)).toBeEnabled()
    expect(stageButton(3)).toBeDisabled()
  })

  it('replaying a cleared stage opens nothing more', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    const { onGameOver } = snake({ modes: ALL_MODES })
    chooseStage(1)
    playMoves(STAGE_1.moves)
    act(() => onGameOver.mock.calls[0][0].onSaved?.())

    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('2')
    expect(stageButton(4)).toBeDisabled()
    expect(screen.getByText(/ Stage 2 is open\.$/)).toBeInTheDocument()
  })

  it('keeps a best time of its own per stage, the lowest', () => {
    window.localStorage.setItem('cyan-arcade:high-score:snake-adventure-1', '30000')
    window.localStorage.setItem('cyan-arcade:high-score:snake', '42')
    window.localStorage.setItem(PROGRESS_KEY, '1')
    snake({ modes: ALL_MODES })
    chooseStage(1)
    expect(screen.getByText(/Your best: 0:30\.00\./)).toBeInTheDocument()

    chooseStage(2)
    expect(screen.queryByText(/Your best/)).not.toBeInTheDocument()

    chooseStage(1)
    playMoves(STAGE_1.moves)
    expect(screen.getByText(/in 0:25\.92\. Your fastest yet\./)).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake-adventure-1')).toBe('25920')
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake-adventure-2')).toBeNull()
    // Classic's best is its own.
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake')).toBe('42')
  })

  it('does not replace a faster best', () => {
    window.localStorage.setItem('cyan-arcade:high-score:snake-adventure-1', '20000')
    snake({ modes: ALL_MODES })
    chooseStage(1)
    playMoves(STAGE_1.moves)

    expect(screen.getByText(/in 0:25\.92\. Your best is 0:20\.00\./)).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake-adventure-1')).toBe('20000')
  })
})

describe('a failed stage', () => {
  it('ends on a crash and is never reported', () => {
    window.localStorage.setItem(PROGRESS_KEY, '1')
    const { onGameStart, onGameOver } = snake({ modes: ALL_MODES })
    chooseStage(2)
    // Stage 2, Pillars: down three, then right into the pillar at column 12, row 12.
    press('ArrowDown')
    advance(150 * 3)
    press('ArrowRight')
    advance(150 * 3)

    expect(onGameStart).toHaveBeenCalledWith('adventure-2')
    expect(screen.getByRole('heading', { name: 'Crashed' })).toBeInTheDocument()
    expect(screen.getByText('The snake crashed with 0 of 15 apples eaten. Only a cleared stage is saved.')).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(stageButton(3)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake-adventure-2')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends at the board edge too', () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    const { onGameOver } = snake({ modes: ALL_MODES })
    chooseStage(5)
    // Rooms starts the snake three cells below the top edge.
    press('ArrowUp')
    advance(150 * 4)

    expect(screen.getByRole('heading', { name: 'Crashed' })).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('ends when its moves run out short of the objective, and is never reported', () => {
    window.localStorage.setItem(PROGRESS_KEY, '3')
    const { onGameOver } = snake({ modes: ALL_MODES })
    chooseStage(4)
    // Circling a 2x2 square never reaches stage 4's first apple.
    const square: Direction[] = ['DOWN', 'LEFT', 'UP', 'RIGHT']
    playMoves(Array.from({ length: 399 }, (_, move) => ({ direction: square[move % 4], delay: 150 })))
    expect(stat('Moves left')).toBe('1')
    expect(screen.queryByRole('heading', { name: 'Out of moves' })).not.toBeInTheDocument()

    playMoves([{ direction: square[399 % 4], delay: 150 }])

    expect(stat('Moves left')).toBe('0')
    expect(screen.getByRole('heading', { name: 'Out of moves' })).toBeInTheDocument()
    expect(
      screen.getByText('All 400 moves were used with 0 of 15 apples eaten. Only a cleared stage is saved.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Crashed' })).not.toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(stageButton(5)).toBeDisabled()
  })

  it('starts the stage again from the same position', () => {
    window.localStorage.setItem(PROGRESS_KEY, '4')
    snake({ modes: ALL_MODES })
    chooseStage(5)
    const start = board().getAttribute('aria-label')
    press('ArrowUp')
    advance(150 * 4)
    click('Play again')

    expect(board().getAttribute('aria-label')).toBe(start)
    expect(stat('Time')).toBe('0:00.00')
    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()
  })
})

describe('the AI on Adventure', () => {
  it('clears a stage and never reports it, saves a best or opens the next stage', () => {
    const { onGameStart, onGameOver } = snake({ modes: ALL_MODES, ai: createSnakeAi })
    chooseStage(1)
    click('AI')
    advance(1_000 * 200)

    expect(screen.getByRole('heading', { name: 'Stage cleared!' })).toBeInTheDocument()
    // The same game time as a player's clear of the same moves, whatever speed the AI plays at.
    expect(screen.getByText('The AI ate 10 apples in 178 moves, in 0:25.92.')).toBeInTheDocument()
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(stageButton(2)).toBeDisabled()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake-adventure-1')).toBeNull()
  })

  it('clears a move-limited stage within its moves, and never reports it', () => {
    window.localStorage.setItem(PROGRESS_KEY, '3')
    const { onGameOver } = snake({ modes: ALL_MODES, ai: createSnakeAi })
    chooseStage(4)
    click('AI')
    advance(1_000 * 400)

    // The AI clears stage 4 in 263 moves on its seed.
    expect(screen.getByText('The AI ate 15 apples in 263 moves, in 0:36.80.')).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('keeps AI mode and its speed across stage changes', () => {
    window.localStorage.setItem(PROGRESS_KEY, '2')
    const { onGameStart, onGameOver } = snake({ modes: ALL_MODES, ai: createSnakeAi })
    chooseStage(1)
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '4x' }))
    advance(140 * 10)

    chooseStage(3)
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '4x' })).toBeChecked()
    expect(board()).toHaveAccessibleName(/Tunnels map\. Length 3, score 0\./)
    expect(stat('Stage')).toBe('3/6')

    fireEvent.click(within(mapPicker()!).getByRole('button', { name: 'Rooms' }))
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '4x' })).toBeChecked()
    advance(140 * 20)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('keeps Human mode across stage changes', () => {
    window.localStorage.setItem(PROGRESS_KEY, '1')
    snake({ modes: ALL_MODES, ai: createSnakeAi })
    chooseStage(2)

    expect(screen.getByRole('button', { name: 'Human' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()
  })
})

describe('a stage the server stops declaring', () => {
  it('is never played for a score: no run starts until Classic is chosen', () => {
    const view = snake({ modes: ALL_MODES })
    chooseStage(1)
    view.rerender(<SnakeGame onGameStart={view.onGameStart} onGameOver={view.onGameOver} modes={['classic']} />)

    expect(screen.getByRole('heading', { name: 'Stage unavailable' })).toBeInTheDocument()
    press('ArrowUp')
    advance(150 * 3)
    expect(view.onGameStart).not.toHaveBeenCalled()

    click('Play Classic')
    press('ArrowUp')
    expect(view.onGameStart).toHaveBeenCalledWith()
  })
})

describe('Classic and the maps beside Adventure', () => {
  it('play and report as before', () => {
    const classic = snake({ modes: ALL_MODES })
    press('ArrowUp')
    advance(150 * 10)
    expect(classic.onGameStart).toHaveBeenCalledWith()
    expect(classic.onGameOver).toHaveBeenCalledTimes(1)
    expect(classic.onGameOver.mock.calls[0][0].metadata).toEqual({ length: 3, level: 1 })
    expect(classic.onGameOver.mock.calls[0][0].onSaved).toBeUndefined()
    classic.unmount()

    const map = snake({ modes: ALL_MODES })
    fireEvent.click(within(mapPicker()!).getByRole('button', { name: 'Rooms' }))
    expect(stageButton(1)).toHaveAttribute('aria-pressed', 'false')
    press('ArrowUp')
    advance(150 * 5)
    expect(map.onGameStart).toHaveBeenCalledWith('map-rooms')
    expect(map.onGameOver).toHaveBeenCalledTimes(1)
    expect(map.onGameOver.mock.calls[0][0].metadata).toEqual({ length: 3, level: 1 })
    expect(screen.getByRole('heading', { name: /Game over|New best!/ })).toBeInTheDocument()
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
  })
})
