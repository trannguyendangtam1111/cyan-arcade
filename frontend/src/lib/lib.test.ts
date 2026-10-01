import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatDuration, formatScore, formatTimeLeft } from './format'

describe('formatDuration', () => {
  it.each([
    [0, '0.0s'],
    [8_669, '8.7s'],
    [59_940, '59.9s'],
    [60_000, '1:00'],
    [125_000, '2:05'],
    [3_723_000, '1:02:03'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('formatTimeLeft', () => {
  const MINUTE = 60_000
  const HOUR = 60 * MINUTE

  it.each([
    [0, 'under a minute'],
    [59_999, 'under a minute'],
    [MINUTE, '1m'],
    [59 * MINUTE + 59_000, '59m'],
    [HOUR, '1h'],
    [5 * HOUR + 12 * MINUTE + 30_000, '5h 12m'],
    [24 * HOUR, '24h'],
  ])('formats %i ms as "%s"', (ms, expected) => {
    expect(formatTimeLeft(ms)).toBe(expected)
  })
})

describe('formatScore and formatDate', () => {
  it('groups thousands', () => {
    expect(formatScore(1234567)).toBe(new Intl.NumberFormat().format(1234567))
    expect(formatScore(42)).toBe('42')
  })

  it('shows a date with its year', () => {
    expect(formatDate('2026-09-30T10:00:00Z')).toContain('2026')
  })
})

describe('guest player id', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  // The id is cached per page load, so each test loads the module afresh.
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('creates a random id on first use and keeps returning it', async () => {
    const { getPlayerId } = await import('./playerId')

    const id = getPlayerId()

    expect(id).toMatch(UUID)
    expect(getPlayerId()).toBe(id)
    expect(window.localStorage.getItem('cyan-arcade:player-id')).toBe(id)
  })

  it('reuses the id stored by an earlier visit', async () => {
    window.localStorage.setItem('cyan-arcade:player-id', '0eec4e83-12db-41a4-9164-016466722a9f')
    const { getPlayerId, playerHeaders } = await import('./playerId')

    expect(getPlayerId()).toBe('0eec4e83-12db-41a4-9164-016466722a9f')
    expect(playerHeaders()).toEqual({ 'X-Player-Id': '0eec4e83-12db-41a4-9164-016466722a9f' })
  })

  it('replaces a stored value that is not a valid id', async () => {
    window.localStorage.setItem('cyan-arcade:player-id', 'tampered')
    const { getPlayerId } = await import('./playerId')

    expect(getPlayerId()).toMatch(UUID)
  })

  it('still produces an id where randomUUID and storage are unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    // Browsers only expose randomUUID on secure origins.
    const randomUUID = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true })
    try {
      const { getPlayerId } = await import('./playerId')

      const id = getPlayerId()

      expect(id).toMatch(UUID)
      expect(getPlayerId()).toBe(id)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true, writable: true })
    }
  })
})
