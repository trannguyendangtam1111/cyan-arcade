import { mockJson, mockProblem, type MockHandler } from '@/test/mockApi'
import type { Allowance, Collection, Opening, Rarity, TcgCard, TcgGame, TcgPack, TcgSet } from '../api'

const common: Rarity = { code: 'common', name: 'Common', tier: 1 }
const rare: Rarity = { code: 'rare', name: 'Rare', tier: 3 }
const legendary: Rarity = { code: 'legendary', name: 'Legendary', tier: 5 }

const gameRef = { slug: 'cyan-critters', name: 'Cyan Critters' }
const setRef = { id: 10, code: 'pixel-meadow', name: 'Pixel Meadow' }

export const gameFixture: TcgGame = {
  ...gameRef,
  id: 1,
  description: "The arcade's own card game.",
  imageUrl: '/tcg-assets/cyan-critters/game.svg',
  cardBackUrl: null,
  rarities: [common, rare, legendary],
  setCount: 1,
  cardCount: 3,
}

export const setFixture: TcgSet = {
  ...setRef,
  description: 'Sunny fields and mossy rocks.',
  imageUrl: '/tcg-assets/cyan-critters/pixel-meadow/set.svg',
  releasedOn: '2026-09-01',
  game: gameRef,
  cardCount: 3,
  packCount: 1,
}

const card = (id: number, number: string, name: string, rarity: Rarity, metadata: Record<string, unknown>): TcgCard => ({
  id,
  number,
  name,
  imageUrl: `/tcg-assets/cyan-critters/pixel-meadow/cards/${number}.svg`,
  rarity,
  set: setRef,
  game: gameRef,
  metadata,
})

export const sproutle = card(101, '001', 'Sproutle', common, { type: 'Leaf', hp: 40, flavor: 'Grows a new leaf.' })
export const thornback = card(102, '013', 'Thornback', rare, { type: 'Leaf', hp: 100 })
export const pixelord = card(103, '018', 'Pixelord', legendary, { type: 'Leaf', hp: 180 })

/** The whole set: three cards. */
export const cardsFixture: TcgCard[] = [sproutle, thornback, pixelord]

export const packFixture: TcgPack = {
  id: 20,
  code: 'sunrise',
  name: 'Sunrise Pack',
  description: 'Warm light and crackling manes.',
  imageUrl: '/tcg-assets/cyan-critters/pixel-meadow/packs/sunrise.svg',
  set: setRef,
  game: gameRef,
  cardsPerPack: 3,
  poolSize: 3,
  slots: [
    { slot: 1, odds: [{ rarity: common, percent: 100 }] },
    { slot: 2, odds: [{ rarity: rare, percent: 100 }] },
    {
      slot: 3,
      odds: [
        { rarity: rare, percent: 75 },
        { rarity: legendary, percent: 25 },
      ],
    },
  ],
}

const packRef = {
  id: packFixture.id,
  code: packFixture.code,
  name: packFixture.name,
  imageUrl: packFixture.imageUrl,
  set: setRef,
  game: gameRef,
}

/** What the fake server hands out when a pack is opened: a common, a rare already owned, and the legendary. */
export const openingFixture: Opening = {
  id: 500,
  pack: packRef,
  openedAt: '2026-09-30T15:38:00Z',
  cards: [
    { position: 1, card: sproutle, isNew: true },
    { position: 2, card: thornback, isNew: false },
    { position: 3, card: pixelord, isNew: true },
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
  owned = {},
  openings = [],
}: TcgMockOptions = {}): MockHandler {
  const quantities = new Map(Object.entries(owned).map(([id, quantity]) => [Number(id), quantity]))
  const history = [...openings]
  let opened = openedToday

  const allowance = (): Allowance => ({
    dailyLimit,
    openedToday: opened,
    leftToday: Math.max(0, dailyLimit - opened),
    resetsAt: '2026-10-01T00:00:00Z',
  })

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
      opened++
      for (const pulled of opening.cards) {
        quantities.set(pulled.card.id, (quantities.get(pulled.card.id) ?? 0) + 1)
      }
      history.unshift(opening)
      return mockJson({ opening, allowance: allowance() }, 201)
    }
    if (path === '/api/tcg/allowance') return user ? mockJson(allowance()) : unauthorized()
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
