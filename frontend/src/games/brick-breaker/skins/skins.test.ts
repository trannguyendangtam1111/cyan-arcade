/// <reference types="node" />
import { renderHook } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GameCosmetics, GameSkin } from '@/games/types'
import { createBrickAi } from '../ai/brickAi'
import { advance, createBrickBreakerGame } from '../engine/brickEngine'
import { Juice } from '../effects/juice'
import { useOutfit } from '../hooks/useOutfit'
import { drawScene, drawSkinPreview } from '../render/drawScene'
import { DEFAULT_OUTFIT, findSkin, isSkinSlot, SKIN_SLOTS, SKINS, type Outfit } from '.'

/** A 2D context that accepts every call and remembers nothing: enough to run the drawing code. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined }
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key in target) return target[key]
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 })
      return () => undefined
    },
    set: (target, key, value) => {
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

describe('the skin registry', () => {
  it.each(SKIN_SLOTS)('has unique %s ids', (slot) => {
    const ids = SKINS[slot].map((skin) => skin.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it.each(SKIN_SLOTS)('has one free %s, the default, which everyone has', (slot) => {
    expect(SKINS[slot].filter((skin) => skin.unlock.kind === 'free')).toEqual([DEFAULT_OUTFIT[slot]])
    expect(SKINS[slot][0]).toBe(DEFAULT_OUTFIT[slot])
  })

  it('has every paddle, ball and brick theme', () => {
    expect(SKINS.paddle.map((skin) => skin.id)).toEqual(['cyan', 'candy', 'neon', 'sakura', 'galaxy', 'dragon', 'cyber', 'mochi'])
    expect(SKINS.ball.map((skin) => skin.name)).toEqual(['Cyan Orb', 'Ember Ball', 'Ice Ball', 'Plasma Ball', 'Star Ball', 'Bubble Ball', 'Galaxy Ball'])
    expect(SKINS.bricks.map((skin) => skin.name)).toEqual(['Arcade Worlds', 'Candy Bricks', 'Neon Bricks', 'Sakura Bricks', 'Space Bricks', 'Fantasy Bricks'])
  })

  it('uses only original names', () => {
    const borrowed = /arkanoid|breakout|pok[eé]mon|pikachu|naruto|luffy|sanrio|kitty|disney|mario|sonic|goku|atari/i
    for (const slot of SKIN_SLOTS) for (const skin of SKINS[slot]) expect(`${skin.name} ${skin.description}`).not.toMatch(borrowed)
  })

  it('finds skins by slot and id', () => {
    expect(findSkin('ball', 'plasma')?.name).toBe('Plasma Ball')
    expect(findSkin('bricks', 'candy')?.name).toBe('Candy Bricks')
    expect(findSkin('paddle', 'nope')).toBeUndefined()
    expect(isSkinSlot('bird')).toBe(false)
  })

  it('has a look for every skin the shop sells, and sells none of the free ones', () => {
    const migration = join(process.cwd(), '..', 'backend', 'src', 'main', 'resources', 'db', 'migration', 'V19__add_brick_breaker.sql')
    if (!existsSync(migration)) return
    const sold = [...readFileSync(migration, 'utf8').matchAll(/'GAME_SKIN',\s*\d+,\s*1,\s*1,\s*\d+,\s*'([a-z-]+)',\s*\d+,\s*'brick-breaker',\s*'([a-z]+)'\)/g)].map(([, id, slot]) => ({ id, slot }))
    expect(sold).toHaveLength(SKINS.paddle.length - 1 + SKINS.ball.length - 1 + SKINS.bricks.length - 1)
    for (const { id, slot } of sold) {
      const skin = isSkinSlot(slot) ? findSkin(slot, id) : undefined
      expect(skin, `${slot}/${id}`).toBeDefined()
      expect(skin?.unlock.kind).toBe('shop')
    }
  })
})

describe('skins are only looks', () => {
  it('carry nothing that could change how the game plays', () => {
    const physics = /width|radius|size|speed|velocity|hp|durab|score|points|drop|chance|power/i
    for (const slot of SKIN_SLOTS) {
      for (const skin of SKINS[slot]) for (const key of Object.keys(skin.look)) expect(key, `${slot}/${skin.id}`).not.toMatch(physics)
    }
  })

  it('draw a game without changing it, and every outfit plays the same', () => {
    const outfits: Outfit[] = SKINS.paddle.map((paddle, i) => ({ paddle, ball: SKINS.ball[i % SKINS.ball.length], bricks: SKINS.bricks[i % SKINS.bricks.length] }))
    const games = outfits.map((outfit) => {
      const pilot = createBrickAi()
      const juice = new Juice()
      const ctx = fakeContext()
      let state = createBrickBreakerGame(808)
      for (let i = 0; i < 20 * 60 && state.phase !== 'over'; i++) {
        state = advance(state, 1000 / 60, (current) => pilot.getNextAction(current))
        const before = structuredClone(state)
        juice.absorb(state.events, outfit, state)
        juice.update(1000 / 60, state)
        drawScene(ctx, state, outfit, juice, i / 60)
        expect(state).toEqual(before)
      }
      return { score: state.score, bricks: state.bricks.length, steps: state.steps, stats: state.stats }
    })
    for (const game of games) expect(game).toEqual(games[0])
  })

  it.each(SKIN_SLOTS)('every %s has a preview that draws', (slot) => {
    for (const skin of SKINS[slot]) expect(() => drawSkinPreview(fakeContext(), slot, skin, 96, 56, 1)).not.toThrow()
  })
})

describe('the outfit worn', () => {
  const skin = (overrides: Partial<GameSkin>): GameSkin => ({ itemId: 1, slot: 'paddle', skinId: 'candy', name: 'Candy Paddle', price: 300, minLevel: 1, owned: true, equipped: true, unlocked: true, ...overrides })
  const cosmetics = (skins: GameSkin[] | null): GameCosmetics => ({ signedIn: true, skins, equip: () => undefined, saving: false, shopPath: '/shop', loginPath: '/login' })

  it('is the defaults with nothing worn, or while loading', () => {
    expect(renderHook(() => useOutfit(undefined)).result.current).toEqual(DEFAULT_OUTFIT)
    expect(renderHook(() => useOutfit(cosmetics(null))).result.current).toEqual(DEFAULT_OUTFIT)
  })

  it('is what is worn in each slot, with the default for an unknown skin', () => {
    const { result } = renderHook(() =>
      useOutfit(cosmetics([skin({}), skin({ itemId: 2, slot: 'ball', skinId: 'plasma' }), skin({ itemId: 3, slot: 'bricks', skinId: 'from-the-future' })])),
    )
    expect(result.current.paddle.id).toBe('candy')
    expect(result.current.ball.id).toBe('plasma')
    expect(result.current.bricks).toBe(DEFAULT_OUTFIT.bricks)
  })
})
