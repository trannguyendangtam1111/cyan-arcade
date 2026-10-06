import { ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

/** How long to wait before asking for an image a second time. */
export const RETRY_AFTER_MS = 1500

interface CardImageProps {
  src: string
  /** Shown in place of the picture if it cannot be loaded, so the card is still recognizable. */
  fallbackLabel: string
  className?: string
  lazy?: boolean
}

type Status = 'loading' | 'waiting' | 'retrying' | 'failed'

/**
 * A card's picture, as served by the card game's source. Those hosts now and then answer with a
 * momentary error, so a picture that fails is asked for once more; if it fails again the card shows
 * its name instead of a broken image. Give it a `key` of its `src` so a new picture starts afresh.
 */
export function CardImage({ src, fallbackLabel, className, lazy = true }: CardImageProps) {
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (status !== 'waiting') return
    const timer = window.setTimeout(() => setStatus('retrying'), RETRY_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  if (status === 'failed') {
    return (
      <span
        role="img"
        aria-label={`${fallbackLabel} (image unavailable)`}
        className={cn('flex flex-col items-center justify-center gap-1 bg-line/40 p-2 text-center text-ink-soft', className)}
      >
        <ImageOff aria-hidden className="size-5 shrink-0" />
        <span className="line-clamp-3 text-xs font-bold">{fallbackLabel}</span>
      </span>
    )
  }

  return (
    <img
      // A second request needs a different address, or the browser would not ask again.
      src={status === 'retrying' ? `${src}#retry` : src}
      alt=""
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      draggable={false}
      onError={() => setStatus((current) => (current === 'loading' ? 'waiting' : 'failed'))}
      className={className}
    />
  )
}
