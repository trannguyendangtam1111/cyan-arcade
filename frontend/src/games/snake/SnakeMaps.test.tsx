import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { createSnakeAi, type SnakeAI } from './ai/snakeAi'
import { snakeMap } from './engine/snakeMaps'
import SnakeGame from './SnakeGame'

// Fixed seed: every game here starts from the same position.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 1234,
}))

/**
 * Snake's maps on its screen: offered only when the server declares them, drawn with their walls,
 * played and reported under their own mode, with a best of their own; the AI plays them too, and
 * never reports a run.
 */

const ALL_MODES = ['classic', 'map-pillars', 'map-tunnels', 'map-rooms']
const STEP = 150

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const board = () => screen.getByRole('img', { name: /Snake board/ })
const label = () => board().getAttribute('aria-label') ?? ''
const stat = (name: string) => Number(screen.getByText(name).nextElementSibling?.textContent)
const mapPicker = () => screen.queryByRole('group', { name: 'Map' })
const chooseMap = (name: string) => fireEvent.click(within(mapPicker()!).getByRole('button', { name }))
const wallCells = () => [...board().querySelectorAll('[data-wall]')].map((wall) => wall.getAttribute('data-wall'))

function snake(props: Partial<GameProps<SnakeAI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  const view = render(<SnakeGame {...handlers} {...props} />)
  return { ...handlers, ...view }
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('choosing a map', () => {
  it('offers no map while the server declares none, and Classic plays as before', () => {
    snake({ modes: ['classic'] })

    expect(mapPicker()).not.toBeInTheDocument()
    expect(label()).toBe('Snake board. Length 3, score 0. Head at column 9, row 9.')
    expect(screen.queryByTestId('snake-walls')).not.toBeInTheDocument()
    expect(screen.getByText('Press an arrow key or swipe to start.')).toBeInTheDocument()
  })

  it('offers no map without the list of modes at all', () => {
    snake()

    expect(mapPicker()).not.toBeInTheDocument()
  })

  it('offers Classic and only the maps the server declares', () => {
    snake({ modes: ['classic', 'map-pillars', 'map-rooms'] })

    const buttons = within(mapPicker()!).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Classic', 'Pillars', 'Rooms'])
    expect(within(mapPicker()!).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['Pillars', 'pillars', 'Head at column 9, row 9.'],
    ['Tunnels', 'tunnels', 'Head at column 9, row 9.'],
    ['Rooms', 'rooms', 'Head at column 5, row 4.'],
  ] as const)('sets %s up from its layout, walls drawn where they are', (name, id, head) => {
    snake({ modes: ALL_MODES })
    chooseMap(name)

    expect(within(mapPicker()!).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    expect(label()).toBe(`Snake board, ${name} map. Length 3, score 0. ${head}`)
    expect(wallCells()).toEqual(snakeMap(id).walls.map((wall) => `${wall.x},${wall.y}`))
    // The map's name and what it asks for, before the run starts.
    expect(screen.getByText(`${name}.`)).toBeInTheDocument()
    expect(screen.getByText(/Eat as many apples as you can without hitting a wall\./)).toBeInTheDocument()
  })

  it('goes back to the open board for Classic', () => {
    snake({ modes: ALL_MODES })
    chooseMap('Rooms')
    chooseMap('Classic')

    expect(label()).toBe('Snake board. Length 3, score 0. Head at column 9, row 9.')
    expect(screen.queryByTestId('snake-walls')).not.toBeInTheDocument()
  })
})

describe('a map run', () => {
  it('begins under its map mode, and a Classic run as Classic, as before', () => {
    const map = snake({ modes: ALL_MODES })
    chooseMap('Tunnels')
    press('ArrowUp')
    expect(map.onGameStart).toHaveBeenCalledTimes(1)
    expect(map.onGameStart).toHaveBeenCalledWith('map-tunnels')
    map.unmount()

    const classic = snake({ modes: ALL_MODES })
    press('ArrowUp')
    expect(classic.onGameStart).toHaveBeenCalledTimes(1)
    expect(classic.onGameStart).toHaveBeenCalledWith()
  })

  it('ends when the snake runs into a wall, and reports the run once', () => {
    const { onGameOver } = snake({ modes: ALL_MODES })
    chooseMap('Pillars')

    // Down three, then right into the pillar at column 12, row 12.
    press('ArrowDown')
    advance(STEP * 3)
    press('ArrowRight')
    advance(STEP * 2)
    expect(label()).toContain('Head at column 11, row 12.')
    advance(STEP)

    expect(screen.getByRole('heading', { name: /Game over|New best!/ })).toBeInTheDocument()
    expect(label()).toContain('Head at column 11, row 12.')
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const [{ score, metadata }] = onGameOver.mock.calls[0]
    expect(metadata).toEqual({ length: score + 3, level: Math.floor(score / 5) + 1 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps its map while it is under way', () => {
    snake({ modes: ALL_MODES })
    chooseMap('Pillars')
    press('ArrowDown')
    advance(STEP)

    const picker = within(mapPicker()!)
    expect(picker.getByRole('button', { name: 'Classic' })).toBeDisabled()
    expect(picker.getByRole('button', { name: 'Rooms' })).toBeDisabled()
    expect(screen.getByText('The map can change once this run ends.')).toBeInTheDocument()

    // Into the bottom edge: the run is over and the map can change again.
    advance(STEP * 10)
    expect(picker.getByRole('button', { name: 'Rooms' })).toBeEnabled()
  })

  it('keeps a best of its own on this device', () => {
    window.localStorage.setItem('cyan-arcade:high-score:snake', '5')
    window.localStorage.setItem('cyan-arcade:high-score:snake-map-pillars', '17')
    snake({ modes: ALL_MODES })
    expect(stat('Best')).toBe(5)

    chooseMap('Pillars')
    expect(stat('Best')).toBe(17)
    chooseMap('Rooms')
    expect(stat('Best')).toBe(0)
    chooseMap('Classic')
    expect(stat('Best')).toBe(5)
  })

  it('records a new best under its own mode only', () => {
    const { onGameOver } = snake({ modes: ALL_MODES })
    chooseMap('Rooms')
    // Up into the top edge: three cells away.
    press('ArrowUp')
    advance(STEP * 5)
    const [{ score }] = onGameOver.mock.calls[0]

    expect(window.localStorage.getItem('cyan-arcade:high-score:snake')).toBeNull()
    expect(window.localStorage.getItem('cyan-arcade:high-score:snake-map-rooms')).toBe(score > 0 ? String(score) : null)
  })
})

describe('the AI on a map', () => {
  it('plays the chosen map and never reports a run', () => {
    const { onGameStart, onGameOver } = snake({ modes: ALL_MODES, ai: createSnakeAi })
    chooseMap('Rooms')
    click('AI')
    advance(140 * 400)

    expect(label()).toContain('Rooms map')
    expect(stat('Moves')).toBeGreaterThan(100)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('stays in AI mode when the map changes, and plays the new one', () => {
    const { onGameStart, onGameOver } = snake({ modes: ALL_MODES, ai: createSnakeAi })
    click('AI')
    advance(140 * 20)
    chooseMap('Tunnels')

    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(label()).toContain('Tunnels map. Length 3, score 0.')
    advance(140 * 50)
    expect(stat('Moves')).toBeGreaterThan(0)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe('a map the server stops declaring', () => {
  it('is never played for a score as Classic: no run starts until Classic is chosen', () => {
    const view = snake({ modes: ALL_MODES })
    chooseMap('Pillars')
    view.rerender(<SnakeGame onGameStart={view.onGameStart} onGameOver={view.onGameOver} modes={['classic']} />)

    expect(screen.getByRole('heading', { name: 'Map unavailable' })).toBeInTheDocument()
    press('ArrowUp')
    advance(STEP * 3)
    expect(view.onGameStart).not.toHaveBeenCalled()
    expect(label()).toContain('Pillars map. Length 3, score 0. Head at column 9, row 9.')

    click('Play Classic')
    expect(label()).toBe('Snake board. Length 3, score 0. Head at column 9, row 9.')
    press('ArrowUp')
    expect(view.onGameStart).toHaveBeenCalledWith()
  })
})
