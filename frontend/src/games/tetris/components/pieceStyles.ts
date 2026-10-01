import type { PieceType } from '../types/tetrisTypes'

/** The classic tetromino colours. */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: 'bg-cyan-400',
  O: 'bg-yellow-400',
  T: 'bg-purple-500',
  S: 'bg-green-500',
  Z: 'bg-red-500',
  J: 'bg-blue-500',
  L: 'bg-orange-500',
}

/** One block of a piece: a rounded square with a highlight on top and a darker lip underneath. */
export const BLOCK = 'rounded-[18%] shadow-[inset_0_-3px_0_rgb(0_0_0/0.18),inset_0_2px_0_rgb(255_255_255/0.35)]'
