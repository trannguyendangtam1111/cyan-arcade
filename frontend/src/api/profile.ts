import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authKeys, userKeys, type AvatarKey, type Role, type SessionResponse } from './auth'
import { apiFetch } from './client'
import { leaderboardKeys, type PlayerRanks } from './leaderboards'

/** The signed-in player's profile, as returned by `GET /api/users/me`. */
export interface ProfileResponse {
  id: number
  /** The account's identity: used to sign in and in profile links, never changed. */
  username: string
  /** What other players see; the player may change it. */
  displayName: string
  /** A few words by the player, or `null`. */
  bio: string | null
  avatar: AvatarKey
  role: Role
  xp: number
  level: number
  /** XP earned since reaching the current level. */
  xpIntoLevel: number
  /** XP the current level takes in total. */
  xpForNextLevel: number
  /** The coin balance. */
  coins: number
  gamesPlayed: number
  totalScore: number
  achievementsUnlocked: number
  achievementsTotal: number
  /** The title the player wears, bought in the shop; `null` when none. */
  title: Cosmetic | null
  /** The badge the player wears; `null` when none. */
  badge: Cosmetic | null
  memberSince: string
}

/** Something worn on the profile. */
export interface Cosmetic {
  code: string
  name: string
  icon: string
}

export interface AchievementStatus {
  code: string
  name: string
  description: string
  xp: number
  coins: number
  unlocked: boolean
  unlockedAt: string | null
}

export interface GameHistoryEntry {
  gameSlug: string
  gameName: string
  score: number
  durationMs: number
  playedAt: string
  xpEarned: number
  personalBest: boolean
}

export interface GameHistoryResponse {
  entries: GameHistoryEntry[]
  /** Zero-based. */
  page: number
  size: number
  totalEntries: number
  totalPages: number
}

/** `GET /api/users/me/stats`: the platform's numbers, other modules' (card packs...), and per game. */
export interface StatsResponse {
  gamesPlayed: number
  totalScore: number
  /** Time spent in finished runs, measured by the server. */
  playTimeMs: number
  achievementsUnlocked: number
  achievementsTotal: number
  coins: number
  /** Every coin ever earned, spending left out. */
  coinsEarned: number
  /** Numbers other modules keep, e.g. `tcg.packsOpened`. */
  activities: { key: string; label: string; value: number }[]
  /** One per game played at least once, most played first. */
  games: GameStats[]
}

export interface GameStats {
  slug: string
  name: string
  gamesPlayed: number
  bestScore: number
  averageScore: number
  playTimeMs: number
  lastPlayedAt: string
}

export const HISTORY_PAGE_SIZE = 8

export const profileKeys = {
  profile: [...userKeys.all, 'profile'] as const,
  stats: [...userKeys.all, 'stats'] as const,
  /** Where the player stands on every leaderboard. */
  ranks: [...userKeys.all, 'ranks'] as const,
  achievements: [...userKeys.all, 'achievements'] as const,
  history: (page: number) => [...userKeys.all, 'history', page] as const,
}

export function usePlayerRanks(enabled: boolean) {
  return useQuery({
    queryKey: profileKeys.ranks,
    queryFn: ({ signal }) => apiFetch<PlayerRanks>('/api/users/me/ranks', { signal }),
    enabled,
  })
}

export function useStats(enabled: boolean) {
  return useQuery({
    queryKey: profileKeys.stats,
    queryFn: ({ signal }) => apiFetch<StatsResponse>('/api/users/me/stats', { signal }),
    enabled,
  })
}

export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: profileKeys.profile,
    queryFn: ({ signal }) => apiFetch<ProfileResponse>('/api/users/me', { signal }),
    enabled,
  })
}

export function useAchievements(enabled: boolean) {
  return useQuery({
    queryKey: profileKeys.achievements,
    queryFn: ({ signal }) => apiFetch<AchievementStatus[]>('/api/users/me/achievements', { signal }),
    enabled,
  })
}

/** @param page zero-based page number */
export function useGameHistory(page: number, enabled: boolean) {
  return useQuery({
    queryKey: profileKeys.history(page),
    queryFn: ({ signal }) =>
      apiFetch<GameHistoryResponse>(`/api/users/me/game-history?page=${page}&size=${HISTORY_PAGE_SIZE}`, { signal }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/**
 * What a player may change about themselves; every field is optional and what is left out stays.
 * The server checks and tidies each value, and ignores anything else.
 */
export interface ProfileChange {
  displayName?: string
  /** An empty bio removes it. */
  bio?: string
  avatar?: AvatarKey
}

/** The limits the server applies, repeated here only to help before sending. */
export const DISPLAY_NAME_LENGTH = { min: 2, max: 24 }
export const BIO_MAX_LENGTH = 160

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (change: ProfileChange) =>
      apiFetch<ProfileResponse>('/api/users/me', { method: 'PATCH', body: { ...change } }),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKeys.profile, profile)
      // The name and avatar are also shown in the header, on leaderboards and on the public profile.
      queryClient.setQueryData<SessionResponse>(authKeys.session, (session) =>
        session?.user
          ? { ...session, user: { ...session.user, avatar: profile.avatar, displayName: profile.displayName } }
          : session,
      )
      void queryClient.invalidateQueries({ queryKey: leaderboardKeys.all })
      void queryClient.invalidateQueries({ queryKey: publicProfileKeys.all })
    },
  })
}

/** A player's public profile, as anyone sees it (`GET /api/users/{username}/profile`). */
export interface PublicProfile {
  username: string
  displayName: string
  avatar: AvatarKey
  bio: string | null
  role: Role
  level: number
  memberSince: string
  title: Cosmetic | null
  badge: Cosmetic | null
  stats: {
    gamesPlayed: number
    totalScore: number
    playTimeMs: number
    activities: StatsResponse['activities']
    games: GameStats[]
  }
  /** The achievements the player has unlocked, newest first. */
  achievements: { code: string; name: string; description: string; unlockedAt: string | null }[]
  achievementsTotal: number
  ranks: PlayerRanks
  /** Whether the caller is this player. */
  you: boolean
}

export const publicProfileKeys = {
  all: ['public-profiles'] as const,
  player: (username: string) => [...publicProfileKeys.all, username.toLowerCase()] as const,
}

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: publicProfileKeys.player(username),
    queryFn: ({ signal }) =>
      apiFetch<PublicProfile>(`/api/users/${encodeURIComponent(username)}/profile`, { signal }),
  })
}
