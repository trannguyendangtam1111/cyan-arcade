import { useCallback, useRef, useState } from 'react'

/**
 * Binds a pure game engine (`update(state, action) => state`) to React.
 *
 * Human input handlers and AI controllers both call `dispatch`, so every change to the game goes
 * through the same engine function. `getState` returns the latest state synchronously, which lets
 * a game loop apply several actions in a row (e.g. "turn" then "tick") without waiting for a render.
 */
export function useEngine<State, Action>(
  createInitialState: () => State,
  update: (state: State, action: Action) => State,
) {
  const [state, setState] = useState(createInitialState)
  const latest = useRef(state)

  const dispatch = useCallback(
    (action: Action): State => {
      const next = update(latest.current, action)
      if (next !== latest.current) {
        latest.current = next
        setState(next)
      }
      return next
    },
    [update],
  )

  const reset = useCallback((next: State) => {
    latest.current = next
    setState(next)
  }, [])

  const getState = useCallback(() => latest.current, [])

  return { state, dispatch, reset, getState }
}
