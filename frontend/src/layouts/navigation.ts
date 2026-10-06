import { Gamepad2, Home, Layers, ShoppingBag, Target, Trophy, UserRound, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  /** A shorter label for the mobile tab bar, where every item gets a seventh of a phone's width. */
  shortLabel?: string
  icon: LucideIcon
  /** Match the path exactly (needed for "/", which prefixes every route). */
  end?: boolean
}

/** Primary navigation, shared by the desktop header and the mobile tab bar. */
export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/tcg', label: 'Cards', icon: Layers },
  { to: '/challenges', label: 'Challenges', shortLabel: 'Daily', icon: Target },
  { to: '/shop', label: 'Shop', icon: ShoppingBag },
  { to: '/leaderboard', label: 'Leaderboard', shortLabel: 'Ranks', icon: Trophy },
  { to: '/profile', label: 'Profile', icon: UserRound },
]
