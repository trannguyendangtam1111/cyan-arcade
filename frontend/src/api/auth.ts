import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import { leaderboardKeys } from './leaderboards'

export type AvatarKey = 'ROBOT' | 'CAT' | 'DOG' | 'GHOST' | 'ROCKET' | 'CROWN' | 'BIRD' | 'FISH'

export interface SessionUser {
  id: number
  username: string
  avatar: AvatarKey
}

/** Who is signed in, as returned by `GET /api/auth/session`. */
export interface SessionResponse {
  authenticated: boolean
  user: SessionUser | null
}

export interface Credentials {
  username: string
  password: string
}

export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS'
export const USERNAME_TAKEN = 'USERNAME_TAKEN'
export const TOO_MANY_LOGIN_ATTEMPTS = 'TOO_MANY_LOGIN_ATTEMPTS'

export const authKeys = {
  session: ['auth', 'session'] as const,
}

/** Everything cached about "the signed-in player". Thrown away whenever that player changes. */
export const userKeys = {
  all: ['users', 'me'] as const,
}

export function fetchSession(signal?: AbortSignal): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/auth/session', { signal })
}

export function register(credentials: Credentials): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/auth/register', { method: 'POST', body: { ...credentials } })
}

export function login(credentials: Credentials): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/auth/login', { method: 'POST', body: { ...credentials } })
}

export function logout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' })
}

/**
 * The current session. `user` is `null` for a guest and `undefined` while that is still unknown.
 *
 * The server keeps the session in an HttpOnly cookie, so the app cannot look at it; asking this
 * endpoint is the only way to know who is signed in.
 */
export function useSession() {
  const query = useQuery({
    queryKey: authKeys.session,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 5 * 60_000,
  })
  return { ...query, user: query.data ? query.data.user : undefined }
}

/** Applies a new session and drops everything that was cached for the previous player. */
function applySession(queryClient: QueryClient, session: SessionResponse) {
  queryClient.setQueryData(authKeys.session, session)
  queryClient.removeQueries({ queryKey: userKeys.all })
  // Leaderboards mark "your" scores, so they depend on who is asking.
  void queryClient.invalidateQueries({ queryKey: leaderboardKeys.all })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: login, onSuccess: (session) => applySession(queryClient, session) })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: register, onSuccess: (session) => applySession(queryClient, session) })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => applySession(queryClient, { authenticated: false, user: null }),
  })
}
