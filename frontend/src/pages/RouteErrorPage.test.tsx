import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorPage } from './RouteErrorPage'

function Broken(): never {
  throw new Error('a cabinet short-circuited')
}

function renderWithBoundary(element: React.ReactNode, path = '/') {
  const router = createMemoryRouter([{ path: '/', element, errorElement: <RouteErrorPage /> }], {
    initialEntries: [path],
  })
  return render(<RouterProvider router={router} />)
}

describe('route error page', () => {
  afterEach(() => vi.restoreAllMocks())

  it('catches an error thrown while rendering a page and offers to reload', () => {
    // React and the router both report the error they caught; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithBoundary(<Broken />)

    expect(screen.getByRole('heading', { name: 'Oops, a cabinet short-circuited' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    // The boundary replaces the whole layout, so it brings its own way home.
    expect(screen.getByRole('link', { name: 'Cyan Arcade home' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('a cabinet short-circuited')).not.toBeInTheDocument()
  })

  it('shows the friendly 404 for a path no route matches', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithBoundary(<p>Home</p>, '/nowhere')

    expect(screen.getByRole('heading', { name: /game over/i })).toBeInTheDocument()
  })
})
