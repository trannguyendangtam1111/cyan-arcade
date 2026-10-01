import { lazy } from 'react'

// The pages are only fetched when someone goes to /tcg, so the arcade's first load does not pay for them.
const pages = () => import('./pages')

export const TcgHomePage = lazy(async () => ({ default: (await pages()).TcgHomePage }))
export const TcgGamePage = lazy(async () => ({ default: (await pages()).TcgGamePage }))
export const TcgSetPage = lazy(async () => ({ default: (await pages()).TcgSetPage }))
export const TcgPackPage = lazy(async () => ({ default: (await pages()).TcgPackPage }))
export const TcgCollectionPage = lazy(async () => ({ default: (await pages()).TcgCollectionPage }))
export const TcgOpeningsPage = lazy(async () => ({ default: (await pages()).TcgOpeningsPage }))
