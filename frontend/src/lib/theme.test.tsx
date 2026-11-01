import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from '@/components/ThemeToggle'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import themeInit from '../../public/theme-init.js?raw'
import { currentTheme, initTheme, resolveTheme, setTheme, storedTheme, THEME_KEY } from './theme'

/** A system that prefers dark (or not), as `matchMedia` reports it. */
function systemPrefers(dark: boolean) {
  const listeners: ((event: { matches: boolean }) => void)[] = []
  const query = { matches: dark, addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener) }
  vi.stubGlobal('matchMedia', () => query)
  return {
    change(matches: boolean) {
      query.matches = matches
      listeners.forEach((listener) => listener({ matches }))
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('the theme', () => {
  it('is the player\'s choice, else the system\'s, else light', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('ignores anything but a known value in storage', () => {
    window.localStorage.setItem(THEME_KEY, 'sepia')
    expect(storedTheme()).toBeNull()
    window.localStorage.setItem(THEME_KEY, 'dark')
    expect(storedTheme()).toBe('dark')
  })

  it('follows the system the first time, and as it changes, until the player chooses', () => {
    const system = systemPrefers(true)
    initTheme()
    expect(currentTheme()).toBe('dark')
    system.change(false)
    expect(currentTheme()).toBe('light')

    setTheme('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
    system.change(false)
    expect(currentTheme()).toBe('dark')
  })

  it('is kept for the next visit', () => {
    systemPrefers(false)
    setTheme('dark')
    delete document.documentElement.dataset.theme
    initTheme()
    expect(currentTheme()).toBe('dark')
  })

  it('is set before the first paint by the same rule', () => {
    const run = () => new Function(themeInit)()
    systemPrefers(true)
    run()
    expect(document.documentElement.dataset.theme).toBe('dark')
    window.localStorage.setItem(THEME_KEY, 'light')
    run()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('the theme switch', () => {
  it('turns the whole page dark and back, and keeps the choice', () => {
    systemPrefers(false)
    initTheme()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the light theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('sits in the header of every page, and the theme stays as the player moves around', async () => {
    systemPrefers(false)
    initTheme()
    mockApi()
    renderRoute('/')
    const header = within(screen.getByRole('banner'))
    fireEvent.click(header.getByRole('button', { name: 'Switch to the dark theme' }))

    fireEvent.click(within(screen.getAllByRole('navigation', { name: 'Primary' })[0]).getByRole('link', { name: 'Shop' }))
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('button', { name: 'Switch to the light theme' })).toBeInTheDocument()
  })
})
