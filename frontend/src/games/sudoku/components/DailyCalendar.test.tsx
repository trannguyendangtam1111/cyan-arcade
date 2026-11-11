import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dailyHistory } from '@/test/sudokuServer'
import type { DailyHistoryView } from '../types/sudokuTypes'
import { DailyCalendar } from './DailyCalendar'

const show = (options: Parameters<typeof dailyHistory>[0] = {}) => render(<DailyCalendar history={dailyHistory(options) as DailyHistoryView} />)

const days = () => within(screen.getByRole('radiogroup', { name: 'Daily history, UTC dates' })).getAllByRole('radio')
const day = (name: RegExp | string) => screen.getByRole('radio', { name })
const details = () => screen.getByRole('region', { name: 'Selected day' })

describe('Daily calendar', () => {
  it('shows the 30 UTC dates oldest first, each with its status in its name, today chosen', () => {
    show()
    expect(days()).toHaveLength(30)
    expect(days()[0]).toHaveAccessibleName('Thursday 10 September 2026: Not attempted')
    expect(days()[29]).toHaveAccessibleName('Friday 9 October 2026: Not attempted, today')
    expect(day('Thursday 8 October 2026: Completed')).toHaveAttribute('data-status', 'COMPLETED')
    expect(day('Wednesday 7 October 2026: Completed')).toBeInTheDocument()
    expect(day('Monday 5 October 2026: Failed')).toHaveAttribute('data-status', 'FAILED')
    expect(days().filter((button) => button.dataset.status === 'NOT_ATTEMPTED')).toHaveLength(27)
    // Today is chosen and is the one stop for Tab.
    expect(days()[29]).toBeChecked()
    expect(days().filter((button) => button.tabIndex === 0)).toEqual([days()[29]])
    expect(details()).toHaveTextContent('Fri 9 Oct 2026 (UTC)')
    expect(details()).toHaveTextContent('Daily Sudoku #282 · Medium · Not attempted')
    expect(details()).toHaveTextContent("You haven't started today's puzzle yet.")
  })

  it('lines the dates up under their weekdays, Monday first', () => {
    show()
    const group = screen.getByRole('radiogroup')
    // 10 September 2026 is a Thursday: three blanks before it.
    const blanks = Array.from(group.children).filter((child) => child.getAttribute('aria-hidden') !== null && child.tagName === 'SPAN')
    expect(blanks).toHaveLength(3)
    expect(group.children[3]).toBe(days()[0])
  })

  it("shows a chosen day's run: date, puzzle, time, mistakes, hints and the streak it made", () => {
    show()
    fireEvent.click(day('Thursday 8 October 2026: Completed'))
    expect(day('Thursday 8 October 2026: Completed')).toBeChecked()
    expect(days()[29]).not.toBeChecked()
    expect(details()).toHaveTextContent('Thu 8 Oct 2026 (UTC)')
    expect(details()).toHaveTextContent('Daily Sudoku #281 · Easy · Completed')
    const stats = within(details())
    expect(details()).toHaveTextContent('Time3:35')
    expect(details()).toHaveTextContent('Mistakes0')
    expect(details()).toHaveTextContent('Hints1')
    expect(details()).toHaveTextContent('Streak after this day: 2')

    fireEvent.click(day('Monday 5 October 2026: Failed'))
    expect(details()).toHaveTextContent('Daily Sudoku #278 · Expert · Failed')
    expect(stats.getByText('21:52')).toBeInTheDocument()
    expect(details()).toHaveTextContent('Mistakes3')
    expect(details()).not.toHaveTextContent('Streak')
  })

  it('shows a run still being played without a time', () => {
    show({ days: { '2026-10-09': { status: 'IN_PROGRESS', difficulty: 'HARD', mistakes: 2, hints: 1 } } })
    expect(days()[29]).toHaveAccessibleName('Friday 9 October 2026: In progress, today')
    expect(details()).toHaveTextContent('Daily Sudoku #282 · Hard · In progress')
    expect(details()).toHaveTextContent('Time–')
    expect(details()).toHaveTextContent('Mistakes2')
    expect(details()).toHaveTextContent('Hints1')
    expect(details()).toHaveTextContent('Started and not finished yet')
  })

  it('moves by day and by week with the arrow keys, Home and End jump to the ends', () => {
    show()
    const group = screen.getByRole('radiogroup')
    days()[29].focus()
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(day('Thursday 8 October 2026: Completed')).toBeChecked()
    expect(day('Thursday 8 October 2026: Completed')).toHaveFocus()
    expect(day('Thursday 8 October 2026: Completed')).toHaveAttribute('tabindex', '0')
    expect(days()[29]).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(group, { key: 'ArrowUp' })
    expect(day('Thursday 1 October 2026: Not attempted')).toHaveFocus()
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    expect(day('Thursday 8 October 2026: Completed')).toHaveFocus()
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(days()[29]).toHaveFocus()
    // Past the ends it stays put.
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    expect(days()[29]).toHaveFocus()
    fireEvent.keyDown(group, { key: 'Home' })
    expect(days()[0]).toHaveFocus()
    expect(days()[0]).toBeChecked()
    fireEvent.keyDown(group, { key: 'ArrowUp' })
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(days()[0]).toHaveFocus()
    fireEvent.keyDown(group, { key: 'End' })
    expect(days()[29]).toHaveFocus()
    expect(details()).toHaveTextContent('Fri 9 Oct 2026 (UTC)')
  })

  it('marks dates before the first Daily as having no puzzle', () => {
    show({ today: '2026-01-05', days: {} })
    expect(days().filter((button) => button.dataset.status === 'NO_PUZZLE')).toHaveLength(25)
    expect(days()[0]).toHaveAccessibleName('Sunday 7 December 2025: No puzzle')
    expect(days()[25]).toHaveAccessibleName('Thursday 1 January 2026: Not attempted')
    fireEvent.click(days()[24])
    expect(details()).toHaveTextContent('Wed 31 Dec 2025 (UTC)')
    expect(details()).toHaveTextContent('No Daily puzzle · No puzzle')
    expect(details()).toHaveTextContent('The Daily Sudoku had not started on this date.')
    fireEvent.click(days()[25])
    expect(details()).toHaveTextContent('Daily Sudoku #1 · Medium · Not attempted')
    expect(details()).toHaveTextContent('You did not play this puzzle.')
  })

  it('shows an empty history as 30 days not attempted', () => {
    show({ days: {} })
    expect(days().every((button) => button.dataset.status === 'NOT_ATTEMPTED')).toBe(true)
    expect(within(details()).queryByText('Time')).not.toBeInTheDocument()
  })

  it('explains the colours and that days are UTC dates', () => {
    show()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Completed', 'Failed', 'In progress', 'Not attempted'])
    const group = screen.getByRole('radiogroup')
    expect(group).toHaveAccessibleDescription(/Days follow UTC dates/)
  })

  it('keeps seven narrow columns that fit a 320 px phone', () => {
    show()
    // At 320 px the calendar takes 16 px of the dialog's padding each side (about 35 px wide days,
    // 44 px tall); from 17rem of its own width it stays inside the padding. Nothing is fixed wider.
    const group = screen.getByRole('radiogroup')
    expect(group).toHaveClass('grid', 'grid-cols-7', 'gap-1', '-mx-4', '@min-[17rem]:mx-0')
    expect(group.previousElementSibling).toHaveClass('grid-cols-7', '-mx-4', '@min-[17rem]:mx-0')
    expect(group.closest('section')).toHaveClass('@container')
    for (const button of days()) {
      expect(button).toHaveClass('h-11', 'min-w-0')
      expect(button.className).not.toMatch(/(^|\s)w-\d|min-w-[1-9]/)
    }
  })
})
