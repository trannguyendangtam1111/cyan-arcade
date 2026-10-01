/**
 * The games played most recently on this device, newest first, kept in `localStorage`.
 *
 * Like the in-game best score, this is a convenience of the device rather than a record of the
 * account: it works for guests, and the account's real history lives on the profile page.
 */

const STORAGE_KEY = 'cyan-arcade:recent-games'
const MAX_RECENT = 6

export function getRecentGameSlugs(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((slug): slug is string => typeof slug === 'string').slice(0, MAX_RECENT)
  } catch {
    // Storage unavailable or holding something else: there is simply nothing recent to show.
    return []
  }
}

/** Moves a game to the front of the list. */
export function recordRecentGame(slug: string): void {
  const recent = [slug, ...getRecentGameSlugs().filter((other) => other !== slug)].slice(0, MAX_RECENT)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
