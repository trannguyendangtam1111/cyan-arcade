import { useId } from 'react'
import type { ChessSettings } from '../hooks/useChessSettings'

interface Option {
  key: keyof ChessSettings
  label: string
  /** Only shown where it applies (the analysis panel is for admins). */
  shown: boolean
}

/**
 * What the board and the side column show. Each switch is separate, kept on this device, and none
 * of them touches the game: the match, the position being looked at and the moves stay as they are.
 */
export function DisplaySettings({ settings, onChange, analysisAvailable }: { settings: ChessSettings; onChange: (key: keyof ChessSettings, value: boolean) => void; analysisAvailable: boolean }) {
  const id = useId()
  const options: Option[] = [
    { key: 'evalBar', label: 'Evaluation bar', shown: true },
    { key: 'analysis', label: 'Analysis panel', shown: analysisAvailable },
    { key: 'moveLabels', label: 'Move-quality labels', shown: true },
    { key: 'moveList', label: 'Move list', shown: true },
    { key: 'annotations', label: 'Arrows and highlights', shown: true },
  ]
  return (
    <section aria-label="Display" className="flex flex-col gap-1.5 rounded-control bg-surface-muted p-3">
      <ul className="flex flex-col gap-1.5">
        {options
          .filter((option) => option.shown)
          .map((option) => (
            <li key={option.key}>
              <label htmlFor={`${id}-${option.key}`} className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                {option.label}
                <input
                  id={`${id}-${option.key}`}
                  type="checkbox"
                  role="switch"
                  checked={settings[option.key]}
                  onChange={(event) => onChange(option.key, event.target.checked)}
                  className="size-5 cursor-pointer accent-(--accent)"
                />
              </label>
            </li>
          ))}
      </ul>
      <p className="text-xs text-ink-soft">Kept on this device. Changing them never changes the game.</p>
    </section>
  )
}
