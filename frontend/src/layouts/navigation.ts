import { Gamepad2, Home, Layers, Trophy, UserRound, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match the path exactly (needed for "/", which prefixes every route). */
  end?: boolean
}

/** Primary navigation, shared by the desktop header and the mobile tab bar. */
export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/tcg', label: 'Cards', icon: Layers },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/profile', label: 'Profile', icon: UserRound },
]
