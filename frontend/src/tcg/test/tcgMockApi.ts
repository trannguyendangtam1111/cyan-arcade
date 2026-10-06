import { mockJson, mockProblem, type MockHandler } from '@/test/mockApi'
import type { Allowance, Collection, Opening, Rarity, TcgCard, TcgGame, TcgPack, TcgSet } from '../api'

// Three real cards of Scarlet & Violet (sv01), as the import stores them: one of each tier that
// matters on screen (ordinary, special, the rarest).
const common: Rarity = { code: 'common', name: 'Common', tier: 1 }
const doubleRare: Rarity = { code: 'double-rare', name: 'Double Rare', tier: 3 }
const hyperRare: Rarity = { code: 'hyper-rare', name: 'Hyper Rare', tier: 5 }

const gameRef = { slug: 'pokemon', name: 'Pokémon TCG' }
const setRef = { id: 10, code: 'sv01', name: 'Scarlet & Violet' }
const ASSETS = 'https://assets.tcgdex.net/en/sv/sv01'

export const gameFixture: TcgGame = {
  ...gameRef,
  id: 1,
  description: 'Booster packs from real Pokémon Trading Card Game sets.',
  imageUrl: 'https://assets.tcgdex.net/en/base/base1/58/high.webp',
  cardBackUrl: null,
  accentColor: '#ffcb05',
  attribution: 'Card data and images: TCGdex. Not affiliated with The Pokémon Company.',
  rarities: [common, doubleRare, hyperRare],
  setCount: 1,
  cardCount: 3,
}

export const setFixture: TcgSet = {
  ...setRef,
  description: 'Scarlet & Violet series. 258 cards.',
  series: 'Scarlet & Violet',
  imageUrl: `${ASSETS}/logo.webp`,
  coverImageUrl: `${ASSETS}/254/high.webp`,
  releasedOn: '2023-03-31',
  game: gameRef,
  cardCount: 3,
  packCount: 1,
}

const card = (id: number, number: string, name: string, rarity: Rarity, metadata: Record<string, unknown>): TcgCard => ({
  id,
  externalId: `sv01-${number}`,
  number,
  name,
  imageUrl: `${ASSETS}/${number}/high.webp`,
  thumbnailUrl: `${ASSETS}/${number}/low.webp`,
  rarity,
  set: setRef,
  game: gameRef,
  metadata,
})

export const pineco = card(101, '001', 'Pineco', common, { category: 'Pokemon', hp: 60, types: 'Grass' })
export const miraidon = card(102, '081', 'Miraidon ex', doubleRare, { category: 'Pokemon', hp: 220, types: 'Lightning' })
export const koraidon = card(103, '254', 'Koraidon ex', hyperRare, { category: 'Pokemon', hp: 230, types: 'Fighting' })

/** The whole set: three cards. */
export const cardsFixture: TcgCard[] = [pineco, miraidon, koraidon]

export const packFixture: TcgPack = {
  id: 20,
  code: 'booster',
  name: 'Scarlet & Violet Booster Pack',
  description: 'Three cards from Scarlet & Violet.',
  imageUrl: null,
  setLogoUrl: setFixture.imageUrl,
  coverImageUrl: setFixture.coverImageUrl,
  accentColor: gameFixture.accentColor,
  set: setRef,
  game: gameRef,
  oddsNote: 'Simulator probabilities. The Pokémon Company does not publish official pull rates.',
  cardsPerPack: 3,
  poolSize: 3,
  slots: [
    { slot: 1, odds: [{ rarity: common, percent: 100 }] },
    { slot: 2, odds: [{ rarity: doubleRare, percent: 100 }] },
    {
      slot: 3,
      odds: [
        { rarity: doubleRare, percent: 75 },
        { rarity: hyperRare, percent: 25 },
      ],
    },
  ],
}

const packRef = {
  id: packFixture.id,
  code: packFixture.code,
  name: packFixture.name,
  imageUrl: packFixture.imageUrl,
  setLogoUrl: packFixture.setLogoUrl,
  coverImageUrl: packFixture.coverImageUrl,
  accentColor: packFixture.accentColor,
  set: setRef,
  game: gameRef,
}

/** What the fake server hands out when a pack is opened: a common, a double rare already owned, and the hyper rare. */
export const openingFixture: Opening = {
  id: 500,
  pack: packRef,
  openedAt: '2026-09-30T15:38:00Z',
  cards: [
    { position: 1, card: pineco, isNew: true },
    { position: 2, card: miraidon, isNew: false },
    { position: 3, card: koraidon, isNew: true },
  ],
}

interface TcgMockOptions {
  /** What opening a pack returns. */
  opening?: Opening
  /** Make opening a pack fail with this status instead. */
  openFailure?: { status: number; code: string; detail: string }
  /** Packs the signed-in player may open per day, and how many they have opened. */
  dailyLimit?: number
  openedToday?: number
  /** Extra packs (bought in the shop), used once today's are gone. */
  bonusPacks?: number
  /** Cards the signed-in player owns before the test starts, as card id to quantity. */
  owned?: Record<number, number>
  /** The signed-in player's opened packs, newest first. */
  openings?: Opening[]
}

/**
 * A small in-memory version of the card game API, for {@link mockApi}'s `handlers`. It keeps state
 * the way the real one does: opening a pack uses up allowance, fills the collection and is added
 * to the history.
 */
export function tcgHandlers({
  opening = openingFixture,
  openFailure,
  dailyLimit = 5,
  openedToday = 0,
  bonusPacks = 0,
  owned = {},
  openings = [],
}: TcgMockOptions = {}): MockHandler {
  const quantities = new Map(Object.entries(owned).map(([id, quantity]) => [Number(id), quantity]))
  const history = [...openings]
  let opened = openedToday
  let bonus = bonusPacks

  /** Like the server: admins have no daily allowance, everyone else the configured one. */
  const allowance = (unlimited = false): Allowance =>
    unlimited
      ? { dailyLimit: null, openedToday: opened, leftToday: null, bonusPacks: 0, resetsAt: '2026-10-01T00:00:00Z' }
      : {
          dailyLimit,
          openedToday: opened,
          leftToday: Math.max(0, dailyLimit - opened),
          bonusPacks: bonus,
          resetsAt: '2026-10-01T00:00:00Z',
        }

  const collection = (setId: number | null, page: number, size: number): Collection => {
    const ownedCards = cardsFixture.filter((candidate) => quantities.has(candidate.id))
    const listed = setId === null || setId === setRef.id ? ownedCards : []
    const total = [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0)
    const percent = Math.round((ownedCards.length * 1000) / cardsFixture.length) / 10
    return {
      summary: {
        uniqueCards: ownedCards.length,
        totalCards: total,
        availableCards: cardsFixture.length,
        completionPercent: percent,
      },
      sets: [
        {
          ...setRef,
          imageUrl: setFixture.imageUrl,
          coverImageUrl: setFixture.coverImageUrl,
          game: gameRef,
          ownedCards: ownedCards.length,
          totalCards: cardsFixture.length,
          completionPercent: percent,
        },
      ],
      cards: listed.slice(page * size, page * size + size).map((owned) => ({
        card: owned,
        quantity: quantities.get(owned.id)!,
        firstObtainedAt: '2026-09-30T15:38:00Z',
        lastObtainedAt: '2026-09-30T15:38:00Z',
      })),
      page,
      size,
      totalEntries: listed.length,
      totalPages: Math.ceil(listed.length / size),
    }
  }

  return ({ path, method, url, user }) => {
    if (!path.startsWith('/api/tcg/')) return undefined
    const unauthorized = () => mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')

    // --- The catalog: public ---------------------------------------------------------------
    if (path === '/api/tcg/games') return mockJson([gameFixture])
    if (path === '/api/tcg/sets') {
      return mockJson(url.searchParams.get('game') === gameRef.slug ? [setFixture] : [])
    }
    if (path === '/api/tcg/cards') return mockJson(cardsFixture)
    if (path === '/api/tcg/packs') return mockJson([packFixture])
    if (path === `/api/tcg/packs/${packFixture.id}`) return mockJson(packFixture)

    // --- The player's own: needs a session -------------------------------------------------
    if (method === 'POST' && path === `/api/tcg/packs/${packFixture.id}/open`) {
      if (!user) return unauthorized()
      if (openFailure) return mockProblem(openFailure.status, openFailure.code, openFailure.detail)
      // Like the server: past the allowance, a player uses an extra pack or is refused.
      if (user.role !== 'ADMIN' && opened >= dailyLimit) {
        if (bonus === 0) return mockProblem(429, 'DAILY_PACK_LIMIT_REACHED', "You have opened all of today's packs.")
        bonus--
      }
      opened++
      for (const pulled of opening.cards) {
        quantities.set(pulled.card.id, (quantities.get(pulled.card.id) ?? 0) + 1)
      }
      history.unshift(opening)
      return mockJson({ opening, allowance: allowance(user.role === 'ADMIN') }, 201)
    }
    if (path === '/api/tcg/allowance') return user ? mockJson(allowance(user.role === 'ADMIN')) : unauthorized()
    if (path === '/api/tcg/collection') {
      if (!user) return unauthorized()
      const set = url.searchParams.get('set')
      return mockJson(
        collection(
          set === null ? null : Number(set),
          Number(url.searchParams.get('page') ?? 0),
          Number(url.searchParams.get('size') ?? 60),
        ),
      )
    }
    if (path === '/api/tcg/openings') {
      if (!user) return unauthorized()
      const page = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 10)
      return mockJson({
        entries: history.slice(page * size, page * size + size),
        page,
        size,
        totalEntries: history.length,
        totalPages: Math.ceil(history.length / size),
      })
    }
    return mockProblem(404, 'NOT_FOUND', `No mock for ${path}`)
  }
}
