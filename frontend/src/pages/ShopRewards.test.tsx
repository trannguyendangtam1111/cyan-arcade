import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const item = async (name: string) => within(await screen.findByRole('article', { name }))

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

const buy = async (name: string) => {
  await userEvent.click((await item(name)).getByRole('button', { name: new RegExp(`^buy ${name}`, 'i') }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buy it' }))
}

describe('the shop, by category', () => {
  it('filters the shelves by category, and remembers it in the address', async () => {
    mockApi({ user: pixel })
    renderRoute('/shop')

    const filters = within(await screen.findByRole('group', { name: 'Filter by category' }))
    expect(filters.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true')
    expect(filters.getByRole('button', { name: /Frames/ })).toHaveTextContent('1')
    expect(headings()).toEqual(expect.arrayContaining(['Card packs', 'Badges', 'Titles', 'Profile frames']))

    await userEvent.click(filters.getByRole('button', { name: /Frames/ }))
    expect(filters.getByRole('button', { name: /Frames/ })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('article', { name: 'Ocean Frame' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Extra Pack' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your packs today' })).not.toBeInTheDocument()

    await userEvent.click(filters.getByRole('button', { name: /All/ }))
    expect(await screen.findByRole('article', { name: 'Extra Pack' })).toBeInTheDocument()
  })

  it('opens on the category in the address', async () => {
    mockApi()
    renderRoute('/shop?category=badges')

    expect(await screen.findByRole('article', { name: 'Gold Coin' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'High Roller' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Badges/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a guest the frames, but nothing about packs or items of their own', async () => {
    mockApi()
    renderRoute('/shop')

    expect((await item('Ocean Frame')).getByRole('link', { name: 'Log in to buy' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your packs today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your items' })).not.toBeInTheDocument()
  })
})

describe('profile frames', () => {
  it('buys a frame, wears it at once and shows it on the profile', async () => {
    mockApi({ user: pixel, coins: 1000 })
    renderRoute('/shop')

    await buy('Ocean Frame')
    expect(await screen.findByRole('status')).toHaveTextContent('Ocean Frame is yours and already on your profile.')
    const card = await item('Ocean Frame')
    expect(await card.findByText('Equipped')).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Unequip Ocean Frame' })).toBeInTheDocument()

    const inventory = within(screen.getByRole('region', { name: 'Your items' }))
    expect(await inventory.findByRole('heading', { name: 'Profile frames' })).toBeInTheDocument()

    await userEvent.click(within(await screen.findByRole('status')).getByRole('link', { name: 'See your profile' }))
    expect(await screen.findByText('Frame: Ocean Frame')).toBeInTheDocument()
  })

  it('takes a frame off from its card', async () => {
    mockApi({ user: pixel, coins: 1000 })
    renderRoute('/shop')

    await buy('Ocean Frame')
    await userEvent.click(await (await item('Ocean Frame')).findByRole('button', { name: 'Unequip Ocean Frame' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Unequipped Ocean Frame.')
    expect(await (await item('Ocean Frame')).findByRole('button', { name: 'Equip Ocean Frame' })).toBeInTheDocument()
  })

  it('shows the frame another player wears on their public profile', async () => {
    mockApi({
      publicProfiles: { zelda_fan: { displayName: 'Zelda Fan', cosmetic: { code: 'FRAME_GOLD', name: 'Golden Frame', icon: 'frame-gold' } } },
    })
    renderRoute('/players/zelda_fan')

    expect(await screen.findByText('Frame: Golden Frame')).toBeInTheDocument()
  })
})

describe('when the shop says no', () => {
  it('locks an item above the player level', async () => {
    mockApi({ user: pixel, coins: 5000, level: 1 })
    renderRoute('/shop')

    const frame = await item('Ocean Frame')
    expect(frame.getByText('Unlocks at level 2')).toBeInTheDocument()
    expect(frame.getByRole('button', { name: /buy ocean frame/i })).toBeDisabled()
  })

  it('explains a refusal the page did not see coming', async () => {
    // Bought in another tab a moment ago: the page still offers it, the server knows better.
    mockApi({
      user: pixel,
      coins: 1000,
      handlers: [
        ({ path, method }) =>
          method === 'POST' && path === '/api/shop/purchases'
            ? mockProblem(409, 'ITEM_LIMIT_REACHED', 'You already own Gold Coin')
            : undefined,
      ],
    })
    renderRoute('/shop')

    await buy('Gold Coin')
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Already yours: You already own Gold Coin.',
    )
  })

  it('says so when a network failure stops a purchase', async () => {
    mockApi({
      user: pixel,
      handlers: [
        ({ path, method }) => {
          if (method === 'POST' && path === '/api/shop/purchases') throw new TypeError('Failed to fetch')
          return undefined
        },
      ],
    })
    renderRoute('/shop')

    await buy('Extra Pack')
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Could not reach the Cyan Arcade server.',
    )
    expect(screen.queryByText(/Purchased!/)).not.toBeInTheDocument()
  })

  it('shows why something could not be worn', async () => {
    mockApi({
      user: pixel,
      coins: 2000,
      handlers: [
        ({ path, method }) =>
          method === 'DELETE' && path.endsWith('/equipped') ? mockProblem(404, 'NOT_FOUND', 'Owned item was not found') : undefined,
      ],
    })
    renderRoute('/shop')

    await buy('Gold Coin')
    await userEvent.click(await (await item('Gold Coin')).findByRole('button', { name: 'Unequip Gold Coin' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Owned item was not found')
  })
})

describe('packs', () => {
  it('explains free daily packs and bought ones, and counts a new purchase', async () => {
    mockApi({ user: pixel, coins: 500 })
    renderRoute('/shop')

    const packs = within(await screen.findByRole('region', { name: 'Your packs today' }))
    expect(packs.getByText('Daily free packs used').closest('div')).toHaveTextContent('4/10')
    expect(packs.getByRole('progressbar', { name: 'Daily free packs used: 4 of 10' })).toBeInTheDocument()
    expect(packs.getByText(/6 free packs left today/)).toBeInTheDocument()
    expect(packs.getByText('Bought packs available').closest('div')).toHaveTextContent('0')

    await buy('Extra Pack')
    expect(await packs.findByText('1', { selector: 'dd' })).toBeInTheDocument()
    // Packs are used up, so having one does not stop buying another.
    expect((await item('Extra Pack')).getByRole('button', { name: /buy extra pack/i })).toBeEnabled()
  })

  it('tells an admin their packs are unlimited', async () => {
    mockApi({ user: { ...pixel, role: 'ADMIN' } })
    renderRoute('/shop')

    const packs = within(await screen.findByRole('region', { name: 'Your packs today' }))
    expect(packs.getByText('Unlimited as an admin')).toBeInTheDocument()
    expect(packs.getByText('Kept for later: admins never need them.')).toBeInTheDocument()
  })
})

describe('rewards', () => {
  it('says where every coin came from in the coin history', async () => {
    mockApi({
      user: pixel,
      transactions: [
        { type: 'HIGH_SCORE', amount: 15, description: 'New best in Snake', balanceAfter: 1240 },
        { type: 'DAILY_LOGIN', amount: 200, description: 'Daily login, day 7 + 1 × Extra Pack', balanceAfter: 1225 },
        { type: 'DAILY_CHALLENGE', amount: 50, description: 'Daily challenge: Snack Time', balanceAfter: 1025 },
        { type: 'ACHIEVEMENT', amount: 100, description: 'Achievement: First Coin', balanceAfter: 975 },
      ],
    })
    renderRoute('/profile')

    const history = within(await screen.findByRole('region', { name: 'Coin history' }))
    const [best, login, challenge, achievement] = await history.findAllByRole('listitem')
    expect(best).toHaveTextContent('New personal best')
    expect(best).toHaveTextContent('+15 coins')
    expect(best).toHaveTextContent('Balance 1,240')
    expect(login).toHaveTextContent('Daily login, day 7 + 1 × Extra Pack')
    expect(login).toHaveTextContent('Daily reward')
    expect(challenge).toHaveTextContent('Daily challenge')
    expect(achievement).toHaveTextContent('Achievement: First Coin')
  })

  it('shows a completed challenge with the reward it paid', async () => {
    mockApi({
      user: pixel,
      challenges: [{ id: 1, title: 'Snack Time', completed: true, xpReward: 25, coinReward: 50 }],
    })
    renderRoute('/challenges')

    const card = await screen.findByRole('link', { name: /Snack Time/ })
    expect(card).toHaveTextContent('Completed')
    expect(card).toHaveTextContent('reward earned: +25 XP, +50 coins')
  })
})
