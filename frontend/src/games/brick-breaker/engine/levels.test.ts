import { describe, expect, it } from 'vitest'
import { createBrickAi } from '../ai/brickAi'
import { GRID, PADDLE } from './arena'
import { advance, createBrickBreakerGame, LEVEL_CLEAR_MS } from './brickEngine'
import { countBricks, ENDLESS, handcraftedBrickCounts, HANDCRAFTED_LEVELS, KIND_OF, levelDefinition } from './levels'
import { CLEAR_BONUS, levelBonus } from './scoring'

const handcrafted = Array.from({ length: HANDCRAFTED_LEVELS }, (_, i) => levelDefinition(i + 1, 0))
const kinds = (rows: readonly string[]) => [...rows.join('')].map((cell) => KIND_OF[cell]).filter(Boolean)

describe('the handcrafted levels', () => {
  it('are the eight named levels', () => {
    expect(handcrafted.map((level) => level.name)).toEqual(['Cute Sakura', 'Kawaii Candy', 'Anime Café', 'Magical Galaxy', 'Kitsune Shrine', 'Cyber Anime', 'Fantasy Dragon', 'Dark Moon'])
  })

  it.each(handcrafted.map((level) => [level.name, level] as const))('%s is a valid layout', (_, level) => {
    for (const row of level.rows) {
      expect(row).toHaveLength(GRID.columns)
      expect(row).toMatch(/^[.123S]+$/)
    }
    // Bricks stay well clear of the paddle.
    expect(GRID.top + level.rows.length * GRID.cellHeight).toBeLessThan(PADDLE.y - 150)
    expect(countBricks(level.rows)).toBeGreaterThanOrEqual(30)
    // Every level has a special brick to find.
    expect(kinds(level.rows)).toContain('special')
  })

  it('have the brick counts the server checks runs against', () => {
    // The same list is pinned in the backend's BrickBreakerRunRulesTests: change both together.
    expect(handcraftedBrickCounts()).toEqual([44, 40, 46, 46, 58, 48, 58, 80])
  })

  it('introduce tougher bricks a level at a time', () => {
    const firstWith = (kind: string) => handcrafted.findIndex((level) => kinds(level.rows).includes(kind as never)) + 1
    expect(firstWith('tough')).toBe(2)
    expect(firstWith('armored')).toBe(4)
    expect(kinds(handcrafted[0].rows).every((kind) => kind === 'normal' || kind === 'special')).toBe(true)
    // The last level is the toughest: the most hits to clear.
    const hits = handcrafted.map((level) => kinds(level.rows).reduce((sum, kind) => sum + (kind === 'tough' ? 2 : kind === 'armored' ? 3 : 1), 0))
    expect(Math.max(...hits)).toBe(hits.at(-1))
  })

  it('speed up a little early and more later, without ever getting silly', () => {
    const speeds = handcrafted.map((level) => level.speed)
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1])
    expect(speeds[1] - speeds[0]).toBeLessThanOrEqual(25)
    expect(speeds.at(-1)).toBeLessThanOrEqual(ENDLESS.maxSpeed)
  })

  it.each(handcrafted.map((level) => [level.level, level.name] as const))(
    'level %i (%s) is clearable: a good player clears it in reasonable time without getting stuck',
    (level) => {
      const ai = createBrickAi()
      let state = advance(createBrickBreakerGame(31 + level, level), 1, () => ({ launch: true }))
      for (let i = 0; i < 6 * 60 * 60 && state.phase !== 'cleared' && state.phase !== 'over'; i++) {
        state = advance(state, 1000 / 60, (current) => ai.getNextAction(current))
      }
      expect(state.phase).toBe('cleared')
      expect(state.levelMs).toBeLessThan(6 * 60_000)
    },
  )
})

describe('Endless', () => {
  it('starts after the handcrafted levels and is the same for the same run', () => {
    expect(ENDLESS.firstLevel).toBe(9)
    expect(levelDefinition(9, 1234)).toEqual(levelDefinition(9, 1234))
    expect(levelDefinition(9, 1234).rows).not.toEqual(levelDefinition(9, 4321).rows)
    expect(levelDefinition(10, 1234).rows).not.toEqual(levelDefinition(9, 1234).rows)
  })

  it('keeps within its hard limits however deep it goes', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const level of [9, 10, 14, 20, 40, 100, 1000]) {
        const definition = levelDefinition(level, seed * 7919)
        const count = countBricks(definition.rows)
        expect(count).toBeGreaterThanOrEqual(ENDLESS.minBricks)
        expect(count).toBeLessThanOrEqual(ENDLESS.maxBricks)
        expect(definition.rows.length).toBeLessThanOrEqual(ENDLESS.maxRows)
        expect(definition.speed).toBeLessThanOrEqual(ENDLESS.maxSpeed)
        for (const row of definition.rows) expect(row).toMatch(/^[.123S]{10}$/)
        const all = kinds(definition.rows)
        expect(all.filter((kind) => kind === 'armored').length / all.length).toBeLessThanOrEqual(ENDLESS.armoredShare.max + 0.2)
      }
    }
  })

  it('gets harder gradually, then levels off', () => {
    const speeds = [9, 10, 11, 15, 20, 40, 80].map((level) => levelDefinition(level, 1).speed)
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1])
    expect(speeds.at(-1)).toBe(ENDLESS.maxSpeed)
  })

  it('is reached after level 8, with the clear bonus capped', () => {
    let state = createBrickBreakerGame(5, 8)
    state = { ...state, bricks: [], phase: 'playing', started: true }
    state = advance(state, 20)
    expect(state.phase).toBe('cleared')
    expect(state.lastBonus!.base).toBe(CLEAR_BONUS.base + 7 * CLEAR_BONUS.basePerLevel)
    expect(levelBonus(50, 3, 10, 30, 60, true).base).toBe(CLEAR_BONUS.maxBase)
    for (let i = 0; i < 4; i++) state = advance(state, LEVEL_CLEAR_MS / 3)
    expect(state.level).toBe(9)
    expect(state.levelName).toBe('Endless 1')
  })
})
