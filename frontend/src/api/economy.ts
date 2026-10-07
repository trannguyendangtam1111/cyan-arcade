import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userKeys, useSession } from './auth'
import { apiFetch } from './client'
import { dailyChallengeKeys } from './dailyChallenges'
import { publicProfileKeys } from './profile'

/**
 * The platform economy: coins, the daily login reward and the shop.
 *
 * The app never says how many coins anything is worth or costs: every request names what the
 * player does (claim today's reward, buy this item) and the server decides the rest.
 */

/** Why a balance changed, as the ledger records it. */
export type CoinTransactionType =
  | 'GAME_COMPLETION'
  | 'HIGH_SCORE'
  | 'ACHIEVEMENT'
  | 'DAILY_CHALLENGE'
  | 'DAILY_LOGIN'
  | 'SHOP_PURCHASE'
  | 'ADMIN_GRANT'

/** `GET /api/users/me/coins`. */
export interface CoinsResponse {
  balance: number
  /** Everything ever earned, spending left out. */
  earned: number
}

export interface CoinTransaction {
  id: number
  /** Positive when earned, negative when spent. */
  amount: number
  balanceAfter: number
  type: CoinTransactionType
  referenceType: string | null
  referenceId: string | null
  description: string
  createdAt: string
}

export interface TransactionPage {
  entries: CoinTransaction[]
  /** Zero-based. */
  page: number
  size: number
  totalEntries: number
  totalPages: number
}

export type DailyLoginDayState = 'CLAIMED' | 'TODAY' | 'UPCOMING'

/** `GET /api/daily-login`. */
export interface DailyLoginStatus {
  /** Today, by the server's clock (UTC). */
  date: string
  claimedToday: boolean
  /** Days in a row claimed so far; 0 once a day has been missed. */
  streak: number
  /** The day of the cycle today's claim is (or was) on, from 1. */
  day: number
  days: { day: number; coins: number; bonusItem: string | null; state: DailyLoginDayState }[]
  /** When the next day's reward can be claimed. */
  resetsAt: string
}

/** `POST /api/daily-login/claim`. */
export interface DailyLoginClaim {
  day: number
  streak: number
  coins: number
  bonusItem: string | null
  balance: number
  status: DailyLoginStatus
}

/** `GAME_SKIN`: a new look for one of a game's pieces (Flappy Bird's bird, say), worn in that game. */
export type ItemType = 'PACK' | 'BADGE' | 'TITLE' | 'COSMETIC' | 'GAME_SKIN'

export interface ShopItem {
  id: number
  code: string
  name: string
  description: string
  type: ItemType
  price: number
  /** Units one purchase gives, e.g. 3 packs. */
  quantity: number
  maxOwned: number | null
  minLevel: number
  /** A name the app turns into a picture (for a frame, which frame). */
  icon: string
  /** Worn on the profile once owned: badges, titles and frames. */
  equippable: boolean
  /** Used up (card packs), so owning some does not stop buying more. */
  consumable: boolean
  /** How many the player owns; `null` for guests. */
  owned: number | null
  /** Whether the player's level is high enough; `null` for guests. */
  unlocked: boolean | null
  /** Whether the player owns as many as one may; `null` for guests. */
  soldOut: boolean | null
  /** Whether the player wears it; `null` for guests. */
  equipped: boolean | null
  /** Whether the player has the coins for it; `null` for guests. */
  affordable: boolean | null
  /** For a game skin, the game it is worn in; otherwise `null`. */
  gameSlug: string | null
  /** For a game skin, the piece of the game it dresses (e.g. `bird`); otherwise `null`. */
  slot: string | null
  /**
   * Whether the player may put it on now, as the server decides: they own it, or it is a skin they
   * may wear without buying (every Brick Breaker skin, for an admin). `null` for guests.
   */
  wearable?: boolean | null
}

/** `GET /api/shop/items`. Balance and level are `null` for guests. */
export interface ShopResponse {
  balance: number | null
  level: number | null
  items: ShopItem[]
}

export interface PurchaseResponse {
  purchaseId: number
  item: ShopItem
  price: number
  quantity: number
  balance: number
  owned: number
  /** True when this request had been made before: nothing was bought this time. */
  repeated: boolean
  purchasedAt: string
}

export interface InventoryEntry {
  itemId: number
  code: string
  name: string
  description: string
  type: ItemType
  icon: string
  quantity: number
  equippable: boolean
  equipped: boolean
  /** Used up, like card packs. */
  consumable: boolean
  acquiredAt: string
  /** For a game skin, the game it is worn in and the piece it dresses; otherwise `null`. */
  gameSlug: string | null
  slot: string | null
}

/** `GET /api/users/me/inventory`. */
export interface InventoryResponse {
  items: InventoryEntry[]
  /** Extra card packs, used once the daily allowance is gone. */
  bonusPacks: number
}

export const DAILY_LOGIN_ALREADY_CLAIMED = 'DAILY_LOGIN_ALREADY_CLAIMED'
export const INSUFFICIENT_COINS = 'INSUFFICIENT_COINS'
export const LEVEL_TOO_LOW = 'LEVEL_TOO_LOW'
export const ITEM_LIMIT_REACHED = 'ITEM_LIMIT_REACHED'

export const TRANSACTIONS_PAGE_SIZE = 8

export const economyKeys = {
  /** Everything here belongs to the signed-in player, so it lives under their keys. */
  coins: [...userKeys.all, 'coins'] as const,
  transactions: (page: number) => [...userKeys.all, 'transactions', page] as const,
  dailyLogin: [...userKeys.all, 'daily-login'] as const,
  inventory: [...userKeys.all, 'inventory'] as const,
  /** The shop as a player sees it (with their balance), or as a guest does. */
  shop: (signedIn: boolean) => (signedIn ? ([...userKeys.all, 'shop'] as const) : (['shop'] as const)),
}

export function useCoins(enabled: boolean) {
  return useQuery({
    queryKey: economyKeys.coins,
    queryFn: ({ signal }) => apiFetch<CoinsResponse>('/api/users/me/coins', { signal }),
    enabled,
  })
}

/** @param page zero-based page number */
export function useTransactions(page: number, enabled: boolean) {
  return useQuery({
    queryKey: economyKeys.transactions(page),
    queryFn: ({ signal }) =>
      apiFetch<TransactionPage>(`/api/users/me/transactions?page=${page}&size=${TRANSACTIONS_PAGE_SIZE}`, { signal }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useDailyLogin(enabled: boolean) {
  return useQuery({
    queryKey: economyKeys.dailyLogin,
    queryFn: ({ signal }) => apiFetch<DailyLoginStatus>('/api/daily-login', { signal }),
    enabled,
  })
}

/** Claims today's reward. The server decides the day and the amount; a second claim is refused. */
export function useClaimDailyLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<DailyLoginClaim>('/api/daily-login/claim', { method: 'POST' }),
    onSuccess: (claim) => {
      queryClient.setQueryData(economyKeys.dailyLogin, claim.status)
      invalidateWallet(queryClient)
    },
    // Already claimed (in another tab, say): what is on screen is out of date.
    onError: () => void queryClient.invalidateQueries({ queryKey: economyKeys.dailyLogin }),
  })
}

/** @param enabled whether to load it at all (a game page only needs it for a game with skins) */
export function useShop(enabled = true) {
  const session = useSession()
  const signedIn = Boolean(session.user)
  return useQuery({
    queryKey: economyKeys.shop(signedIn),
    queryFn: ({ signal }) => apiFetch<ShopResponse>('/api/shop/items', { signal }),
    enabled: enabled && !session.isPending,
  })
}

/**
 * Buys an item. Each purchase the player means to make gets its own random request id, so a
 * double click or a retried request buys once.
 */
export function usePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, requestId }: { itemId: number; requestId: string }) =>
      apiFetch<PurchaseResponse>('/api/shop/purchases', { method: 'POST', body: { itemId, requestId } }),
    // The server's new balance shows at once (in the header too); the rest is read again.
    onSuccess: ({ balance }) =>
      queryClient.setQueryData<CoinsResponse>(economyKeys.coins, (coins) => coins && { ...coins, balance }),
    onSettled: () => invalidateWallet(queryClient),
  })
}

export function useInventory(enabled: boolean) {
  return useQuery({
    queryKey: economyKeys.inventory,
    queryFn: ({ signal }) => apiFetch<InventoryResponse>('/api/users/me/inventory', { signal }),
    enabled,
  })
}

/** Wears (or takes off) a badge, title, frame or game skin the player owns. The server checks they own it. */
export function useEquip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, equipped }: { itemId: number; equipped: boolean }) =>
      apiFetch<InventoryResponse>(`/api/users/me/inventory/${itemId}/equipped`, {
        method: equipped ? 'PUT' : 'DELETE',
      }),
    onSuccess: (inventory) => {
      queryClient.setQueryData(economyKeys.inventory, inventory)
      // The shop, the profile and the public profile show what the player wears.
      for (const key of [[...userKeys.all, 'profile'], economyKeys.shop(true), publicProfileKeys.all]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}

/** Everything that shows coins or what they bought: read again after the balance changed. */
function invalidateWallet(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    economyKeys.coins,
    [...userKeys.all, 'transactions'],
    economyKeys.inventory,
    economyKeys.shop(true),
    [...userKeys.all, 'profile'],
    [...userKeys.all, 'stats'],
    // Bought packs change what the card game allows today.
    [...userKeys.all, 'tcg', 'allowance'],
    // A first badge, title or frame is worn straight away, for everyone to see.
    publicProfileKeys.all,
    dailyChallengeKeys.mine,
  ]) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

/**
 * A fresh id (a random UUID) for one purchase or grant someone means to make. `randomUUID` only
 * exists on secure origins, so plain HTTP builds one from random bytes.
 */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
