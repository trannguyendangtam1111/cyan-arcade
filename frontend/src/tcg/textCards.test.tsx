import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import type { Rarity, TcgCard } from './api'
import { CardDetail } from './components/CardDetail'
import { CardFace } from './components/CardFace'
import { CardTile } from './components/CardTile'
import { textCardDetails } from './textCard'
import { openingFixture, pineco, tcgHandlers } from './test/tcgMockApi'

// Cards as a game shown as text would have them: no image, the card's own text in its metadata.
const ultraRare: Rarity = { code: 'ultra-rare', name: 'Ultra Rare', tier: 4 }
const common: Rarity = { code: 'common', name: 'Common', tier: 1 }
const yugioh = { slug: 'yugioh', name: 'Yu-Gi-Oh! Trading Card Game' }
const betb = { id: 70, code: 'betb', name: 'Beyond the Brave' }

const textCard = (id: number, number: string, name: string, rarity: Rarity, metadata: Record<string, unknown>): TcgCard => ({
  id,
  externalId: `betb:${number}:${rarity.code}`,
  number,
  name,
  imageUrl: null,
  thumbnailUrl: null,
  rarity,
  set: betb,
  game: yugioh,
  metadata,
})

const arsMagna = textCard(701, 'BETB-EN018', 'Ars Magna the Finite and the Infinite', ultraRare, {
  passcode: 36270527,
  cardType: 'Effect Monster',
  frameType: 'effect',
  attribute: 'EARTH',
  monsterType: 'Warrior',
  level: 8,
  atk: 1000,
  def: 2400,
  effect: 'If this card is Normal or Special Summoned: you can add 1 card from your Deck to your hand.',
})
const siclavee = textCard(702, 'BETB-EN045', 'Crowned Siclavee', common, {
  cardType: 'XYZ Monster',
  frameType: 'xyz',
  attribute: 'LIGHT',
  monsterType: 'Beast-Warrior',
  rank: 3,
  atk: 2000,
  def: 2000,
})
const luminous = textCard(703, 'BETB-EN049', 'Adamancipator Luminous', common, {
  cardType: 'Link Monster',
  frameType: 'link',
  attribute: 'LIGHT',
  monsterType: 'Rock',
  linkRating: 2,
  atk: 1800,
})
const mates = textCard(704, 'BETB-EN063', 'Adamancipator Mates', common, {
  cardType: 'Spell Card',
  frameType: 'spell',
  property: 'Normal',
})
const bare = textCard(705, 'BETB-EN099', 'Bare', common, {})

const LONG_NAME = 'Supreme King Dragon Darkwurm of the Infinitely Long Name That Keeps Going Past Any Frame'
const LONG_EFFECT = 'Once per turn: you can target 1 card on the field; destroy it. '.repeat(30).trim()
const wordy = textCard(706, 'BETB-EN100', LONG_NAME, ultraRare, { cardType: 'Effect Monster', level: 4, effect: LONG_EFFECT })

const textFace = (container: HTMLElement) => container.querySelector('[data-testid="text-card"]') as HTMLElement | null

describe('what a text card shows', () => {
  it('reads a monster: its type, attribute, level and ATK/DEF', () => {
    expect(textCardDetails(arsMagna)).toEqual({
      kind: 'monster',
      typeLine: 'Warrior / Effect Monster',
      attribute: 'EARTH',
      levelLabel: 'Level 8',
      stats: 'ATK 1000 / DEF 2400',
      effect: 'If this card is Normal or Special Summoned: you can add 1 card from your Deck to your hand.',
    })
  })

  it('gives an Xyz monster a rank, a Link monster its rating and no DEF, a Spell neither', () => {
    expect(textCardDetails(siclavee)).toMatchObject({ levelLabel: 'Rank 3', stats: 'ATK 2000 / DEF 2000' })
    expect(textCardDetails(luminous)).toMatchObject({ levelLabel: 'Link 2', stats: 'ATK 1800 / LINK-2' })
    expect(textCardDetails(mates)).toEqual({
      kind: 'spell',
      typeLine: 'Normal / Spell Card',
      attribute: null,
      levelLabel: null,
      stats: null,
      effect: null,
    })
  })

  it('leaves out what the card does not say, or says in a form it cannot use', () => {
    expect(textCardDetails(bare)).toEqual({
      kind: 'other',
      typeLine: null,
      attribute: null,
      levelLabel: null,
      stats: null,
      effect: null,
    })
    expect(
      textCardDetails({ metadata: { attribute: '  ', level: '8', atk: '?', def: Number.NaN, effect: null, cardType: 'Trap Card' } }),
    ).toEqual({ kind: 'trap', typeLine: 'Trap Card', attribute: null, levelLabel: null, stats: null, effect: null })
  })
})

describe('a card face', () => {
  it('shows an image-backed card as its picture, unchanged', () => {
    const { container } = render(<CardFace card={pineco} size="thumb" />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp')
    expect(textFace(container)).toBeNull()
  })

  it('shows a card without an image as its card text, in a gold Yu-Gi-Oh! frame', () => {
    const { container } = render(<CardFace card={arsMagna} />)

    const face = textFace(container)!
    expect(container.querySelector('img')).toBeNull()
    expect(face.firstElementChild).toHaveClass('from-amber-200', 'via-yellow-500')
    const text = within(face)
    for (const shown of [
      'Ars Magna the Finite and the Infinite',
      'EARTH',
      'Ultra Rare',
      'Level 8',
      '[Warrior / Effect Monster]',
      'BETB-EN018',
      'ATK 1000 / DEF 2400',
    ]) {
      expect(text.getByText(shown)).toBeInTheDocument()
    }
    expect(text.getByText(/you can add 1 card from your Deck/)).toBeInTheDocument()
    // Decorative, like a picture: the places that show a card name it themselves.
    expect(face).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the effect text out of grid-size cards, and greys out a card not owned', () => {
    const { container } = render(<CardFace card={arsMagna} size="thumb" missing />)

    const face = textFace(container)!
    expect(within(face).queryByText(/you can add 1 card/)).not.toBeInTheDocument()
    expect(within(face).getByText('ATK 1000 / DEF 2400')).toBeInTheDocument()
    expect(face).toHaveClass('opacity-35', 'grayscale')
  })

  it('shows a card with no details by its name and number only, never "null" or "undefined"', () => {
    const { container } = render(<CardFace card={bare} />)

    const face = textFace(container)!
    expect(face).toHaveTextContent(/^BareCommonBETB-EN099$/)
    expect(face.textContent).not.toMatch(/null|undefined|NaN/)
  })

  it('keeps a long name and a long effect inside the frame', () => {
    const { container } = render(<CardFace card={wordy} />)

    const face = textFace(container)!
    const name = within(face).getByText(LONG_NAME)
    expect(name).toHaveClass('line-clamp-3', '[overflow-wrap:anywhere]')
    const effect = within(face).getByText(LONG_EFFECT)
    expect(effect).toHaveClass('overflow-hidden', 'min-h-0')
    // Every size is relative to the card's own width, so it fits a phone grid and a desktop dialog alike.
    expect(face).toHaveClass('@container')
  })

  it('frames a text card of another game in the arcade cyan', () => {
    const { container } = render(<CardFace card={{ ...bare, game: { slug: 'other-game', name: 'Other' } }} />)

    expect(textFace(container)!.firstElementChild).toHaveClass('from-cyan-200', 'via-cyan-500')
  })
})

describe('text cards in the collection and the closer look', () => {
  it('lists a text card in a grid like any other', async () => {
    const onSelect = vi.fn()
    render(<CardTile card={arsMagna} quantity={2} onSelect={onSelect} />)

    const tile = screen.getByRole('button', { name: 'Ars Magna the Finite and the Infinite, Ultra Rare, 2 owned' })
    expect(tile.querySelector('img')).toBeNull()
    expect(textFace(tile)).not.toBeNull()
    expect(within(tile).getByText('×2')).toBeInTheDocument()
    await userEvent.click(tile)
    expect(onSelect).toHaveBeenCalledWith(arsMagna)
  })

  it('shows the whole card in the closer look, with its metadata listed in full', () => {
    render(<CardDetail card={wordy} quantity={0} onClose={() => {}} />)

    const dialog = within(screen.getByRole('dialog', { name: LONG_NAME }))
    expect(textFace(screen.getByRole('dialog'))).not.toBeNull()
    expect(screen.getByRole('dialog').querySelector('img')).toBeNull()
    const value = (term: string) => dialog.getByText(term, { selector: 'dt' }).nextElementSibling
    expect(value('Owned')).toHaveTextContent('Not yet')
    expect(value('Effect')).toHaveTextContent(LONG_EFFECT)
  })

  it('keeps the line breaks of an effect, as a Link monster lists its materials on a line of their own', () => {
    const effect = '2 "Adamancipator" monsters\r\nYou can excavate the top 5 cards of your Deck.'
    render(<CardDetail card={{ ...luminous, metadata: { ...luminous.metadata, effect } }} quantity={1} onClose={() => {}} />)

    const effectValue = within(screen.getByRole('dialog')).getByText('Effect', { selector: 'dt' }).nextElementSibling
    expect(effectValue?.textContent).toBe(effect)
    expect(effectValue).toHaveClass('whitespace-pre-line')
  })
})

describe('opening a pack of text cards', () => {
  beforeEach(() => sessionStorage.clear())

  const textOpening = {
    ...openingFixture,
    cards: [
      { position: 1, card: mates, isNew: true },
      { position: 2, card: siclavee, isNew: false },
      { position: 3, card: arsMagna, isNew: true },
    ],
  }

  it('deals, turns over and sums up cards without images', async () => {
    const consoleError = vi.spyOn(console, 'error')
    mockApi({ user: pixel, handlers: [tcgHandlers({ opening: textOpening })] })
    renderRoute('/tcg/packs/20')

    await userEvent.click(await screen.findByRole('button', { name: 'Open pack' }))
    const dealt = await screen.findByRole('list', { name: 'Your cards' })
    const cards = within(dealt)
    for (const position of [1, 2, 3]) {
      await userEvent.click(cards.getByRole('button', { name: `Reveal card ${position}` }))
    }

    const revealed = cards.getByRole('button', { name: 'Ars Magna the Finite and the Infinite, Ultra Rare' })
    expect(textFace(revealed)).not.toBeNull()
    expect(dealt.querySelector('img')).toBeNull()
    expect(dealt.querySelectorAll('[data-testid="text-card"]')).toHaveLength(3)
    expect(await screen.findByRole('region', { name: 'Results' })).toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('lists text cards in the opening history', async () => {
    mockApi({ user: pixel, handlers: [tcgHandlers({ openings: [textOpening] })] })
    renderRoute('/tcg/openings')

    const list = await screen.findByRole('list', { name: `Cards from ${openingFixture.pack.name}` })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => within(item).getByText(/,/).textContent)).toEqual([
      'Adamancipator Mates, Common, new',
      'Crowned Siclavee, Common',
      'Ars Magna the Finite and the Infinite, Ultra Rare, new',
    ])
    expect(list.querySelector('img')).toBeNull()
    expect(list.querySelectorAll('[data-testid="text-card"]')).toHaveLength(3)
  })
})
