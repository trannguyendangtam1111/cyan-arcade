import { describe, expect, it } from 'vitest'
import { createBrickAi } from '../ai/brickAi'
import type { PowerUpKind } from '../types/brickTypes'
import { advance, createBrickBreakerGame } from './brickEngine'
import { BY_RARITY, DROP_TABLES, dropTableFor, POWER_UPS, rollDrop, TIMED_POWER_UPS } from './powerUps'
import { CLEAR_BONUS } from './scoring'

/** What a table gives over evenly spread rolls: exactly its weights. */
function distribution(table: (typeof DROP_TABLES)['early'], guaranteed = false, samples = 100_000) {
  const counts: Record<string, number> = {}
  for (let i = 0; i < samples; i++) {
    const kind = rollDrop(table, (i + 0.5) / samples, guaranteed) ?? 'none'
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}

describe('the drop tables', () => {
  it.each(Object.entries(DROP_TABLES))('%s adds up to a thousand', (_, table) => {
    expect(table.none + table.common + table.uncommon + table.rare + table.veryRare).toBe(1000)
  })

  it('drop a little more, and better, as the game gets harder', () => {
    const { early, mid, late } = DROP_TABLES
    expect(early.none).toBeGreaterThan(mid.none)
    expect(mid.none).toBeGreaterThan(late.none)
    expect(late.rare).toBeGreaterThan(early.rare)
    expect(late.veryRare).toBeGreaterThan(early.veryRare)
    // About a fifth of bricks: 18%, 20%, 23%.
    expect([early, mid, late].map((table) => 1000 - table.none)).toEqual([180, 200, 230])
    expect([1, 2, 3, 5, 6, 8, 9, 50].map((level) => dropTableFor(level))).toEqual([early, early, mid, mid, late, late, late, late])
  })

  it('give each rarity exactly its share, split evenly within it', () => {
    const table = DROP_TABLES.early
    const counts = distribution(table)
    expect(counts.none / 100).toBeCloseTo(table.none, 0)
    const share = (kinds: PowerUpKind[]) => kinds.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0) / 100
    expect(share(BY_RARITY.common)).toBeCloseTo(table.common, 0)
    expect(share(BY_RARITY.uncommon)).toBeCloseTo(table.uncommon, 0)
    expect(share(BY_RARITY.rare)).toBeCloseTo(table.rare, 0)
    expect(share(BY_RARITY.veryRare)).toBeCloseTo(table.veryRare, 0)
    for (const kind of BY_RARITY.common) expect((counts[kind] ?? 0) / 100).toBeCloseTo(table.common / 3, 0)
  })

  it('always give a special brick something, at the usual proportions', () => {
    const counts = distribution(DROP_TABLES.mid, true)
    expect(counts.none).toBeUndefined()
    expect((counts.extraLife ?? 0) / 100_000).toBeCloseTo(3 / 200, 3)
  })

  it('cover every power-up, each with a label, a glyph and a rarity', () => {
    const listed = Object.values(BY_RARITY).flat().sort()
    expect(listed).toEqual(Object.keys(POWER_UPS).sort())
    for (const definition of Object.values(POWER_UPS)) {
      expect(definition.label.length).toBeGreaterThan(1)
      expect(definition.icon.length).toBeGreaterThan(0)
      expect(BY_RARITY[definition.rarity]).toContain(definition.kind)
    }
    for (const kind of TIMED_POWER_UPS) expect(POWER_UPS[kind].durationMs).toBeGreaterThanOrEqual(6000)
    expect(POWER_UPS.extraLife.rarity).toBe('veryRare')
    expect(POWER_UPS.fireball.durationMs).toBeLessThanOrEqual(8000)
  })
})

describe('drops in play', () => {
  it('come from about a fifth of the bricks destroyed, and every kind turns up', () => {
    let destroyed = 0
    let dropped = 0
    const seen = new Set<string>()
    for (const seed of [3, 4, 5]) {
      const ai = createBrickAi()
      let state = createBrickBreakerGame(seed)
      for (let i = 0; i < 8 * 60 * 60 && state.level <= 6 && state.phase !== 'over'; i++) {
        state = advance(state, 1000 / 60, (current) => ai.getNextAction(current))
        for (const event of state.events) {
          if (event.type === 'brickDestroyed') destroyed++
          if (event.type === 'drop') {
            dropped++
            seen.add(event.kind)
          }
        }
      }
    }
    expect(destroyed).toBeGreaterThan(500)
    // Specials always drop, so a little over the tables' 18–23%.
    expect(dropped / destroyed).toBeGreaterThan(0.15)
    expect(dropped / destroyed).toBeLessThan(0.3)
    expect(seen.size).toBeGreaterThanOrEqual(8)
  })

  it('never let bonuses outweigh the bricks', () => {
    // The largest bonus a level can give against what its bricks are worth.
    const largest = CLEAR_BONUS.maxBase + 5 * CLEAR_BONUS.perLife + CLEAR_BONUS.maxCombo + CLEAR_BONUS.maxTime + CLEAR_BONUS.perfect
    expect(largest).toBe(4100)
    expect(largest).toBeLessThan(40 * 100 * 2.5)
  })
})
