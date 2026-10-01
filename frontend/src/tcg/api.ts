import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userKeys } from '@/api/auth'
import { apiFetch } from '@/api/client'

/**
 * Everything the card game module asks the API for. The rest of the app never calls `/api/tcg`,
 * and nothing in here is about the arcade's other games.
 */

export interface Rarity {
  /** The game's own identifier for the rarity, e.g. `secret-rare`. */
  code: string
  name: string
  /** How special it is, from 1 (ordinary) to 5 (the rarest). Visual effects go by this alone. */
  tier: number
}

export interface GameRef {
  slug: string
  name: string
}

export interface SetRef {
  id: number
  code: string
  name: string
}

export interface TcgGame extends GameRef {
  id: number
  description: string
  imageUrl: string
  /** The back of this game's cards, or `null` to use the arcade's own. */
  cardBackUrl: string | null
  rarities: Rarity[]
  setCount: number
  cardCount: number
}

export interface TcgSet extends SetRef {
  description: string
  imageUrl: string
  releasedOn: string | null
  game: GameRef
  cardCount: number
  packCount: number
}

export interface TcgCard {
  id: number
  /** The number printed on the card. */
  number: string
  name: string
  imageUrl: string
  rarity: Rarity
  set: SetRef
  game: GameRef
  /** Whatever else the card's game knows about it. Its fields differ from game to game. */
  metadata: Record<string, unknown>
}

export interface PackRef {
  id: number
  code: string
  name: string
  imageUrl: string
  set: SetRef
  game: GameRef
}

export interface TcgPack extends PackRef {
  description: string
  cardsPerPack: number
  /** How many different cards can come out of the pack. */
  poolSize: number
  /** What each card of the pack can turn out to be, in the order the cards come out. */
  slots: { slot: number; odds: { rarity: Rarity; percent: number }[] }[]
}

export interface PulledCard {
  /** Where in the pack the card was, from 1. */
  position: number
  card: TcgCard
  /** Whether the player did not own the card before this pull. */
  isNew: boolean
}

export interface Opening {
  id: number
  pack: PackRef
  openedAt: string
  cards: PulledCard[]
}

export interface Allowance {
  /** Packs per day, or `null` when there is no limit. */
  dailyLimit: number | null
  openedToday: number
  /** Packs the player may still open today, or `null` when there is no limit. */
  leftToday: number | null
  resetsAt: string
}

/** The answer to opening a pack: the cards the server decided on, already in the collection. */
export interface OpenPackResponse {
  opening: Opening
  allowance: Allowance
}

export interface OpeningHistory {
  entries: Opening[]
  /** Zero-based. */
  page: number
  size: number
  totalEntries: number
  totalPages: number
}

export interface SetProgress extends SetRef {
  imageUrl: string
  game: GameRef
  ownedCards: number
  totalCards: number
  completionPercent: number
}

export interface OwnedCard {
  card: TcgCard
  /** How many copies the player owns. */
  quantity: number
  firstObtainedAt: string
  lastObtainedAt: string
}

export interface Collection {
  summary: {
    /** Different cards owned. */
    uniqueCards: number
    /** Cards owned, counting every copy. */
    totalCards: number
    /** Different cards that exist. */
    availableCards: number
    completionPercent: number
  }
  /** Progress in every set, including the ones the player has nothing of yet. */
  sets: SetProgress[]
  cards: OwnedCard[]
  /** Zero-based. */
  page: number
  size: number
  totalEntries: number
  totalPages: number
}

export const COLLECTION_PAGE_SIZE = 60
export const OPENINGS_PAGE_SIZE = 8
/** Large enough to hold every card a player can own of one set. */
const WHOLE_SET = 200

/** Everything cached about "my cards". It lives under the player's own keys, so signing out drops it. */
const mine = [...userKeys.all, 'tcg'] as const

export const tcgKeys = {
  games: ['tcg', 'games'] as const,
  sets: (gameSlug: string) => ['tcg', 'sets', gameSlug] as const,
  cards: (setId: number) => ['tcg', 'cards', setId] as const,
  packs: (setId: number) => ['tcg', 'packs', setId] as const,
  pack: (packId: number) => ['tcg', 'pack', packId] as const,
  mine,
  allowance: [...mine, 'allowance'] as const,
  collection: (gameSlug: string | null, setId: number | null, page: number, size: number) =>
    [...mine, 'collection', gameSlug, setId, page, size] as const,
  openings: (page: number) => [...mine, 'openings', page] as const,
}

// The catalog only changes when a dataset is imported, so it can stay fresh for a long time.
const CATALOG_STALE_TIME = 5 * 60_000

export function useTcgGames() {
  return useQuery({
    queryKey: tcgKeys.games,
    queryFn: ({ signal }) => apiFetch<TcgGame[]>('/api/tcg/games', { signal }),
    staleTime: CATALOG_STALE_TIME,
  })
}

export function useTcgSets(gameSlug: string) {
  return useQuery({
    queryKey: tcgKeys.sets(gameSlug),
    queryFn: ({ signal }) => apiFetch<TcgSet[]>(`/api/tcg/sets?game=${encodeURIComponent(gameSlug)}`, { signal }),
    staleTime: CATALOG_STALE_TIME,
  })
}

export function useSetCards(setId: number | undefined) {
  return useQuery({
    queryKey: tcgKeys.cards(setId ?? 0),
    queryFn: ({ signal }) => apiFetch<TcgCard[]>(`/api/tcg/cards?set=${setId}`, { signal }),
    enabled: setId !== undefined,
    staleTime: CATALOG_STALE_TIME,
  })
}

export function useSetPacks(setId: number | undefined) {
  return useQuery({
    queryKey: tcgKeys.packs(setId ?? 0),
    queryFn: ({ signal }) => apiFetch<TcgPack[]>(`/api/tcg/packs?set=${setId}`, { signal }),
    enabled: setId !== undefined,
    staleTime: CATALOG_STALE_TIME,
  })
}

export function usePack(packId: number) {
  return useQuery({
    queryKey: tcgKeys.pack(packId),
    queryFn: ({ signal }) => apiFetch<TcgPack>(`/api/tcg/packs/${packId}`, { signal }),
    enabled: Number.isInteger(packId) && packId > 0,
    staleTime: CATALOG_STALE_TIME,
  })
}

/** How many packs the signed-in player may still open today. */
export function useAllowance(enabled: boolean) {
  return useQuery({
    queryKey: tcgKeys.allowance,
    queryFn: ({ signal }) => apiFetch<Allowance>('/api/tcg/allowance', { signal }),
    enabled,
  })
}

interface CollectionFilter {
  gameSlug?: string
  setId?: number
  /** Zero-based. */
  page?: number
  size?: number
}

export function useCollection({ gameSlug, setId, page = 0, size = COLLECTION_PAGE_SIZE }: CollectionFilter, enabled: boolean) {
  return useQuery({
    queryKey: tcgKeys.collection(gameSlug ?? null, setId ?? null, page, size),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ page: String(page), size: String(size) })
      if (gameSlug) query.set('game', gameSlug)
      if (setId !== undefined) query.set('set', String(setId))
      return apiFetch<Collection>(`/api/tcg/collection?${query}`, { signal })
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** The cards of one set that the player owns, all of them at once, for marking a set's gallery. */
export function useOwnedCardsOfSet(gameSlug: string, setId: number | undefined, enabled: boolean) {
  return useCollection({ gameSlug, setId, size: WHOLE_SET }, enabled && setId !== undefined)
}

/** @param page zero-based page number */
export function useOpenings(page: number, enabled: boolean) {
  return useQuery({
    queryKey: tcgKeys.openings(page),
    queryFn: ({ signal }) =>
      apiFetch<OpeningHistory>(`/api/tcg/openings?page=${page}&size=${OPENINGS_PAGE_SIZE}`, { signal }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/**
 * Opens a pack. The request names the pack and nothing else: which cards come out is decided by
 * the server, and the answer is the only source of what the player sees next.
 */
export function useOpenPack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (packId: number) => apiFetch<OpenPackResponse>(`/api/tcg/packs/${packId}/open`, { method: 'POST' }),
    onSuccess: ({ allowance }) => {
      // The answer says what is left today; the collection and the history have to be read again.
      queryClient.setQueryData(tcgKeys.allowance, allowance)
      void queryClient.invalidateQueries({ queryKey: [...tcgKeys.mine, 'collection'] })
      void queryClient.invalidateQueries({ queryKey: [...tcgKeys.mine, 'openings'] })
    },
    onError: () => {
      // A refusal usually means the allowance on screen was out of date.
      void queryClient.invalidateQueries({ queryKey: tcgKeys.allowance })
    },
  })
}
