import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

// These values only ever reach the in-memory fake API above; no real account is involved.
const PASSWORD = 'correct-horse-battery'

async function fillIn(username: string, password: string) {
  await userEvent.type(await screen.findByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

/** What was sent to an auth endpoint, as [path, body]. */
function authRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .filter(([input, init]) => init?.method === 'POST' && String(input).startsWith('/api/auth/'))
    .map(([input, init]) => [String(input), JSON.parse(String(init?.body ?? 'null'))])
}

/** The site header. A page's own <header> is also reported as a banner, so take the first. */
const header = () => within(screen.getAllByRole('banner')[0])

describe('logging in', () => {
  it('signs the player in and takes them to their profile', async () => {
    const fetchSpy = mockApi({ accounts: { pixel: PASSWORD } })
    renderRoute('/login')

    await fillIn('pixel', PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'pixel' })).toBeInTheDocument()
    expect(authRequests(fetchSpy)).toEqual([['/api/auth/login', { username: 'pixel', password: PASSWORD }]])
    // The header now shows the player instead of a "Log in" button.
    expect(header().getByRole('link', { name: 'Your profile, pixel' })).toHaveAttribute('href', '/profile')
    expect(header().queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('explains a wrong password without saying which part was wrong, and stays on the page', async () => {
    mockApi({ accounts: { pixel: PASSWORD } })
    renderRoute('/login')

    await fillIn('pixel', 'not-the-password')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back!' })).toBeInTheDocument()
    expect(header().getByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })

  it('says so when the server refuses further attempts for a while', async () => {
    mockApi({
      accounts: { pixel: PASSWORD },
      handlers: [
        ({ path, method }) =>
          method === 'POST' && path === '/api/auth/login'
            ? mockProblem(429, 'TOO_MANY_LOGIN_ATTEMPTS', 'Too many failed attempts.')
            : undefined,
      ],
    })
    renderRoute('/login')

    await fillIn('pixel', PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many failed attempts. Please wait a few minutes')
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back!' })).toBeInTheDocument()
  })

  it('returns to the page that asked for the login', async () => {
    mockApi({ accounts: { pixel: PASSWORD } })
    renderRoute('/login?redirect=%2Fleaderboard')

    await fillIn('pixel', PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Leaderboard' })).toBeInTheDocument()
  })

  it('ignores a redirect that points to another site', async () => {
    mockApi({ accounts: { pixel: PASSWORD } })
    renderRoute('/login?redirect=%2F%2Fevil.example%2Fphish')

    await fillIn('pixel', PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
  })

  it('sends someone who is already signed in straight to their profile', async () => {
    mockApi({ user: pixel })
    renderRoute('/login')

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('reports an unreachable server', async () => {
    const fetchSpy = mockApi()
    renderRoute('/login')
    await fillIn('pixel', PASSWORD)

    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server")
  })

  it('links to registration, keeping where to go afterwards', async () => {
    mockApi()
    renderRoute('/login?redirect=%2Fgames%2Fsnake')

    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?redirect=%2Fgames%2Fsnake',
    )
  })
})

describe('registering', () => {
  it('creates the account, signs the player in and shows their profile', async () => {
    const fetchSpy = mockApi()
    renderRoute('/register')
    expect(await screen.findByRole('heading', { level: 1, name: 'Join the arcade' })).toBeInTheDocument()

    await fillIn('new_player', PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'new_player' })).toBeInTheDocument()
    expect(authRequests(fetchSpy)).toEqual([['/api/auth/register', { username: 'new_player', password: PASSWORD }]])
  })

  it('asks only for a username and a password', async () => {
    mockApi()
    renderRoute('/register')

    await screen.findByLabelText('Username')
    expect(screen.getAllByRole('textbox')).toHaveLength(1) // the username; password fields are not "textbox"
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  it('says so next to the field when the username is taken', async () => {
    mockApi({ accounts: { pixel: PASSWORD } })
    renderRoute('/register')

    await fillIn('Pixel', PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(/already taken/)
    expect(screen.getByLabelText('Username')).toBeInvalid()
  })

  it('shows what the server says is wrong with a field', async () => {
    mockApi()
    renderRoute('/register')
    // Remove the browser-side length check to reach the server's own validation.
    const password = await screen.findByLabelText('Password')
    password.removeAttribute('minlength')

    await fillIn('new_player', 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Password must be 8 to 72 characters long.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Join the arcade' })).toBeInTheDocument()
  })

  it('checks the format in the browser before sending anything', async () => {
    const fetchSpy = mockApi()
    renderRoute('/register')

    await fillIn('ab', PASSWORD) // too short
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByLabelText('Username')).toBeInvalid()
    expect(authRequests(fetchSpy)).toEqual([])
  })
})
