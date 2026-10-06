import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { challengesFixture, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** The requests sent with a method, as "METHOD path". */
const sent = (fetchSpy: ReturnType<typeof mockApi>, method: string) =>
  fetchSpy.mock.calls
    .filter(([, init]) => (init?.method ?? 'GET') === method)
    .map(([input]) => new URL(String(input), 'http://localhost').pathname)


describe('the daily reward', () => {
  it('shows every day of the run and lets a player claim today', async () => {
    const fetchSpy = mockApi({ user: pixel, coins: 1240 })
    renderRoute('/challenges')

    expect(screen.getByRole('heading', { level: 1, name: 'Challenges' })).toBeInTheDocument()
    const reward = within(await screen.findByRole('region', { name: 'Daily reward' }))
    const days = within(await reward.findByRole('list', { name: 'Daily rewards' })).getAllByRole('listitem')
    expect(days).toHaveLength(7)
    expect(days[0]).toHaveAttribute('aria-current', 'date')
    expect(days[0]).toHaveTextContent('Day 1')
    expect(days[0]).toHaveTextContent('50 coins')
    expect(days[6]).toHaveTextContent('200 coins')
    expect(days[6]).toHaveTextContent('+ pack')
    expect(await screen.findByRole('link', { name: '1,240 coins' })).toHaveAttribute('href', '/shop')

    await userEvent.click(reward.getByRole('button', { name: /claim day 1/i }))

    expect(await reward.findByRole('status')).toHaveTextContent('+50 coins! You now have 1290.')
    expect(reward.getByText('Claimed today')).toBeInTheDocument()
    expect(reward.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument()
    expect(within(reward.getByRole('list', { name: 'Daily rewards' })).getAllByRole('listitem')[0]).toHaveTextContent(
      'Claimed',
    )
    // The header's balance is read again, from the server.
    expect(await screen.findByRole('link', { name: '1,290 coins' })).toHaveAttribute('href', '/shop')
    // The request says nothing but "claim": the day and the amount are the server's.
    expect(sent(fetchSpy, 'POST')).toEqual(['/api/daily-login/claim'])
    const claim = fetchSpy.mock.calls.find(([input]) => String(input).endsWith('/claim'))
    expect(claim?.[1]?.body).toBeUndefined()
  })

  it('shows a streak and offers nothing more once today is claimed', async () => {
    mockApi({ user: pixel, dailyLogin: { claimedToday: true, streak: 2 } })
    renderRoute('/challenges')

    const reward = within(await screen.findByRole('region', { name: 'Daily reward' }))
    expect(await reward.findByText('3 days in a row')).toBeInTheDocument()
    expect(reward.getByText('Claimed today')).toBeInTheDocument()
    expect(reward.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument()
    const days = within(reward.getByRole('list', { name: 'Daily rewards' })).getAllByRole('listitem')
    expect(days.slice(0, 3).every((day) => day.textContent?.includes('Claimed'))).toBe(true)
    expect(days[3]).not.toHaveTextContent('Claimed')
  })

  it('asks a guest to log in for it', async () => {
    const fetchSpy = mockApi()
    renderRoute('/challenges')

    const reward = within(await screen.findByRole('region', { name: 'Daily reward' }))
    expect(reward.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?redirect=%2Fchallenges')
    expect(sent(fetchSpy, 'GET')).not.toContain('/api/daily-login')
  })
})

describe("today's challenges", () => {
  it('shows what each pays in XP and coins', async () => {
    mockApi({ user: pixel, challenges: challengesFixture })
    renderRoute('/challenges')

    const challenges = within(await screen.findByRole('region', { name: 'Daily challenges' }))
    const tidyUp = await challenges.findByRole('link', { name: /tidy up/i })
    expect(tidyUp).toHaveTextContent('+30 XP')
    expect(within(tidyUp).getByText('+60 coins')).toBeInTheDocument()
  })

  it('counts a card pack challenge towards its target and leads to the packs', async () => {
    mockApi({
      user: pixel,
      challenges: [
        {
          title: 'Pack Opener',
          description: 'Open 3 card packs today.',
          game: null,
          activity: { code: 'TCG_PACK_OPENED', name: 'Card packs' },
          target: 3,
          progress: 2,
          xpReward: 30,
          coinReward: 60,
        },
      ],
    })
    renderRoute('/challenges')

    const card = await within(await screen.findByRole('region', { name: 'Daily challenges' })).findByRole('link', {
      name: /pack opener/i,
    })
    expect(card).toHaveAttribute('href', '/tcg')
    expect(within(card).getByText('Card packs')).toBeInTheDocument()
    expect(within(card).getByText('Open packs')).toBeInTheDocument()
    const progress = within(card).getByRole('progressbar', { name: 'Progress: 2 of 3' })
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '3')
  })
})
