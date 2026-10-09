import { Eraser, Lightbulb, Paintbrush, PencilLine, Redo2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ToolbarProps {
  canUndo: boolean
  canRedo: boolean
  notesMode: boolean
  fillMode: boolean
  hintsLeft: number
  hintOpen: boolean
  disabled?: boolean
  onUndo: () => void
  onRedo: () => void
  onErase: () => void
  onNotes: () => void
  onFill: () => void
  onHint: () => void
}

/** The tools under the board: undo, redo, erase, notes, fill mode and hints. Toggles say whether they are on. */
export function Toolbar(props: ToolbarProps) {
  const { disabled = false } = props
  return (
    <div role="toolbar" aria-label="Tools" className="grid w-full grid-cols-6 gap-1 sm:gap-2">
      <Tool label="Undo" shortcut="Ctrl+Z" onClick={props.onUndo} disabled={disabled || !props.canUndo}>
        <Undo2 aria-hidden className="size-5" />
      </Tool>
      <Tool label="Redo" shortcut="Ctrl+Y" onClick={props.onRedo} disabled={disabled || !props.canRedo}>
        <Redo2 aria-hidden className="size-5" />
      </Tool>
      <Tool label="Erase" shortcut="Delete" onClick={props.onErase} disabled={disabled}>
        <Eraser aria-hidden className="size-5" />
      </Tool>
      <Tool label="Notes" shortcut="N" onClick={props.onNotes} disabled={disabled} pressed={props.notesMode} badge={props.notesMode ? 'On' : undefined}>
        <PencilLine aria-hidden className="size-5" />
      </Tool>
      <Tool label="Fill" onClick={props.onFill} disabled={disabled} pressed={props.fillMode} badge={props.fillMode ? 'On' : undefined}>
        <Paintbrush aria-hidden className="size-5" />
      </Tool>
      <Tool label="Hint" shortcut="H" onClick={props.onHint} disabled={disabled} expanded={props.hintOpen} badge={String(props.hintsLeft)}>
        <Lightbulb aria-hidden className="size-5" />
      </Tool>
    </div>
  )
}

interface ToolProps {
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
  badge?: string
  children: ReactNode
}

function Tool({ label, shortcut, onClick, disabled, pressed, expanded, badge, children }: ToolProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-control text-xs font-bold transition-colors focus-visible:outline-3 focus-visible:outline-brand-500 disabled:opacity-40',
        pressed || expanded ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'bg-surface-muted text-ink-soft hover:bg-brand-100 hover:text-ink',
      )}
    >
      {children}
      <span className="truncate">{label}</span>
      {badge && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1 right-1 rounded-full px-1.5 text-[0.6rem] leading-4 font-bold',
            pressed || expanded ? 'bg-white/70 text-ink' : 'bg-surface text-ink-soft ring-1 ring-line',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
