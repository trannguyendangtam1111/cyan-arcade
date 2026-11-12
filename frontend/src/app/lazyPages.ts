import { lazy } from 'react'

// Pages a visit may never open arrive in chunks of their own, fetched the first time someone goes
// there, so the arcade's first load does not pay for them. The home page, the games list, a game's
// page, the 404 and the error page stay in the main chunk: they are where nearly every visit starts.
export const AdminPage = lazy(async () => ({ default: (await import('@/pages/AdminPage')).AdminPage }))
export const ChallengesPage = lazy(async () => ({ default: (await import('@/pages/ChallengesPage')).ChallengesPage }))
export const LeaderboardPage = lazy(async () => ({ default: (await import('@/pages/LeaderboardPage')).LeaderboardPage }))
export const LoginPage = lazy(async () => ({ default: (await import('@/pages/auth/LoginPage')).LoginPage }))
export const ProfilePage = lazy(async () => ({ default: (await import('@/pages/profile/ProfilePage')).ProfilePage }))
export const PublicProfilePage = lazy(async () => ({
  default: (await import('@/pages/PublicProfilePage')).PublicProfilePage,
}))
export const RegisterPage = lazy(async () => ({ default: (await import('@/pages/auth/RegisterPage')).RegisterPage }))
export const ShopPage = lazy(async () => ({ default: (await import('@/pages/ShopPage')).ShopPage }))
