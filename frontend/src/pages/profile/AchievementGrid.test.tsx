import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AchievementStatus } from '@/api/profile'
import { achievementsFixture, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import { nextGoals } from './achievementGoals'

const locked = (code: string, progress?: number, target?: number): AchievementStatus => ({
  code,
  name: code,
  description: `${code} description`,
  xp: 100,
  coins: 150,
  unlocked: false,
  unlockedAt: null,
  ...(progress !== undefined && { progress, target }),
})

const achievementsSection = async () => within(await screen.findByRole('region', { name: /^Achievements/ }))

describe('nextGoals', () => {
  it('ranks measured locked achievements by the share of their goal reached, then by what is left', () => {
    const goals = nextGoals([
      locked('HALF', 5, 10),
      locked('NO_GOAL'),
      locked('NEARLY', 9, 10),
      { ...locked('DONE', 1, 1), unlocked: true, unlockedAt: '2026-11-01T00:00:00Z' },
      locked('HALF_BIG', 50, 100),
      locked('START', 0, 1),
    ])

    expect(goals.map((goal) => goal.code)).toEqual(['NEARLY', 'HALF', 'HALF_BIG'])
  })

  it('never offers an unlocked achievement, one without a goal, or a zero target', () => {
    expect(nextGoals([locked('NO_GOAL'), locked('ZERO', 0, 0)])).toEqual([])
  })

  it('never claims progress out of range: below none, past the target, or not a number', () => {
    expect(nextGoals([locked('NEGATIVE', -1, 10), locked('PAST', 11, 10), locked('NAN', Number.NaN, 10)])).toEqual([])
  })
})

describe('achievements on the profile', () => {
  it('shows the closest goals first, with the progress the server measured', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const achievements = await achievementsSection()
    const next = within(await achievements.findByRole('list', { name: 'Next up' }))
    const cards = next.getAllByRole('listitem')
    // Growing Up is 80% there, Regular 30%.
    expect(cards.map((card) => within(card).getByText(/^(Growing Up|Regular)$/).textContent)).toEqual([
      'Growing Up',
      'Regular',
    ])
    expect(next.getByRole('progressbar', { name: 'Growing Up: 20 of 25' })).toHaveAttribute('aria-valuenow', '20')
    expect(cards[0]).toHaveTextContent('5 to go')
    expect(achievements.getByText(/Unlocked by Classic runs/)).toBeInTheDocument()
  })

  it('says what each bar counts: Sudoku boards towards games played, a Classic best towards a score', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const achievements = await achievementsSection()
    const next = within(await achievements.findByRole('list', { name: 'Next up' }))
    const [growingUp, regular] = next.getAllByRole('listitem')
    expect(regular).toHaveTextContent("Counts Classic games of every game, and Sudoku's ranked boards.")
    expect(growingUp).toHaveTextContent('Your best Classic score in this game.')
    expect(growingUp).not.toHaveTextContent('Sudoku')
  })

  it('filters the full list by unlocked and locked', async () => {
    mockApi({ user: pixel })
    renderRoute('/profile')

    const achievements = await achievementsSection()
    const all = await achievements.findByRole('list', { name: 'All achievements' })
    const filters = within(achievements.getByRole('group', { name: 'Filter achievements' }))
    expect(within(all).getAllByRole('listitem')).toHaveLength(3)

    await userEvent.click(filters.getByRole('button', { name: /Unlocked/ }))
    expect(within(all).getAllByRole('listitem')).toHaveLength(1)
    expect(within(all).getByRole('heading', { name: 'First Coin' })).toBeInTheDocument()

    await userEvent.click(filters.getByRole('button', { name: /Locked/ }))
    expect(within(all).getAllByRole('listitem').map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Regular',
      'Growing Up',
    ])
    expect(filters.getByRole('button', { name: /Locked/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a reached goal as waiting for the next qualifying run, not as unlocked', async () => {
    mockApi({
      user: pixel,
      achievements: [achievementsFixture[0], { ...locked('PLAY_10_GAMES', 10, 10), goal: 'GAMES_PLAYED' }],
    })
    renderRoute('/profile')

    const achievements = await achievementsSection()
    const next = within(await achievements.findByRole('list', { name: 'Next up' }))
    expect(next.getByText('Reached: your next Classic game or Sudoku board unlocks it')).toBeInTheDocument()
    expect(achievements.getByRole('heading', { name: 'Achievements 1 of 2' })).toBeInTheDocument()
  })

  it('has no Next up row when the server sent no progress (an older backend)', async () => {
    mockApi({
      user: pixel,
      achievements: achievementsFixture.map(({ progress: _progress, target: _target, ...rest }) => rest),
    })
    renderRoute('/profile')

    const achievements = await achievementsSection()
    await achievements.findByRole('list', { name: 'All achievements' })
    expect(achievements.queryByRole('list', { name: 'Next up' })).not.toBeInTheDocument()
    expect(achievements.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
