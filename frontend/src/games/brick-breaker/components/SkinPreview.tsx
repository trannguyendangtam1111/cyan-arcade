import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { drawSkinPreview } from '../render/drawScene'
import { DEFAULT_OUTFIT, findSkin, isSkinSlot } from '../skins'

/** Canvas size (CSS pixels) of each slot's picture: a paddle is wide, a ball square, bricks a little scene. */
const SIZES = {
  paddle: { width: 96, height: 40 },
  ball: { width: 48, height: 48 },
  bricks: { width: 96, height: 56 },
} as const

interface SkinPreviewProps {
  slot: string
  skinId: string
  className?: string
}

/**
 * A still picture of one skin, drawn by the game's own renderer: the same drawing as in play, so
 * what the shop and the skin picker show is what the player gets. A skin this version does not know
 * shows the slot's default look, and a slot it does not know shows nothing.
 */
export function SkinPreview({ slot, skinId, className }: SkinPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const known = isSkinSlot(slot)
  const size = known ? SIZES[slot] : SIZES.ball

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !isSkinSlot(slot)) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const { width, height } = SIZES[slot]
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const skin = findSkin(slot, skinId) ?? DEFAULT_OUTFIT[slot]
    drawSkinPreview(ctx, slot, skin, width, height, 0.6)
  }, [slot, skinId])

  if (!known) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      width={size.width}
      height={size.height}
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
      // Sized by its height (`className`, h-16 by default); the picture keeps its shape inside.
      className={cn('block w-auto max-w-full object-contain', className ?? 'h-16')}
    />
  )
}

/** The module's `cosmetics.Preview`, loaded lazily by the shop. */
export default SkinPreview
