import { X } from 'lucide-react'
import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Action buttons, right-aligned under the content. */
  footer?: ReactNode
}

/**
 * Modal dialog built on the native `<dialog>` element, which provides focus trapping, Esc to close,
 * an inert background and focus restoration without any extra code.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // A click whose target is the dialog itself landed on the backdrop, not the content.
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/50 backdrop:backdrop-blur-xs open:motion-safe:animate-pop-in"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="text-ink-soft">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 pt-2">{footer}</div>}
      </div>
    </dialog>
  )
}
