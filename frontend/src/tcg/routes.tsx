import type { RouteObject } from 'react-router'
import {
  TcgCollectionPage,
  TcgGamePage,
  TcgHomePage,
  TcgOpeningsPage,
  TcgPackPage,
  TcgSetPage,
} from './lazyPages'
import { TcgLayout } from './TcgLayout'

/**
 * Everything under `/tcg`. The app's route table mounts this one object and knows nothing else
 * about the card game.
 *
 * ```text
 * /tcg                      the card games
 * /tcg/:gameSlug            a game's sets
 * /tcg/:gameSlug/:setCode   a set: its packs and its cards
 * /tcg/packs/:packId        a pack, and opening it
 * /tcg/collection           the player's cards
 * /tcg/openings             the player's opened packs
 * ```
 */
export const tcgRoutes: RouteObject = {
  path: 'tcg',
  element: <TcgLayout />,
  children: [
    { index: true, element: <TcgHomePage /> },
    { path: 'collection', element: <TcgCollectionPage /> },
    { path: 'openings', element: <TcgOpeningsPage /> },
    { path: 'packs/:packId', element: <TcgPackPage /> },
    { path: ':gameSlug', element: <TcgGamePage /> },
    { path: ':gameSlug/:setCode', element: <TcgSetPage /> },
  ],
}
