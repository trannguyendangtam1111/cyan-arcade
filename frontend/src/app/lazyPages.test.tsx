import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

// The shop's chunk cannot be fetched (a deploy replaced it, the network dropped).
vi.mock('@/pages/ShopPage', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

describe('pages in chunks of their own', () => {
  it('keep the header and show a loading state while the page arrives', async () => {
    mockApi()
    renderRoute('/leaderboard')

    expect(screen.getByRole('link', { name: 'Cyan Arcade home' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(await screen.findByRole('heading', { level: 1, name: 'Leaderboard' })).toBeInTheDocument()
  })

  it('show the error page, with a reload, when a page cannot be fetched', async () => {
    // React and the router both report the error they caught; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi()
    renderRoute('/shop')

    expect(await screen.findByRole('heading', { name: 'Oops, a cabinet short-circuited' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('leave the pages in the main chunk to render at once', () => {
    mockApi()
    renderRoute('/games')

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
