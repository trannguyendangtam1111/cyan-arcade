import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import { RETRY_AFTER_MS } from './components/CardImage'
import { openingFixture, tcgHandlers } from './test/tcgMockApi'

type TcgOptions = Parameters<typeof tcgHandlers>[0]

const asGuest = (options?: TcgOptions) => mockApi({ handlers: [tcgHandlers(options)] })
const asPixel = (options?: TcgOptions) => mockApi({ user: pixel, handlers: [tcgHandlers(options)] })

/** The requests sent to the card game API, as "METHOD path". */
const tcgRequests = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls
    .filter(([input]) => String(input).startsWith('/api/tcg/'))
    .map(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}`)

describe('card packs in the hub', () => {
  it('are one click away from the home page and the navigation', async () => {
    asGuest()
    renderRoute('/')

    const banner = within(screen.getByRole('region', { name: 'Card packs' }))
    expect(banner.getByRole('link', { name: /open packs/i })).toHaveAttribute('href', '/tcg')
    const navigation = within(screen.getAllByRole('navigation', { name: 'Primary' })[0])
    expect(navigation.getByRole('link', { name: 'Cards' })).toHaveAttribute('href', '/tcg')
  })
})

describe('browsing card games, sets and packs', () => {
  it('lists the card games', async () => {
    asGuest()
    renderRoute('/tcg')

    expect(await screen.findByRole('heading', { level: 1, name: 'Card packs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choose your TCG' })).toBeInTheDocument()
    const game = await screen.findByRole('link', { name: /pokémon tcg/i })
    expect(game).toHaveAttribute('href', '/tcg/pokemon')
    expect(game).toHaveTextContent('1 set · 3 cards')
    // A guest has no collection to show.
    expect(screen.queryByRole('region', { name: 'Your collection' })).not.toBeInTheDocument()
  })

  it('shows a signed-in player how far their collection has come', async () => {
    asPixel({ owned: { 101: 2 } })
    renderRoute('/tcg')

    const collection = within(await screen.findByRole('region', { name: 'Your collection' }))
    expect(collection.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '1 of 3 cards')
    expect(collection.getByText('33.3%')).toBeInTheDocument()
    expect(await screen.findByText('5 of 5 packs left today')).toBeInTheDocument()
  })

  it("lists a game's sets", async () => {
    asGuest()
    renderRoute('/tcg/pokemon')

    expect(await screen.findByRole('heading', { level: 1, name: 'Pokémon TCG' })).toBeInTheDocument()
    const set = await screen.findByRole('link', { name: /scarlet & violet/i })
    expect(set).toHaveAttribute('href', '/tcg/pokemon/sv01')
    expect(set).toHaveTextContent('2023 · 3 cards · 1 pack')
    // The arcade does not own the cards it shows, and says whose they are.
    expect(screen.getByText(/not affiliated with the pokémon company/i)).toBeInTheDocument()
  })

  it('shows the 404 page for a card game that does not exist', async () => {
    asGuest()
    renderRoute('/tcg/pocket-dragons')

    expect(await screen.findByRole('heading', { name: /game over/i })).toBeInTheDocument()
  })

  it("lists a set's packs and every card in it", async () => {
    asGuest()
    renderRoute('/tcg/pokemon/sv01')

    expect(await screen.findByRole('heading', { level: 1, name: 'Scarlet & Violet' })).toBeInTheDocument()
    const pack = await screen.findByRole('link', { name: /scarlet & violet booster pack/i })
    expect(pack).toHaveAttribute('href', '/tcg/packs/20')
    expect(pack).toHaveTextContent('3 cards per pack · 3 to find')

    const cards = within(screen.getByRole('region', { name: 'Cards in this set' }))
    // A guest sees the cards without any word about owning them.
    expect(await cards.findByRole('button', { name: 'Pineco, Common' })).toBeInTheDocument()
    expect(cards.getByRole('button', { name: 'Koraidon ex, Hyper Rare' })).toBeInTheDocument()
    expect(cards.getAllByRole('button')).toHaveLength(3)
  })

  it('marks which cards of a set a signed-in player owns', async () => {
    asPixel({ owned: { 101: 2, 102: 1 } })
    renderRoute('/tcg/pokemon/sv01')

    const cards = within(await screen.findByRole('region', { name: 'Cards in this set' }))
    expect(await cards.findByRole('button', { name: 'Pineco, Common, 2 owned' })).toBeInTheDocument()
    expect(cards.getByRole('button', { name: 'Miraidon ex, Double Rare, 1 owned' })).toBeInTheDocument()
    expect(cards.getByRole('button', { name: 'Koraidon ex, Hyper Rare, not owned' })).toBeInTheDocument()
    expect(cards.getByRole('progressbar', { name: 'Scarlet & Violet completion' })).toHaveAttribute(
      'aria-valuetext',
      '2 of 3 cards',
    )
  })

  it("opens a closer look at a card, with whatever its game knows about it", async () => {
    asPixel({ owned: { 101: 2 } })
    renderRoute('/tcg/pokemon/sv01')

    await userEvent.click(await screen.findByRole('button', { name: 'Pineco, Common, 2 owned' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Pineco' }))
    const value = (term: string) => dialog.getByText(term, { selector: 'dt' }).nextElementSibling
    expect(value('Rarity')).toHaveTextContent('Common')
    expect(value('Set')).toHaveTextContent('Scarlet & Violet · 001')
    expect(value('Card ID')).toHaveTextContent('sv01-001')
    expect(value('Owned')).toHaveTextContent('2 copies')
    // The card's own metadata, listed as it comes.
    expect(value('Category')).toHaveTextContent('Pokemon')
    expect(value('Hp')).toHaveTextContent('60')
    expect(value('Types')).toHaveTextContent('Grass')
  })

  it('shows small images in grids and the full-size image for a closer look', async () => {
    asGuest()
    renderRoute('/tcg/pokemon/sv01')

    const tile = await screen.findByRole('button', { name: 'Pineco, Common' })
    expect(tile.querySelector('img')).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp')
    await userEvent.click(tile)
    expect(screen.getByRole('dialog', { name: 'Pineco' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://assets.tcgdex.net/en/sv/sv01/001/high.webp',
    )
  })

  it('tries a card image a second time, then shows the card by name', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      asGuest()
      renderRoute('/tcg/pokemon/sv01')
      const tile = await screen.findByRole('button', { name: 'Pineco, Common' })

      fireEvent.error(tile.querySelector('img')!)
      await act(() => vi.advanceTimersByTimeAsync(RETRY_AFTER_MS))
      expect(tile.querySelector('img')).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp#retry')

      fireEvent.error(tile.querySelector('img')!)
      expect(within(tile).getByRole('img', { name: 'Pineco 001 (image unavailable)' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the pack page', () => {
  it('shows the odds of every card in the pack', async () => {
    asGuest()
    renderRoute('/tcg/packs/20')

    expect(await screen.findByRole('heading', { level: 1, name: 'Scarlet & Violet Booster Pack' })).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual(['1Common100%', '2Double Rare100%', '3Double Rare75%Hyper Rare25%'])
    // Neither publisher gives pull rates; the page says where its odds come from.
    expect(screen.getByText(/^Simulator probabilities\./)).toBeInTheDocument()
  })

  it('asks a guest to log in, and comes back to the pack afterwards', async () => {
    const fetchSpy = asGuest()
    renderRoute('/tcg/packs/20')

    expect(await screen.findByRole('heading', { name: 'Log in to open packs' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Ftcg%2Fpacks%2F20',
    )
    expect(screen.queryByRole('button', { name: 'Open pack' })).not.toBeInTheDocument()
    expect(tcgRequests(fetchSpy).filter((request) => request.startsWith('POST'))).toEqual([])
  })

  it('shows the 404 page for a pack that does not exist', async () => {
    asGuest()
    renderRoute('/tcg/packs/999')

    expect(await screen.findByRole('heading', { name: /game over/i })).toBeInTheDocument()
  })
})

describe('opening a pack', () => {
  it('asks the server for the pack, then lets the player turn the cards over one by one', async () => {
    const fetchSpy = asPixel()
    renderRoute('/tcg/packs/20')

    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))

    // The cards are dealt face down once the pack has torn open.
    const cards = within(await screen.findByRole('list', { name: 'Your cards' }))
    expect(cards.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Reveal card 1',
      'Reveal card 2',
      'Reveal card 3',
    ])
    expect(screen.getByText(/3 to go/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Results' })).not.toBeInTheDocument()

    await userEvent.click(cards.getByRole('button', { name: 'Reveal card 1' }))

    expect(cards.getByRole('button', { name: 'Pineco, Common' })).toBeDisabled()
    expect(screen.getByText('Pineco, Common, new')).toBeInTheDocument()
    expect(screen.getByText(/2 to go/)).toBeInTheDocument()

    await userEvent.click(cards.getByRole('button', { name: 'Reveal card 3' }))
    await userEvent.click(cards.getByRole('button', { name: 'Reveal card 2' }))

    // Turning over the last card ends the reveal.
    const results = within(await screen.findByRole('region', { name: 'Results' }))
    expect(results.getByRole('heading', { name: 'Legendary pull!' })).toBeInTheDocument()
    expect(results.getByText('2 new cards')).toBeInTheDocument()
    expect(results.getByText('1 duplicate')).toBeInTheDocument()
    expect(results.getByText('All 3 cards are in your collection.')).toBeInTheDocument()
    expect(results.getByRole('link', { name: 'View collection' })).toHaveAttribute('href', '/tcg/collection')

    // One request opened the pack. It named the pack and sent nothing else.
    const opens = fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(opens).toHaveLength(1)
    expect(String(opens[0][0])).toBe('/api/tcg/packs/20/open')
    expect(opens[0][1]?.body).toBeUndefined()
  })

  it('shows the cards in the order the server sent them', async () => {
    const reordered = { ...openingFixture, cards: [...openingFixture.cards].reverse().map((card, index) => ({ ...card, position: index + 1 })) }
    asPixel({ opening: reordered })
    renderRoute('/tcg/packs/20')

    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal all' }))

    const cards = within(screen.getByRole('list', { name: 'Your cards' }))
    expect(cards.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Koraidon ex, Hyper Rare',
      'Miraidon ex, Double Rare',
      'Pineco, Common',
    ])
  })

  it('uses up one of today\'s packs and lets the player open another', async () => {
    const fetchSpy = asPixel({ openedToday: 3 })
    renderRoute('/tcg/packs/20')
    expect(await screen.findByText('2 of 5 packs left today')).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal all' }))

    expect(await screen.findByText('1 of 5 packs left today')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open another' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal all' }))

    expect(await screen.findByText('No packs left today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open another' })).toBeDisabled()
    expect(tcgRequests(fetchSpy).filter((request) => request.startsWith('POST'))).toHaveLength(2)
  })

  it('lets an admin keep opening packs past the players\' daily limit, and says so', async () => {
    const fetchSpy = mockApi({ user: admin, handlers: [tcgHandlers({ openedToday: 5 })] })
    renderRoute('/tcg/packs/20')

    expect(await screen.findByText('Unlimited packs · Admin')).toBeInTheDocument()
    expect(screen.queryByText(/packs left today/)).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal all' }))

    expect(screen.getByRole('button', { name: 'Open another' })).toBeEnabled()
    expect(screen.getByText('Unlimited packs · Admin')).toBeInTheDocument()
    expect(tcgRequests(fetchSpy).filter((request) => request.startsWith('POST'))).toHaveLength(1)
  })

  it('does not offer a pack when none are left today', async () => {
    asPixel({ openedToday: 5 })
    renderRoute('/tcg/packs/20')

    expect(await screen.findByText(/you have opened all of today's packs/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open pack' })).toBeDisabled()
  })

  it("opens a pack bought in the shop once today's are gone", async () => {
    const fetchSpy = asPixel({ openedToday: 5, bonusPacks: 1 })
    renderRoute('/tcg/packs/20')

    expect(await screen.findByText('No packs left today · 1 extra')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal all' }))

    expect(await screen.findByText('No packs left today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open another' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'get extra packs in the shop' })).toHaveAttribute('href', '/shop')
    expect(tcgRequests(fetchSpy).filter((request) => request.startsWith('POST'))).toHaveLength(1)
  })

  it('says why when the server refuses, and leaves the pack sealed', async () => {
    asPixel({ openFailure: { status: 409, code: 'PACK_NOT_AVAILABLE', detail: 'This pack can no longer be opened' } })
    renderRoute('/tcg/packs/20')

    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This pack can no longer be opened')
    expect(screen.getByRole('button', { name: 'Open pack' })).toBeEnabled()
    expect(screen.queryByRole('list', { name: 'Your cards' })).not.toBeInTheDocument()
  })
})

describe('the collection page', () => {
  it('asks a guest to log in', async () => {
    const fetchSpy = asGuest()
    renderRoute('/tcg/collection')

    expect(await screen.findByRole('heading', { name: 'Log in to see your collection' })).toBeInTheDocument()
    expect(tcgRequests(fetchSpy)).not.toContain('GET /api/tcg/collection?page=0&size=60')
  })

  it('shows how complete the collection is and the cards owned', async () => {
    asPixel({ owned: { 101: 3, 103: 1 } })
    renderRoute('/tcg/collection')

    const summary = within(await screen.findByRole('region', { name: 'Statistics' }))
    const figure = (label: string) => summary.getByText(label).previousElementSibling
    expect(figure('Different cards')).toHaveTextContent('2 / 3')
    expect(figure('Cards in total')).toHaveTextContent('4')
    expect(figure('Duplicates')).toHaveTextContent('2')
    expect(summary.getByText('66.7%')).toBeInTheDocument()

    const sets = within(screen.getByRole('region', { name: 'Sets' }))
    expect(sets.getByRole('button', { name: /scarlet & violet/i })).toHaveTextContent('2 / 3 cards')

    const cards = within(screen.getByRole('region', { name: 'Your cards' }))
    expect(cards.getByRole('button', { name: 'Pineco, Common, 3 owned' })).toHaveTextContent('×3')
    expect(cards.getByRole('button', { name: 'Koraidon ex, Hyper Rare, 1 owned' })).toBeInTheDocument()
    expect(cards.getAllByRole('button')).toHaveLength(2)
  })

  it('narrows the cards to one set, and back', async () => {
    const fetchSpy = asPixel({ owned: { 101: 1 } })
    renderRoute('/tcg/collection')
    const set = await screen.findByRole('button', { name: /scarlet & violet/i })
    expect(set).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(set)

    expect(await screen.findByRole('region', { name: 'Your cards from Scarlet & Violet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scarlet & violet/i })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tcgRequests(fetchSpy)).toContain('GET /api/tcg/collection?page=0&size=60&set=10'))

    await userEvent.click(screen.getByRole('button', { name: /scarlet & violet/i }))

    expect(await screen.findByRole('region', { name: 'Your cards' })).toBeInTheDocument()
  })

  it('invites a player without cards to open a pack', async () => {
    asPixel()
    renderRoute('/tcg/collection')

    expect(await screen.findByRole('heading', { name: 'No cards yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open a pack' })).toHaveAttribute('href', '/tcg')
  })

  it('fills up when a pack is opened', async () => {
    asPixel({ owned: { 102: 1 } })
    renderRoute('/tcg/packs/20')
    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal all' }))

    await userEvent.click(await screen.findByRole('link', { name: 'View collection' }))

    const cards = within(await screen.findByRole('region', { name: 'Your cards' }))
    expect(await cards.findByRole('button', { name: 'Miraidon ex, Double Rare, 2 owned' })).toBeInTheDocument()
    expect(cards.getByRole('button', { name: 'Koraidon ex, Hyper Rare, 1 owned' })).toBeInTheDocument()
  })
})

describe('the opening history', () => {
  it('asks a guest to log in', async () => {
    asGuest()
    renderRoute('/tcg/openings')

    expect(await screen.findByRole('heading', { name: 'Log in to see your history' })).toBeInTheDocument()
  })

  it('lists opened packs with the cards they gave', async () => {
    asPixel({ openings: [openingFixture, { ...openingFixture, id: 499, openedAt: '2026-09-29T10:00:00Z' }] })
    renderRoute('/tcg/openings')

    const packs = within(await screen.findByRole('list', { name: 'Opened packs' })).getAllByRole('listitem')
    // Two openings, each listing three cards.
    const openings = packs.filter((item) => within(item).queryByRole('heading') !== null)
    expect(openings).toHaveLength(2)
    const newest = within(openings[0])
    expect(newest.getByRole('heading', { name: 'Scarlet & Violet Booster Pack' })).toBeInTheDocument()
    expect(newest.getByText('Scarlet & Violet · Pokémon TCG')).toBeInTheDocument()
    expect(newest.getByText(/2026/)).toBeInTheDocument()
    expect(newest.getByText('2 new')).toBeInTheDocument()
    const cards = within(newest.getByRole('list', { name: 'Cards from Scarlet & Violet Booster Pack' })).getAllByRole('listitem')
    expect(cards.map((card) => within(card).getByText(/,/).textContent)).toEqual([
      'Pineco, Common, new',
      'Miraidon ex, Double Rare',
      'Koraidon ex, Hyper Rare, new',
    ])
  })

  it('invites a player who has opened nothing to open a pack', async () => {
    asPixel()
    renderRoute('/tcg/openings')

    expect(await screen.findByRole('heading', { name: 'No packs opened yet' })).toBeInTheDocument()
  })
})
