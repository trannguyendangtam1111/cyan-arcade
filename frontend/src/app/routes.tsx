import type { RouteObject } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { GameDetailPage } from '@/pages/GameDetailPage'
import { GamesPage } from '@/pages/GamesPage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { tcgRoutes } from '@/tcg/routes'
import {
  AdminPage,
  ChallengesPage,
  LeaderboardPage,
  LoginPage,
  ProfilePage,
  PublicProfilePage,
  RegisterPage,
  ShopPage,
} from './lazyPages'

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
      // Anyone's public profile, by username.
      { path: 'players/:username', element: <PublicProfilePage /> },
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
