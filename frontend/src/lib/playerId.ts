/**
 * The guest identity: a random id created on first use and kept in this browser.
 *
 * It stands in for a login until accounts exist. The server uses it only to recognise this
 * player's own scores ("your best", "you" on the leaderboard) and never sends it back.
 */

export const PLAYER_ID_HEADER = 'X-Player-Id'

const STORAGE_KEY = 'cyan-arcade:player-id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let cached: string | null = null

export function getPlayerId(): string {
  if (cached) return cached

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && UUID_PATTERN.test(stored)) return (cached = stored)
  } catch {
    // Storage unavailable: fall through to an id that lasts for this visit only.
  }

  const id = createUuid()
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Not persisted; the player is still consistent until the page is closed.
  }
  return (cached = id)
}

/** Headers that identify this guest to the API. */
export function playerHeaders(): Record<string, string> {
  return { [PLAYER_ID_HEADER]: getPlayerId() }
}

function createUuid(): string {
  // randomUUID only exists on secure origins; getRandomValues works everywhere.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
