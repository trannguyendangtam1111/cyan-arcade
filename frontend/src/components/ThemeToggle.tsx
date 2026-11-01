import { Moon, Sun } from 'lucide-react'
import { setTheme, useTheme } from '@/lib/theme'

/** Light or dark, for the whole arcade: a choice kept in this browser. */
export function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      data-theme-toggle={theme}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-soft ring-1 ring-line transition-all hover:text-ink active:scale-95"
    >
      {theme === 'dark' ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  )
}
