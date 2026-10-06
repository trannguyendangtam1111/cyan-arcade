import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const value = (scope: ReturnType<typeof within>, label: string) =>
  scope.getByText(label, { selector: 'dt' }).closest('div')!.querySelector('dd')

const paths = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname)

describe('the admin dashboard', () => {
  it('shows the arcade at a glance', async () => {
    mockApi({ user: admin })
    renderRoute('/admin')

    const stats = within(await screen.findByRole('region', { name: 'The arcade at a glance' }))
    expect(value(stats, 'Total users')).toHaveTextContent('42')
    expect(value(stats, 'Active users (7 days)')).toHaveTextContent('17')
    expect(value(stats, 'New users today')).toHaveTextContent('3')
    expect(value(stats, 'Games played')).toHaveTextContent('1,234+56 today')
    expect(value(stats, 'Packs opened')).toHaveTextContent('321+12 today')
    expect(value(stats, 'Cards collected')).toHaveTextContent('3,210+120 today')
    expect(value(stats, 'Coins in circulation')).toHaveTextContent('98,765')
  })

  it('gives a player coins after a search, an amount, a reason and a confirmation', async () => {
    const fetchSpy = mockApi({ user: admin })
    renderRoute('/admin')

    const grant = within(await screen.findByRole('region', { name: 'Give coins' }))
    expect(grant.getByRole('button', { name: 'Choose a player first' })).toBeDisabled()

    await userEvent.type(grant.getByRole('searchbox', { name: 'Find a player' }), 'pix')
    await userEvent.click(grant.getByRole('button', { name: 'Find' }))
    const found = within(await grant.findByRole('list', { name: 'Players found' }))
    expect(found.getAllByRole('button')).toHaveLength(2)
    await userEvent.click(found.getByRole('button', { name: /pixel/ }))

    await userEvent.clear(grant.getByRole('spinbutton', { name: 'Coins' }))
    await userEvent.type(grant.getByRole('spinbutton', { name: 'Coins' }), '250')
    await userEvent.type(grant.getByRole('textbox', { name: 'Reason' }), 'Tournament prize')
    await userEvent.click(grant.getByRole('button', { name: 'Give coins to pixel' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Give 250 coins to pixel?' }))
    expect(dialog.getByText(/Tournament prize/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Give coins' }))

    expect(await grant.findByRole('status')).toHaveTextContent('Done: pixel received 250 coins and now has 250.')
    const call = fetchSpy.mock.calls.find(([input]) => String(input) === '/api/admin/users/7/coins')
    const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ amount: 250, reason: 'Tournament prize' })
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('refuses amounts outside the allowed range before asking the server', async () => {
    mockApi({ user: admin })
    renderRoute('/admin')

    const grant = within(await screen.findByRole('region', { name: 'Give coins' }))
    await userEvent.clear(grant.getByRole('spinbutton', { name: 'Coins' }))
    await userEvent.type(grant.getByRole('spinbutton', { name: 'Coins' }), '0')

    expect(grant.getByText('Give between 1 and 100,000 coins.')).toBeInTheDocument()
    expect(grant.getByRole('spinbutton', { name: 'Coins' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('is not there for a player, who asks the server for none of it', async () => {
    const fetchSpy = mockApi({ user: pixel })
    renderRoute('/admin')

    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Give coins' })).not.toBeInTheDocument()
    expect(paths(fetchSpy)).not.toContain('/api/admin/stats')
  })
})
