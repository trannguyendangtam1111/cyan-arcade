import { Eraser, Lightbulb, Paintbrush, PencilLine, Redo2, Undo2, WandSparkles } from 'lucide-react'
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
  onCandidates: () => void
  onFill: () => void
  onHint: () => void
}

/**
 * The tools under the board: undo, redo, erase, notes, auto notes (every empty cell's candidates),
 * fill mode and hints. Toggles say whether they are on.
 *
 * One row of seven when the toolbar has room for each tool to be a finger wide (about 44 px): from
 * 22rem, measured on the toolbar itself as it follows the board's width. Narrower (a small phone),
 * two shorter rows of four, Hint taking the last two places, rather than seven slivers.
 */
export function Toolbar(props: ToolbarProps) {
  const { disabled = false } = props
  return (
    <div className="@container w-full">
      <div role="toolbar" aria-label="Tools" className="grid w-full grid-cols-4 gap-1.5 @min-[22rem]:grid-cols-7 sm:gap-2">
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
        {/* "Auto" fits a phone's narrow column; the name says the rest, and starts with what is shown. */}
        <Tool label="Auto" name="Auto-fill candidates" shortcut="C" onClick={props.onCandidates} disabled={disabled}>
          <WandSparkles aria-hidden className="size-5" />
        </Tool>
        <Tool label="Fill" onClick={props.onFill} disabled={disabled} pressed={props.fillMode} badge={props.fillMode ? 'On' : undefined}>
          <Paintbrush aria-hidden className="size-5" />
        </Tool>
        <Tool
          label="Hint"
          shortcut="H"
          onClick={props.onHint}
          disabled={disabled}
          expanded={props.hintOpen}
          badge={String(props.hintsLeft)}
          className="col-span-2 @min-[22rem]:col-span-1"
        >
          <Lightbulb aria-hidden className="size-5" />
        </Tool>
      </div>
    </div>
  )
}

interface ToolProps {
  label: string
  /** The full name, when the label shown is a short form of it. */
  name?: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
  badge?: string
  className?: string
  children: ReactNode
}

function Tool({ label, name, shortcut, onClick, disabled, pressed, expanded, badge, className, children }: ToolProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={name}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${name ?? label} (${shortcut})` : (name ?? label)}
      className={cn(
        'relative flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-control text-xs font-bold transition-colors focus-visible:outline-3 focus-visible:outline-brand-500 disabled:opacity-40 @min-[22rem]:h-14',
        pressed || expanded ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'bg-surface-muted text-ink-soft hover:bg-brand-100 hover:text-ink',
        className,
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
