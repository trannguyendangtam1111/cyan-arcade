/// <reference types="node" />
import { renderHook } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GameCosmetics, GameSkin } from '@/games/types'
import { createFlappyAi } from '../ai/flappyAi'
import { advance, createFlappyGame, flap, STEP_MS } from '../engine/flappyEngine'
import { useOutfit } from '../hooks/useOutfit'
import { drawScene, drawSkinPreview } from '../render/drawScene'
import { DEFAULT_OUTFIT, findSkin, isSkinSlot, SKIN_SLOTS, SKINS, type Outfit } from '.'

/** A 2D context that accepts every call and remembers nothing: enough to run the drawing code. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined }
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) =>
      key in target ? target[key] : key === 'createLinearGradient' ? () => gradient : () => undefined,
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

  it.each(SKIN_SLOTS)('has one free %s, the game default, which everyone has', (slot) => {
    const free = SKINS[slot].filter((skin) => skin.unlock.kind === 'free')
    expect(free).toEqual([DEFAULT_OUTFIT[slot]])
    expect(SKINS[slot][0]).toBe(DEFAULT_OUTFIT[slot])
    expect(DEFAULT_OUTFIT[slot].category).toBe('default')
  })

  it('has every bird and obstacle theme', () => {
    expect(SKINS.bird.map((skin) => skin.name)).toEqual([
      'Cyan Bird',
      'Pinky Bird',
      'Mochi Bird',
      'Bunny Bird',
      'Little Chick',
      'Cloud Bird',
      'Sakura Bird',
      'Neon Anime Bird',
      'Magical Star Bird',
      'Samurai Bird',
      'Dragon Bird',
      'Phoenix Bird',
      'Angel Bird',
      'Shadow Bird',
      'Potato Bird',
      'Toast Bird',
      'Bubble Tea Bird',
    ])
    expect(SKINS.pipes.map((skin) => skin.name)).toEqual([
      'Classic Cyan Pipe',
      'Candy Pipes',
      'Marshmallow Pipes',
      'Strawberry Pipes',
      'Sakura Towers',
      'Neon Energy Towers',
      'Magical Crystal Towers',
      'Stone Castle Towers',
      'Crystal Towers',
      'Dragon Towers',
      'Cyber Towers',
      'Neon Tech Towers',
    ])
    expect(new Set(SKINS.bird.map((skin) => skin.category))).toEqual(new Set(['default', 'cute', 'anime', 'fantasy', 'fun']))
    expect(new Set(SKINS.pipes.map((skin) => skin.category))).toEqual(new Set(['default', 'cute', 'anime', 'fantasy', 'scifi']))
    expect(SKINS.sky.length).toBeGreaterThanOrEqual(6)
  })

  it('uses only original names', () => {
    const borrowed = /pok[eé]mon|pikachu|naruto|sasuke|luffy|one piece|sanrio|kitty|disney|mickey|mario|sonic|goku|totoro|flappy/i
    for (const slot of SKIN_SLOTS) {
      for (const skin of SKINS[slot]) expect(`${skin.name} ${skin.description}`).not.toMatch(borrowed)
    }
  })

  it('finds skins by slot and id, and nothing for ids it does not know', () => {
    expect(findSkin('bird', 'sakura')?.name).toBe('Sakura Bird')
    expect(findSkin('pipes', 'sakura')?.name).toBe('Sakura Towers')
    expect(findSkin('bird', 'nope')).toBeUndefined()
    expect(isSkinSlot('pipes')).toBe(true)
    expect(isSkinSlot('hat')).toBe(false)
  })

  it('has a look for every skin the shop sells, and sells none of the free ones', () => {
    // The shop's skins come from the server's migration; each must be one the game can draw.
    const migration = join(process.cwd(), '..', 'backend', 'src', 'main', 'resources', 'db', 'migration', 'V18__add_flappy_bird_and_game_skins.sql')
    if (!existsSync(migration)) return
    const sold = [...readFileSync(migration, 'utf8').matchAll(/'GAME_SKIN',\s*\d+,\s*1,\s*1,\s*\d+,\s*'([a-z-]+)',\s*\d+,\s*'flappy-bird',\s*'([a-z]+)'\)/g)].map(
      ([, id, slot]) => ({ id, slot }),
    )
    expect(sold.length).toBe(SKINS.bird.length - 1 + SKINS.pipes.length - 1 + SKINS.sky.length - 1)
    for (const { id, slot } of sold) {
      expect(isSkinSlot(slot)).toBe(true)
      const skin = isSkinSlot(slot) ? findSkin(slot, id) : undefined
      expect(skin, `${slot}/${id}`).toBeDefined()
      expect(skin?.unlock.kind).toBe('shop')
    }
  })
})

describe('skins are only looks', () => {
  it('carry nothing that could change how the game plays', () => {
    const physics = /radius|gravity|speed|velocity|width|height|gap|hitbox|collision|score/i
    for (const slot of SKIN_SLOTS) {
      for (const skin of SKINS[slot]) {
        for (const key of Object.keys(skin.look)) expect(key, `${slot}/${skin.id}`).not.toMatch(physics)
      }
    }
  })

  it('draw a flight without changing it, and every skin flies the same', () => {
    const pilot = createFlappyAi()
    const outfits: Outfit[] = SKINS.bird.map((bird, index) => ({
      bird,
      pipes: SKINS.pipes[index % SKINS.pipes.length],
      sky: SKINS.sky[index % SKINS.sky.length],
    }))
    const flights = outfits.map((outfit) => {
      let state = flap(createFlappyGame(4242))
      const ctx = fakeContext()
      while (state.status === 'playing' && state.score < 8) {
        state = advance(state, STEP_MS * 2, (current) => pilot.getNextAction(current) === 'flap')
        const before = structuredClone(state)
        drawScene(ctx, state, outfit, state.elapsedMs / 1000)
        expect(state).toEqual(before)
      }
      return { score: state.score, flaps: state.flaps, steps: state.steps, y: state.bird.y }
    })
    for (const flight of flights) expect(flight).toEqual(flights[0])
  })

  it.each(SKIN_SLOTS)('every %s has a preview that draws', (slot) => {
    for (const skin of SKINS[slot]) expect(() => drawSkinPreview(fakeContext(), slot, skin, 64, 64, 1)).not.toThrow()
  })
})

describe('the outfit worn', () => {
  const skin = (overrides: Partial<GameSkin>): GameSkin => ({
    itemId: 1,
    slot: 'bird',
    skinId: 'pinky',
    name: 'Pinky Bird',
    price: 300,
    minLevel: 1,
    owned: true,
    equipped: true,
    unlocked: true,
    ...overrides,
  })
  const cosmetics = (skins: GameSkin[] | null, signedIn = true): GameCosmetics => ({
    signedIn,
    skins,
    equip: () => undefined,
    saving: false,
    shopPath: '/shop',
    loginPath: '/login',
  })

  it('is the game defaults for a guest, or while loading', () => {
    expect(renderHook(() => useOutfit(undefined)).result.current).toEqual(DEFAULT_OUTFIT)
    expect(renderHook(() => useOutfit(cosmetics(null, false))).result.current).toEqual(DEFAULT_OUTFIT)
  })

  it('is what the player wears in each slot', () => {
    const { result } = renderHook(() =>
      useOutfit(
        cosmetics([
          skin({}),
          skin({ itemId: 2, slot: 'pipes', skinId: 'candy', equipped: true }),
          skin({ itemId: 3, slot: 'bird', skinId: 'mochi', equipped: false }),
        ]),
      ),
    )
    expect(result.current.bird.id).toBe('pinky')
    expect(result.current.pipes.id).toBe('candy')
    expect(result.current.sky).toBe(DEFAULT_OUTFIT.sky)
  })

  it('falls back to the default for a skin this version does not know', () => {
    const { result } = renderHook(() => useOutfit(cosmetics([skin({ skinId: 'from-the-future' })])))
    expect(result.current.bird).toBe(DEFAULT_OUTFIT.bird)
  })
})
