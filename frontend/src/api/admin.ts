import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userKeys, type Role } from './auth'
import { apiFetch } from './client'

/** What being an admin allows, as `GET /api/admin/overview` lists it. */
export type Privilege = 'AI_MODE' | 'UNLIMITED_PACKS' | 'GRANT_COINS'

export interface AdminOverview {
  id: number
  username: string
  role: 'ADMIN'
  privileges: Privilege[]
  /** The daily pack allowance players have, for comparison; `null` when even players have none. */
  playerDailyPackLimit: number | null
}

/** `GET /api/admin/stats`: the arcade at a glance. */
export interface AdminStats {
  totalUsers: number
  /** Accounts that finished a game or had coins change in the last 7 days. */
  activeUsers: number
  newUsersToday: number
  gamesPlayed: number
  gamesToday: number
  coinsInCirculation: number
  /** Numbers other modules keep (packs opened, cards collected), all time and today. */
  activities: { key: string; label: string; value: number; today: number | null }[]
  generatedAt: string
}

/** An account, as an admin looking someone up sees it. */
export interface UserSummary {
  id: number
  username: string
  role: Role
  level: number
  coins: number
  memberSince: string
}

export interface GrantResponse {
  transactionId: number
  userId: number
  username: string
  amount: number
  balance: number
  /** True when this request had been made before: nothing was granted this time. */
  repeated: boolean
}

/** The most coins one grant may give; the server enforces it too. */
export const MAX_GRANT = 100_000

const adminKeys = {
  all: [...userKeys.all, 'admin'] as const,
  overview: [...userKeys.all, 'admin', 'overview'] as const,
  stats: [...userKeys.all, 'admin', 'stats'] as const,
  users: (query: string) => [...userKeys.all, 'admin', 'users', query] as const,
}

/**
 * Asks the server whether the signed-in player may use AI mode. Resolves for an admin; rejects
 * with a 403 for a player and a 401 for a guest. Asked before any game's AI is loaded.
 */
export function checkAiAccess(signal?: AbortSignal): Promise<void> {
  return apiFetch<void>('/api/ai/access', { signal })
}

/** The admin page's data. Only asked for when the session says the player is an admin. */
export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: ({ signal }) => apiFetch<AdminOverview>('/api/admin/overview', { signal }),
    enabled,
    retry: false,
  })
}

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.stats,
    queryFn: ({ signal }) => apiFetch<AdminStats>('/api/admin/stats', { signal }),
    enabled,
    retry: false,
  })
}

/** Accounts whose username contains `query`. Asks nothing until there is something to look for. */
export function useUserSearch(query: string) {
  const text = query.trim()
  return useQuery({
    queryKey: adminKeys.users(text),
    queryFn: ({ signal }) =>
      apiFetch<UserSummary[]>(`/api/admin/users?query=${encodeURIComponent(text)}`, { signal }),
    enabled: text.length > 0,
    retry: false,
  })
}

/** Gives a player coins. The server checks the amount, records who gave them and why, and grants each request once. */
export function useGrantCoins() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, ...grant }: { userId: number; amount: number; reason: string; requestId: string }) =>
      apiFetch<GrantResponse>(`/api/admin/users/${userId}/coins`, { method: 'POST', body: grant }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  })
}
