import { describe, expect, it } from 'vitest'
import { catalogFixture } from '@/test/mockApi'
import { gameModules, toGameDefinition } from './registry'

// Invariants every registered game must satisfy. These run against the real registry,
// so a newly added game is checked automatically.
describe('game registry', () => {
  it('has unique slugs', () => {
    const slugs = gameModules.map((module) => module.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it.each(gameModules.map((module) => [module.slug, module] as const))(
    '%s has a URL-safe slug and at least one control scheme',
    (_, module) => {
      expect(module.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(module.controls.keyboard || module.controls.touch).toBe(true)
    },
  )
})

describe('toGameDefinition', () => {
  it('maps a catalog entry to the hub definition', () => {
    expect(toGameDefinition(catalogFixture[0])).toEqual({
      slug: 'snake',
      name: 'Snake',
      description: 'Guide a hungry snake around the board.',
      category: 'ARCADE',
      accentColor: '#22c55e',
      thumbnail: '/thumbnails/snake.svg',
      featured: true,
      module: gameModules.find((module) => module.slug === 'snake'),
    })
  })
})
