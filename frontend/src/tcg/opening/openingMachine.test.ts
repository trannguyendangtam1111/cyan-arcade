import { describe, expect, it } from 'vitest'
import { openingFixture } from '../test/tcgMockApi'
import { openingReducer, sealed, summarize, type OpeningAction, type OpeningState } from './openingMachine'

/** Applies actions one after the other, starting from a sealed pack. */
const after = (...actions: OpeningAction[]): OpeningState => actions.reduce(openingReducer, sealed)

const opened: OpeningAction = { type: 'opened', opening: openingFixture }

describe('opening a pack, step by step', () => {
  it('starts with a sealed pack and nothing revealed', () => {
    expect(sealed).toEqual({ phase: 'sealed', opening: null, revealed: [], error: null })
  })

  it('goes from sealed to requesting to tearing to revealing', () => {
    expect(after({ type: 'open' }).phase).toBe('requesting')
    expect(after({ type: 'open' }, opened)).toMatchObject({ phase: 'tearing', opening: openingFixture })
    expect(after({ type: 'open' }, opened, { type: 'torn' }).phase).toBe('revealing')
  })

  it('shows no cards before the server has answered', () => {
    // Without an "open" there was no request, so an answer has nothing to belong to.
    expect(after(opened)).toBe(sealed)
    expect(after({ type: 'open' }).opening).toBeNull()
  })

  it('goes back to a sealed pack with the reason when the server refuses', () => {
    expect(after({ type: 'open' }, { type: 'failed', message: 'No packs left today' })).toEqual({
      ...sealed,
      error: 'No packs left today',
    })
  })

  it('forgets the last error when trying again', () => {
    expect(after({ type: 'open' }, { type: 'failed', message: 'Nope' }, { type: 'open' }).error).toBeNull()
  })

  it('turns cards over one at a time, in any order, and remembers the order', () => {
    const state = after({ type: 'open' }, opened, { type: 'torn' }, { type: 'reveal', position: 3 }, { type: 'reveal', position: 1 })

    expect(state.phase).toBe('revealing')
    expect(state.revealed).toEqual([3, 1])
  })

  it('shows the results once the last card is turned over', () => {
    const state = after(
      { type: 'open' },
      opened,
      { type: 'torn' },
      { type: 'reveal', position: 1 },
      { type: 'reveal', position: 2 },
      { type: 'reveal', position: 3 },
    )

    expect(state.phase).toBe('results')
    expect(state.revealed).toEqual([1, 2, 3])
  })

  it('ignores turning over a card twice, or a card the pack does not have', () => {
    const state = after({ type: 'open' }, opened, { type: 'torn' }, { type: 'reveal', position: 2 })

    expect(openingReducer(state, { type: 'reveal', position: 2 })).toBe(state)
    expect(openingReducer(state, { type: 'reveal', position: 9 })).toBe(state)
  })

  it('"reveal all" turns over the rest, keeping what was already revealed first', () => {
    const state = after({ type: 'open' }, opened, { type: 'torn' }, { type: 'reveal', position: 2 }, { type: 'revealAll' })

    expect(state).toMatchObject({ phase: 'results', revealed: [2, 1, 3] })
  })

  it('cannot reveal anything while the pack is still being torn open', () => {
    const tearing = after({ type: 'open' }, opened)

    expect(openingReducer(tearing, { type: 'reveal', position: 1 })).toBe(tearing)
    expect(openingReducer(tearing, { type: 'revealAll' })).toBe(tearing)
  })

  it('opens another pack straight from the results', () => {
    const results = after({ type: 'open' }, opened, { type: 'torn' }, { type: 'revealAll' })

    expect(openingReducer(results, { type: 'open' })).toEqual({ ...sealed, phase: 'requesting' })
  })

  it('does not start a second request while one is on its way or cards are on the table', () => {
    for (const state of [after({ type: 'open' }), after({ type: 'open' }, opened), after({ type: 'open' }, opened, { type: 'torn' })]) {
      expect(openingReducer(state, { type: 'open' })).toBe(state)
    }
  })

  it('resets to a sealed pack, except while a request is on its way', () => {
    expect(after({ type: 'open' }, opened, { type: 'torn' }, { type: 'reset' })).toBe(sealed)
    const requesting = after({ type: 'open' })
    expect(openingReducer(requesting, { type: 'reset' })).toBe(requesting)
  })
})

describe('summarize', () => {
  it('counts new cards and duplicates and finds the best tier', () => {
    expect(summarize(openingFixture)).toEqual({ newCards: 2, duplicates: 1, bestTier: 5 })
  })
})
