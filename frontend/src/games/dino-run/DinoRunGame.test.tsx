import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameCosmetics, GameProps, GameSkin } from '@/games/types'
import { createDinoAiKit, type DinoAiKit } from './ai/dinoAi'
import DinoRunGame from './DinoRunGame'

vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 2468,
}))

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

function play(props: Partial<GameProps<DinoAiKit>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  render(
    <MemoryRouter>
      <DinoRunGame {...handlers} {...props} />
    </MemoryRouter>,
  )
  return handlers
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const press = (key: string) => fireEvent.keyDown(window, { key })
const playfield = () => screen.getByRole('button', { name: /playfield/i })
const stat = (label: string) => Number(screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent)

const skin = (overrides: Partial<GameSkin>): GameSkin => ({
  itemId: 1,
  slot: 'runner',
  skinId: 'sakura',
  name: 'Sakura Pip',
  price: 250,
  minLevel: 1,
  owned: false,
  equipped: false,
  unlocked: true,
  ...overrides,
})

const cosmetics = (overrides: Partial<GameCosmetics> = {}): GameCosmetics => ({
  signedIn: true,
  skins: [
    skin({ itemId: 1, skinId: 'sakura', name: 'Sakura Pip', owned: true, equipped: true }),
    skin({ itemId: 2, skinId: 'midnight', name: 'Midnight Pip', price: 500 }),
    // A world skin from an older shop: worlds are not picked any more, so it is not offered.
    skin({ itemId: 3, slot: 'world', skinId: 'moon', name: 'Dark Moon', price: 600 }),
  ],
  equip: vi.fn(),
  saving: false,
  shopPath: '/shop?category=skins',
  loginPath: '/login?redirect=%2Fgames%2Fdino-run',
  ...overrides,
})

describe('Dino Run', () => {
  it('opens ready to run, with the score, the best and the looks', () => {
    play({ cosmetics: cosmetics() })
    expect(playfield().querySelector('canvas')).not.toBeNull()
    expect(screen.getByText('Tap, click or press Space to run')).toBeInTheDocument()
    expect(screen.getByText('Running as Sakura Pip')).toBeInTheDocument()
    expect(stat('Score')).toBe(0)
    expect(stat('Best')).toBe(0)
    expect(stat('Level')).toBe(1)
    const look = screen.getByRole('region', { name: 'Your look' })
    expect(within(look).getByRole('radio', { name: 'Sakura Pip' })).toHaveAttribute('aria-checked', 'true')
    expect(within(look).getByRole('radio', { name: 'Midnight Pip (in the shop)' })).toBeDisabled()
    // Runners and obstacles only: the world comes with the run.
    expect(within(look).getAllByRole('radiogroup').map((group) => group.getAttribute('aria-label'))).toEqual(['Runner look', 'Obstacles look'])
    expect(within(look).queryByText(/Dark Moon/)).not.toBeInTheDocument()
  })

  it('starts the run on the first jump, once, and scores as it runs', () => {
    const { onGameStart } = play()
    press(' ')
    expect(onGameStart).toHaveBeenCalledOnce()
    press('ArrowUp')
    advance(1000)
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(stat('Score')).toBeGreaterThan(20)
    expect(screen.queryByText('Tap, click or press Space to run')).not.toBeInTheDocument()
  })

  it('ends the run on a collision, reports it once, and shows the result and the new best', () => {
    const { onGameOver } = play()
    press(' ')
    // Nobody jumps the first mound.
    advance(4000)
    expect(onGameOver).toHaveBeenCalledOnce()
    const result = onGameOver.mock.calls[0][0]
    expect(result.score).toBeGreaterThan(0)
    expect(result.metadata).toMatchObject({ meters: result.score, obstacles: 0, level: 1, seed: 2468 })
    expect(screen.getByText('New personal best!')).toBeInTheDocument()
    expect(stat('Best')).toBe(result.score)
    advance(1000)
    expect(onGameOver).toHaveBeenCalledOnce()

    // Enter starts again; the best stays.
    press('Enter')
    expect(screen.getByText('Tap, click or press Space to run')).toBeInTheDocument()
    expect(stat('Score')).toBe(0)
    expect(stat('Best')).toBe(result.score)
  })

  it('jumps the first mound when the player times it', () => {
    const { onGameOver } = play()
    press(' ')
    advance(300)
    // The first mound starts 660 units out and the world moves 330 a second: jump as it nears.
    advance(1150)
    press(' ')
    advance(1500)
    expect(onGameOver).not.toHaveBeenCalled()
    expect(stat('Score')).toBeGreaterThan(90)
  })

  it('pauses and resumes from the keyboard, and time does not run while paused', () => {
    play()
    press(' ')
    advance(500)
    press('p')
    expect(screen.getByText('Paused')).toBeInTheDocument()
    const score = stat('Score')
    advance(3000)
    expect(stat('Score')).toBe(score)
    press('Escape')
    expect(screen.queryByText('Paused')).not.toBeInTheDocument()
    advance(300)
    expect(stat('Score')).toBeGreaterThan(score)
  })

  it('has touch buttons to jump and to hold a duck, and a tap on the playfield jumps', () => {
    const { onGameStart } = play()
    const controls = screen.getByLabelText('Touch controls')
    fireEvent.pointerDown(within(controls).getByRole('button', { name: /Duck/ }), { pointerId: 1 })
    expect(onGameStart).toHaveBeenCalledOnce()
    fireEvent.pointerUp(within(controls).getByRole('button', { name: /Duck/ }), { pointerId: 1 })
    fireEvent.pointerDown(within(controls).getByRole('button', { name: /Jump/ }))
    fireEvent.pointerDown(playfield(), { pointerType: 'touch' })
    advance(200)
    expect(stat('Score')).toBeGreaterThan(0)
  })

  it('wears skins through the platform', () => {
    const owned = cosmetics()
    play({ cosmetics: owned })
    fireEvent.click(within(screen.getByRole('region', { name: 'Your look' })).getByRole('radio', { name: 'Mint Pip' }))
    expect(owned.equip).toHaveBeenCalledWith('runner', null)
  })

  it('offers no AI to a player', () => {
    play()
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'AI statistics' })).not.toBeInTheDocument()
  })

  it('lets an admin watch the AI run with a chosen strategy and speed, without reporting anything', () => {
    const { onGameStart, onGameOver } = play({ ai: createDinoAiKit })
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    const strategies = screen.getByRole('radiogroup', { name: 'AI strategy' })
    expect(within(strategies).getAllByRole('radio')).toHaveLength(3)
    fireEvent.click(within(strategies).getByRole('radio', { name: /Fast Reaction/ }))
    expect(within(strategies).getByRole('radio', { name: /Fast Reaction/ })).toHaveAttribute('aria-checked', 'true')
    for (const speed of ['0.25x', '0.5x', '1x', '2x', '4x', '8x']) expect(screen.getByRole('radio', { name: speed })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '4x' }))

    advance(8000)
    // At 4x, eight seconds is over thirty seconds of running: the AI is still going, well past the first obstacles.
    expect(stat('Score')).toBeGreaterThan(400)
    const stats = screen.getByRole('region', { name: 'AI statistics' })
    expect(within(stats).getByText('Runs').nextElementSibling).toHaveTextContent('0')
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})
