import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const item = async (name: string) => within(await screen.findByRole('article', { name }))

const purchaseBodies = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls
    .filter(([input, init]) => String(input).endsWith('/api/shop/purchases') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)

describe('the shop', () => {
  it('shows a guest what is for sale and asks them to log in to buy', async () => {
    mockApi()
    renderRoute('/shop')

    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Card packs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Badges' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Titles' })).toBeInTheDocument()

    const pack = await item('Extra Pack')
    expect(pack.getByText('100 coins')).toBeInTheDocument()
    expect(pack.getByRole('link', { name: 'Log in to buy' })).toHaveAttribute('href', '/login?redirect=%2Fshop')
    expect(screen.queryByRole('button', { name: /^Buy/ })).not.toBeInTheDocument()
    expect(screen.queryByText('You have')).not.toBeInTheDocument()
  })

  it('lets a player buy an item after confirming, with nothing but the item and a request id', async () => {
    const fetchSpy = mockApi({ user: pixel, coins: 1240 })
    renderRoute('/shop')

    expect(await screen.findByText('You have')).toBeInTheDocument()
    await userEvent.click((await item('Extra Pack')).getByRole('button', { name: 'Buy Extra Pack for 100 coins' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Buy Extra Pack?' }))
    expect(dialog.getByText('1,140 coins')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Buy it' }))

    const bought = await screen.findByRole('status')
    expect(bought).toHaveTextContent('Extra Pack is yours!')
    expect(within(bought).getByRole('link', { name: 'Open packs' })).toHaveAttribute('href', '/tcg')
    expect(await within(screen.getByRole('main')).findByText('1,140 coins', { selector: 'span.sr-only' })).toBeInTheDocument()
    expect(await (await item('Extra Pack')).findByText('1 left')).toBeInTheDocument()

    const [body] = purchaseBodies(fetchSpy)
    expect(Object.keys(body).sort()).toEqual(['itemId', 'requestId'])
    expect(body.itemId).toBe(1)
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)

    const inventory = within(screen.getByRole('region', { name: 'Your items' }))
    expect(await inventory.findByText('1 extra pack')).toBeInTheDocument()
  })

  it('uses a new request id for every purchase the player means to make', async () => {
    const fetchSpy = mockApi({ user: pixel, coins: 1240 })
    renderRoute('/shop')

    for (let attempt = 0; attempt < 2; attempt++) {
      await userEvent.click((await item('Extra Pack')).getByRole('button', { name: /buy extra pack/i }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buy it' }))
      await screen.findByRole('status')
    }

    const [first, second] = purchaseBodies(fetchSpy)
    expect(first.requestId).not.toEqual(second.requestId)
  })

  it('says why an item cannot be bought', async () => {
    mockApi({ user: pixel, coins: 120, level: 2 })
    renderRoute('/shop')

    const box = await item('Pack Box')
    expect(box.getByText('Unlocks at level 3')).toBeInTheDocument()
    expect(box.getByRole('button', { name: /buy pack box/i })).toBeDisabled()

    const title = await item('High Roller')
    expect(title.getByText('Not enough coins yet')).toBeInTheDocument()
    expect(title.getByRole('button', { name: /buy high roller/i })).toBeDisabled()

    expect((await item('Extra Pack')).getByRole('button', { name: /buy extra pack/i })).toBeEnabled()
  })

  it('shows what the server says when a purchase is refused, and charges nothing', async () => {
    // The coins were spent in another tab: the page still thinks there are 100, the server knows better.
    mockApi({
      user: pixel,
      coins: 100,
      handlers: [
        ({ path, method }) =>
          method === 'POST' && path === '/api/shop/purchases'
            ? mockProblem(409, 'INSUFFICIENT_COINS', 'That costs 100 coins and you have 0')
            : undefined,
      ],
    })
    renderRoute('/shop')

    await userEvent.click((await item('Extra Pack')).getByRole('button', { name: /buy extra pack/i }))
    const dialog = within(screen.getByRole('dialog', { name: 'Buy Extra Pack?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Buy it' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('That costs 100 coins and you have 0')
    expect(screen.queryByText(/is yours/)).not.toBeInTheDocument()
  })

  it('puts on a bought badge and takes it off again', async () => {
    mockApi({ user: pixel, coins: 2000 })
    renderRoute('/shop')

    await userEvent.click((await item('Gold Coin')).getByRole('button', { name: /buy gold coin/i }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buy it' }))
    expect(await (await item('Gold Coin')).findByText('Owned')).toBeInTheDocument()
    expect((await item('Gold Coin')).getByText('You own this')).toBeInTheDocument()

    const inventory = within(screen.getByRole('region', { name: 'Your items' }))
    await userEvent.click(await inventory.findByRole('button', { name: 'Wear Gold Coin' }))
    expect(await inventory.findByRole('button', { name: 'Take off Gold Coin' })).toHaveTextContent('Wearing')
    await userEvent.click(inventory.getByRole('button', { name: 'Take off Gold Coin' }))
    expect(await inventory.findByRole('button', { name: 'Wear Gold Coin' })).toBeInTheDocument()
  })
})
