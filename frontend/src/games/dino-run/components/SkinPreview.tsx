import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { drawSkinPreview } from '../render/drawScene'
import { DEFAULT_OUTFIT, findSkin, isSkinSlot } from '../skins'

const SIZE = { width: 72, height: 64 } as const

interface SkinPreviewProps {
  slot: string
  skinId: string
  className?: string
}

/**
 * A still picture of one skin, drawn by the game's own renderer from the game's own shapes, so the
 * shop and the picker show what the player gets. An unknown skin shows the slot's default look; an
 * unknown slot shows nothing.
 */
export function SkinPreview({ slot, skinId, className }: SkinPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const known = isSkinSlot(slot)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !isSkinSlot(slot)) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = SIZE.width * ratio
    canvas.height = SIZE.height * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawSkinPreview(ctx, slot, findSkin(slot, skinId) ?? DEFAULT_OUTFIT[slot], SIZE.width, SIZE.height)
  }, [slot, skinId])

  if (!known) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      width={SIZE.width}
      height={SIZE.height}
      style={{ aspectRatio: `${SIZE.width} / ${SIZE.height}` }}
      className={cn('block w-auto max-w-full rounded-lg object-contain', className ?? 'h-16')}
    />
  )
}

/** The module's `cosmetics.Preview`, loaded lazily by the shop. */
export default SkinPreview
