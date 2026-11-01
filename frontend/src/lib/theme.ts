import { useSyncExternalStore } from 'react'

/**
 * The arcade's light or dark theme, one for every page. The theme in effect is the `data-theme`
 * attribute of the root element, which the CSS reads (styles/index.css, styles/theme-dark.css):
 * there is no other copy of it. The player's choice is kept in this browser; without one, the
 * system's preference decides and is followed when it changes. `public/theme-init.js` applies the
 * same rule before the first paint, so a page never flashes in the other theme.
 */

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'cyan-arcade:theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The player's own choice, if they made one. */
export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

/** The theme to use: the player's choice, else the system's preference, else light. */
export function resolveTheme(stored: Theme | null, prefersDark: boolean): Theme {
  return stored ?? (prefersDark ? 'dark' : 'light')
}

/** The theme in effect, as the page shows it. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

const listeners = new Set<() => void>()

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  listeners.forEach((listener) => listener())
}

/** Applies the stored choice or the system's preference (what theme-init.js did before React). */
export function initTheme() {
  apply(resolveTheme(storedTheme(), systemPrefersDark()))
  if (typeof window.matchMedia === 'function') {
    // Without a choice of their own, the player gets the system's theme as it changes. The query is
    // kept so that it (and its listener) lives as long as the page.
    systemQuery = window.matchMedia(DARK_QUERY)
    systemQuery.addEventListener?.('change', (event) => {
      if (storedTheme() === null) apply(event.matches ? 'dark' : 'light')
    })
  }
}

let systemQuery: MediaQueryList | null = null

/** The player's choice: applied at once, everywhere, and kept for later visits. */
export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Not kept; it still applies until the page is closed.
  }
  apply(theme)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The theme in effect, re-rendering when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light')
}
