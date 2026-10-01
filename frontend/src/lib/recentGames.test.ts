import { describe, expect, it } from 'vitest'
import { getRecentGameSlugs, recordRecentGame } from './recentGames'

describe('recent games', () => {
  it('is empty on a device nobody has played on', () => {
    expect(getRecentGameSlugs()).toEqual([])
  })

  it('lists games newest first', () => {
    recordRecentGame('snake')
    recordRecentGame('tetris')

    expect(getRecentGameSlugs()).toEqual(['tetris', 'snake'])
  })

  it('moves a game played again to the front instead of listing it twice', () => {
    recordRecentGame('snake')
    recordRecentGame('tetris')
    recordRecentGame('snake')

    expect(getRecentGameSlugs()).toEqual(['snake', 'tetris'])
  })

  it('remembers only the last six', () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) recordRecentGame(slug)

    expect(getRecentGameSlugs()).toEqual(['h', 'g', 'f', 'e', 'd', 'c'])
  })

  it.each(['not json', '{"snake":true}', '"snake"', 'null'])('ignores unusable stored data: %s', (stored) => {
    window.localStorage.setItem('cyan-arcade:recent-games', stored)

    expect(getRecentGameSlugs()).toEqual([])
    // And recording still works afterwards.
    recordRecentGame('snake')
    expect(getRecentGameSlugs()).toEqual(['snake'])
  })

  it('keeps only the entries that are slugs', () => {
    window.localStorage.setItem('cyan-arcade:recent-games', JSON.stringify(['snake', 42, null, 'tetris']))

    expect(getRecentGameSlugs()).toEqual(['snake', 'tetris'])
  })
})
