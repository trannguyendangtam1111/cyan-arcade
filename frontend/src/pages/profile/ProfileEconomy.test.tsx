import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

const value = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('div')!.querySelector('dd')

describe('the profile, with the platform', () => {
  it('shows coins, cards and packs next to the games', async () => {
    mockApi({ user: pixel, coins: 12_480 })
    renderRoute('/profile')

    await screen.findByText('Games played')
    expect(value('Coins')).toHaveTextContent('12,480')
    expect(await screen.findByText('341', { selector: 'dd' })).toBeInTheDocument()
    expect(value('Cards collected')).toHaveTextContent('341')
    expect(value('Packs opened')).toHaveTextContent('14')
    expect(value('Play time')).toHaveTextContent('1:02:05')
    expect(value('Coins earned')).toHaveTextContent('12,980')
  })

  it('shows what the player wears', async () => {
    mockApi({
      user: pixel,
      profile: {
        title: { code: 'TITLE_HIGH_ROLLER', name: 'High Roller', icon: 'dice' },
        badge: { code: 'BADGE_GOLD_COIN', name: 'Gold Coin', icon: 'coin' },
      },
    })
    renderRoute('/profile')

    expect(await screen.findByText('High Roller')).toBeInTheDocument()
    expect(screen.getByText('Badge: Gold Coin')).toBeInTheDocument()
  })

  it('shows numbers for every game played', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const table = within(await screen.findByRole('table', { name: 'Your numbers in every game you have played' }))
    const snake = table.getByRole('row', { name: /snake/i })
    expect(within(snake).getByRole('link', { name: 'Snake' })).toHaveAttribute('href', '/games/snake')
    expect(snake).toHaveTextContent('9')
    expect(snake).toHaveTextContent('42')
    expect(snake).toHaveTextContent('17')
  })

  it('lists coins earned and spent, newest first, a page at a time', async () => {
    mockApi({
      user: pixel,
      transactions: [
        { type: 'SHOP_PURCHASE', amount: -100, description: 'Bought Extra Pack' },
        { type: 'DAILY_LOGIN', amount: 50, description: 'Daily login, day 1' },
        ...Array.from({ length: 8 }, () => ({ type: 'GAME_COMPLETION' as const, amount: 5 })),
      ],
    })
    renderRoute('/profile')

    const history = within(await screen.findByRole('region', { name: 'Coin history' }))
    const entries = await history.findAllByRole('listitem')
    expect(entries).toHaveLength(8)
    expect(entries[0]).toHaveTextContent('Bought Extra Pack')
    expect(entries[0]).toHaveTextContent('−100 coins')
    expect(entries[1]).toHaveTextContent('Daily reward')
    expect(entries[1]).toHaveTextContent('+50 coins')

    await userEvent.click(history.getByRole('button', { name: 'Older' }))
    expect(await history.findByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('shows what each achievement pays', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const achievements = within(await screen.findByRole('region', { name: /Achievements/ }))
    expect(await achievements.findByText(/\+50 XP · \+\s*100 coins/)).toBeInTheDocument()
    expect(achievements.getAllByText(/worth 100 XP and 150 coins/)).toHaveLength(2)
  })
})
