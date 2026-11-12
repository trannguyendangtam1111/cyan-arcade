import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAD } from '../skins'
import { NumberPad } from './NumberPad'
import { StatusBar } from './StatusBar'

// Nine 1s placed, three 5s, none of the rest.
const COUNTS = [0, 9, 0, 0, 0, 3, 0, 0, 0, 0]

const pad = (props: Partial<Parameters<typeof NumberPad>[0]> = {}) => {
  const onDigit = vi.fn()
  render(<NumberPad counts={COUNTS} onDigit={onDigit} active={null} notesMode={false} theme={DEFAULT_PAD} {...props} />)
  return onDigit
}
const keys = () => within(screen.getByRole('group', { name: /Number pad/ })).getAllByRole('button')

describe('Number pad on small screens', () => {
  it('keeps the nine digits in order, named with how many are left, each pressing its digit', () => {
    const onDigit = pad()
    expect(keys().map((key) => key.textContent?.[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(keys()[0]).toHaveAccessibleName('1, all placed')
    expect(keys()[4]).toHaveAccessibleName('5, 6 left')
    for (const key of keys()) fireEvent.click(key)
    expect(onDigit.mock.calls.map(([digit]) => digit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('lays the keys out in two rows of thumb-sized keys below 27rem and one row of nine from there', () => {
    pad()
    const group = screen.getByRole('group', { name: 'Number pad' })
    // Measured on the pad's own width, which follows the board.
    expect(group.parentElement).toHaveClass('@container', 'w-full')
    expect(group).toHaveClass('grid', 'grid-cols-10', 'gap-1.5', '@min-[27rem]:grid-cols-9', '@min-[27rem]:max-sm:gap-1')
    for (const key of keys()) {
      // Two columns of ten each (1 to 5 on the first row), one of nine from 27rem; 48 px tall, then as before.
      expect(key).toHaveClass('col-span-2', '@min-[27rem]:col-span-1', 'h-12', '@min-[27rem]:max-sm:h-14', 'sm:h-16')
    }
    // 6 to 9 sit centred under 1 to 5.
    expect(keys()[5]).toHaveClass('col-start-2', '@min-[27rem]:col-start-auto')
    expect(keys().filter((key) => key.classList.contains('col-start-2'))).toHaveLength(1)
  })

  it('still says notes mode, fill mode and disabled as before', () => {
    pad({ notesMode: true, active: 7, disabled: true })
    expect(screen.getByRole('group', { name: 'Number pad, notes' })).toBeInTheDocument()
    expect(keys()[6]).toHaveAttribute('aria-pressed', 'true')
    expect(keys()[0]).toHaveAttribute('aria-pressed', 'false')
    for (const key of keys()) expect(key).toBeDisabled()
  })
})

describe('Status bar on small screens', () => {
  const bar = (title = 'Archive #310 · Hard') => {
    const onPause = vi.fn()
    render(<StatusBar title={title} mistakes={1} mistakeLimit={0} rule="Relaxed" elapsedMs={65_000} paused={false} canPause onPause={onPause} />)
    return onPause
  }

  it('gives the title its own line below 24rem, so it is not cut short, and one line from there', () => {
    bar()
    const title = screen.getByText('Archive #310 · Hard')
    const row = title.parentElement!
    expect(row.parentElement).toHaveClass('@container', 'w-full')
    expect(row).toHaveClass('flex', 'flex-wrap', 'justify-between', '@min-[24rem]:flex-nowrap')
    expect(title).toHaveClass('basis-full', '@min-[24rem]:basis-auto', 'truncate')
    expect(screen.getByText('Conflicts 1')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveAccessibleName('Time 1:05')
  })

  it('has a finger-sized pause button on a phone that still pauses, by name and shortcut', () => {
    const onPause = bar()
    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(pause).toHaveClass('size-11', '@min-[24rem]:size-9')
    expect(pause).toHaveAttribute('aria-keyshortcuts', 'Escape')
    fireEvent.click(pause)
    expect(onPause).toHaveBeenCalledOnce()
  })
})
