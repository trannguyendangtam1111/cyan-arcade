import type { RouteObject } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { AdminPage } from '@/pages/AdminPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ChallengesPage } from '@/pages/ChallengesPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { GameDetailPage } from '@/pages/GameDetailPage'
import { GamesPage } from '@/pages/GamesPage'
import { HomePage } from '@/pages/HomePage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { ShopPage } from '@/pages/ShopPage'
import { tcgRoutes } from '@/tcg/routes'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'games', element: <GamesPage /> },
      { path: 'games/:slug', element: <GameDetailPage /> },
      { path: 'challenges', element: <ChallengesPage /> },
      { path: 'shop', element: <ShopPage /> },
      { path: 'leaderboard', element: <LeaderboardPage /> },
      { path: 'profile', element: <ProfilePage /> },
      // Shows nothing but "admins only" to anyone else; the data behind it is admin-only on the server.
      { path: 'admin', element: <AdminPage /> },
      // The card game is a module of its own; this is all the app knows of it.
      tcgRoutes,
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
