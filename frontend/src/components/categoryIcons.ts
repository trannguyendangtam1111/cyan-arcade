import { Joystick, Layers, Puzzle, Swords, type LucideIcon } from 'lucide-react'
import type { GameCategory } from '@/api/games'

/** The icon that stands for each catalog category across the hub. */
export const categoryIcons: Record<GameCategory, LucideIcon> = {
  ARCADE: Joystick,
  PUZZLE: Puzzle,
  STRATEGY: Swords,
  CARD: Layers,
}
