import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

// Every purchase sent with the same request id, as a retry after a lost reply would be: the server
// answers the second one as a repeat of the first.
vi.mock('@/api/economy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/economy')>()),
  newRequestId: () => 'the-same-request',
}))

const item = async (name: string) => within(await screen.findByRole('article', { name }))

describe('a purchase the server has already made', () => {
  it('says it went through before and that no more coins were taken', async () => {
    mockApi({ user: pixel, coins: 1240 })
    renderRoute('/shop')

    for (let attempt = 0; attempt < 2; attempt++) {
      await userEvent.click((await item('Extra Pack')).getByRole('button', { name: 'Buy Extra Pack for 100 coins' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Buy Extra Pack?' })).getByRole('button', { name: 'Buy it' }))
      await screen.findByRole('status')
    }

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(
      'That purchase already went through: Extra Pack is yours, and no more coins were taken. You have 1,140 coins left.',
    )
    expect(status).not.toHaveTextContent('Purchased!')
  })

  it('tells a player whose answer was lost that trying again never charges twice, then what happened', async () => {
    const fetchSpy = mockApi({ user: pixel, coins: 1240 })
    const answer = fetchSpy.getMockImplementation()!
    let lost = false
    // The server takes the coins, but its answer never arrives.
    fetchSpy.mockImplementation(async (input, init) => {
      if (!lost && String(input).endsWith('/api/shop/purchases') && init?.method === 'POST') {
        lost = true
        await answer(input, init)
        throw new TypeError('Failed to fetch')
      }
      return answer(input, init)
    })
    renderRoute('/shop')

    await userEvent.click((await item('Extra Pack')).getByRole('button', { name: 'Buy Extra Pack for 100 coins' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Buy Extra Pack?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Buy it' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "Couldn't reach the server, so the purchase may not have gone through. Try again: the same purchase is never charged twice.",
    )
    expect(dialog.getByRole('alert')).not.toHaveTextContent('Nothing was charged')

    await userEvent.click(dialog.getByRole('button', { name: 'Buy it' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'That purchase already went through: Extra Pack is yours, and no more coins were taken. You have 1,140 coins left.',
    )
  })
})
