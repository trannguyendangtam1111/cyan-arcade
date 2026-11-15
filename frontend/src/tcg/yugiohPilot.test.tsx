import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import { tcgHandlers } from './test/tcgMockApi'
import { pilotCards, pilotGame, pilotOpening, pilotPack, pilotSet } from './test/yugiohPilotFixture'

beforeEach(() => sessionStorage.clear())

it('opens nine text printings with exact simulated odds, records history and updates the collection', async () => {
  mockApi({ user: pixel, handlers: [tcgHandlers({
    game: pilotGame, set: pilotSet, cards: pilotCards, pack: pilotPack, opening: pilotOpening,
  })] })
  renderRoute('/tcg/packs/80')
  expect(await screen.findByText('Arcade Simulated Odds', { exact: true })).toBeInTheDocument()
  expect(screen.getByText(/The table shows configured probabilities per card slot/)).toBeInTheDocument()
  expect(screen.getAllByText('0.01%')).toHaveLength(9)
  expect(screen.getAllByText('0.99%')).toHaveLength(9)
  const wrapper = screen.getByRole('img', { name: pilotPack.name })
  expect(wrapper.querySelector('img')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Open pack' }))
  const list = await screen.findByRole('list', { name: 'Your cards' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(9)
  await userEvent.click(within(list).getByRole('button', { name: 'Reveal card 9' }))
  expect(screen.getByText('Tap a card to turn it over. 8 to go.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reveal all' }))
  expect(await screen.findByText('All 9 cards are in your collection.')).toBeInTheDocument()
  expect(list.querySelectorAll('[data-testid="text-card"]')).toHaveLength(9)
  expect(list.querySelector('img')).toBeNull()
  for (const rarity of pilotGame.rarities) {
    expect(within(list).getAllByRole('button', { name: new RegExp(`, ${rarity.name}$`) }).length).toBeGreaterThan(0)
  }
  expect(within(list).getAllByRole('listitem')[0]).toHaveClass('w-[44%]')
  await userEvent.click(screen.getByRole('link', { name: 'View collection' }))
  expect(await screen.findByRole('button', { name: /Ars Magna the Finite and the Infinite.*Ultra Rare/ })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: /^History$/ }))
  const history = await screen.findByRole('list', { name: `Cards from ${pilotPack.name}` })
  expect(within(history).getAllByRole('listitem')).toHaveLength(9)
  expect(history.querySelector('img')).toBeNull()
})

it('keeps the pilot out of the default franchise list', async () => {
  mockApi({ user: pixel, handlers: [tcgHandlers()] })
  renderRoute('/tcg')
  await screen.findByRole('link', { name: /Pokémon/ })
  expect(screen.queryByText(pilotGame.name)).not.toBeInTheDocument()
})

it('discloses per-slot simulation using the API values instead of copying percentages into prose', async () => {
  const pack = {
    ...pilotPack,
    slots: pilotPack.slots.map((slot) => ({ ...slot, odds: slot.odds.map((odd) => ({
      ...odd, percent: odd.rarity.code === 'common' ? 79.5 : odd.rarity.code === 'super-rare' ? 14.5 : odd.percent,
    })) })),
  }
  mockApi({ user: null, handlers: [tcgHandlers({ game: pilotGame, set: pilotSet, cards: pilotCards, pack })] })
  renderRoute('/tcg/packs/80')
  expect(await screen.findByText('Arcade Simulated Odds', { exact: true })).toBeInTheDocument()
  expect(screen.getByText(/Each of the 9 card slots independently draws a rarity/)).toBeInTheDocument()
  expect(screen.getByText(/not Konami's official pull rates/)).toBeInTheDocument()
  expect(screen.getAllByText('79.5%')).toHaveLength(9)
  expect(screen.getAllByText('14.5%')).toHaveLength(9)
  expect(screen.queryByText('80%', { exact: true })).not.toBeInTheDocument()
  expect(screen.getByText('Text cards')).toBeInTheDocument()
})
