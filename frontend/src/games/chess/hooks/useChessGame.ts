import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, NETWORK_ERROR } from '@/api/client'
import {
  draw as sendDraw,
  fetchCurrentMatch,
  fetchMatch,
  HINT_LIMIT_REACHED,
  MATCH_OVER,
  redoMove,
  requestEngineMove,
  requestHint,
  resign as sendResign,
  sendMove,
  STALE_REVISION,
  startEngineGame,
  startMatch,
  startVariation,
  undoMove,
} from '../api/chessApi'
import { canMoveFrom, movesBetween, parsePlacement, squareIndex, targetsFrom, type Target } from '../engine/board'
import type { Difficulty, DrawAction, HintResponse, MatchView, PromotionPiece, Side } from '../types/chessTypes'

export interface Notice {
  id: number
  text: string
  tone: 'info' | 'error'
  placement: 'board' | 'above-board'
}

const NO_TARGETS = new Map<string, Target>()

const sideLabel = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')

interface SyncRequest {
  /** null reads the current game, including a new game whose response was lost. */
  matchId: string | null
  message: string
}

const SYNCED = 'The latest game was loaded. No action was repeated. Check the board before trying again.'
const uncertain = (error: unknown) => !(error instanceof ApiError) || error.code === NETWORK_ERROR || error.status >= 500

/**
 * A two-player game of chess on this device, played on the server. The server answers every action
 * with the match as it now stands (the position, the legal moves, the result), and this hook keeps
 * that answer and what the player is doing with it: the selected piece and a pawn waiting for its
 * promotion piece. It never works out a move by itself.
 *
 * One action is in flight at a time, and each sends the revision it was chosen in. If the match has
 * moved on (another tab, a double click), the server refuses it and the match is loaded again.
 *
 * @param onFirstMove called once per match when its first move is played (the hub's "Jump back in")
 */
export function useChessGame(onFirstMove: () => void) {
  const [match, setMatch] = useState<MatchView | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [hint, setHint] = useState<HintResponse | null>(null)
  /** Stockfish's last move failed; it is asked again only when the player says so. */
  const [engineFailed, setEngineFailed] = useState(false)
  const [engineThinking, setEngineThinking] = useState(false)
  const [recovery, setRecovery] = useState<'syncing' | 'failed' | null>(null)

  const matchRef = useRef<MatchView | null>(null)
  const busyRef = useRef(false)
  const pendingSync = useRef<SyncRequest | null>(null)
  const operation = useRef(0)
  const mounted = useRef(true)
  const noticeId = useRef(0)
  const firstMoveCalled = useRef<string | null>(null)
  const onFirstMoveRef = useRef(onFirstMove)
  useEffect(() => {
    onFirstMoveRef.current = onFirstMove
  }, [onFirstMove])

  const show = useCallback((next: MatchView) => {
    // A delayed read must never roll a match back, including after undo (which raises revision).
    if (matchRef.current?.id === next.id && matchRef.current.revision > next.revision) return false
    matchRef.current = next
    setMatch(next)
    if (next.history.length > 0 && firstMoveCalled.current !== next.id) {
      firstMoveCalled.current = next.id
      // Only when this page played it: picking up a match after a reload is not a new game.
      if (next.history.length === 1) onFirstMoveRef.current()
    }
    return true
  }, [])

  const say = useCallback((text: string, tone: Notice['tone'] = 'error', placement: Notice['placement'] = 'board') => {
    noticeId.current += 1
    setNotice({ id: noticeId.current, text, tone, placement })
  }, [])

  const isCurrent = useCallback((token: number) => mounted.current && operation.current === token, [])
  const invalidateRequests = useCallback(() => {
    mounted.current = false
    operation.current++
    busyRef.current = false
  }, [])

  /** Read only. An uncertain request is never saved as a command to replay. */
  const reconcile = useCallback(async (request: SyncRequest, token: number) => {
    pendingSync.current = request
    setRecovery('syncing')
    setSelected(null)
    setPromotion(null)
    setHint(null)
    setNotice(null)
    try {
      let fresh = request.matchId ? await fetchMatch(request.matchId) : await fetchCurrentMatch()
      if (!isCurrent(token)) return false
      // Another tab may have replaced this game with a new one.
      if (fresh?.status === 'ABANDONED' && fresh.mode !== 'ANALYSIS') {
        fresh = (await fetchCurrentMatch()) ?? fresh
        if (!isCurrent(token)) return false
      }
      if (fresh) {
        const changedGame = fresh.id !== matchRef.current?.id
        if (!show(fresh)) throw new Error('The server returned an older revision')
        if (changedGame) setEngineFailed(false)
      } else {
        matchRef.current = null
        setMatch(null)
      }
      pendingSync.current = null
      setRecovery(null)
      setLoadError(false)
      say(fresh ? request.message : 'No saved game was found. No action was repeated. You can start a new game.', 'info', 'above-board')
      return true
    } catch {
      if (isCurrent(token)) setRecovery('failed')
      return false
    } finally {
      if (isCurrent(token)) setLoading(false)
    }
  }, [isCurrent, say, show])

  const sync = useCallback(async (request: SyncRequest) => {
    if (busyRef.current || !mounted.current) return false
    const token = ++operation.current
    busyRef.current = true
    setBusy(true)
    try {
      return await reconcile(request, token)
    } finally {
      if (isCurrent(token)) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }, [isCurrent, reconcile])

  const retrySync = useCallback(() => pendingSync.current ? sync(pendingSync.current) : Promise.resolve(false), [sync])

  // --- Loading -------------------------------------------------------------------------------------

  /**
   * The player's match to pick up, else a new one. State changes only once the server has answered,
   * and not at all once the page has gone (no match is started for a page that is no longer there).
   */
  const fetchOrStart = useCallback(async (signal?: AbortSignal) => {
    const token = ++operation.current
    let creating = false
    try {
      let usable = await fetchCurrentMatch(signal)
      if (!isCurrent(token) || signal?.aborted) return
      if (!usable || usable.status === 'ABANDONED') {
        creating = true
        busyRef.current = true
        setBusy(true)
        usable = await startMatch()
      }
      if (!isCurrent(token) || signal?.aborted) return
      firstMoveCalled.current = usable.history.length > 0 ? usable.id : null
      show(usable)
      setLoadError(false)
    } catch (error) {
      if (!isCurrent(token) || signal?.aborted) return
      if (creating && uncertain(error)) await reconcile({ matchId: null, message: SYNCED }, token)
      else setLoadError(true)
    } finally {
      if (isCurrent(token)) {
        setLoading(false)
        if (creating) {
          busyRef.current = false
          setBusy(false)
        }
      }
    }
  }, [isCurrent, reconcile, show])

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    // Defer the initial network work; a StrictMode cleanup can cancel it before it starts.
    queueMicrotask(() => {
      if (!controller.signal.aborted) void fetchOrStart(controller.signal)
    })
    return () => {
      invalidateRequests()
      controller.abort()
    }
  }, [fetchOrStart, invalidateRequests])

  const load = useCallback(() => {
    if (pendingSync.current) return retrySync().then(() => undefined)
    if (busyRef.current) return Promise.resolve()
    setLoading(true)
    setLoadError(false)
    // A variation is brought up to date as itself: it is never the player's current game.
    const shown = matchRef.current
    if (shown?.mode === 'ANALYSIS') {
      const token = ++operation.current
      return fetchMatch(shown.id)
        .then((fresh) => {
          if (!isCurrent(token)) return
          show(fresh)
          setLoading(false)
        })
        .catch(() => {
          if (isCurrent(token)) {
            setLoading(false)
            say("Couldn't refresh the variation. The board has not been updated.")
          }
        })
    }
    return fetchOrStart()
  }, [fetchOrStart, isCurrent, retrySync, say, show])

  // --- Actions -------------------------------------------------------------------------------------

  /**
   * Sends one request about the match as shown and applies the server's answer.
   * @returns whether it succeeded; `'stale'` when the match had moved on and was loaded again
   */
  const perform = useCallback(
    async <T,>(request: (current: MatchView) => Promise<T>, apply: (result: T, current: MatchView) => void, changesBoard = true): Promise<boolean | 'stale'> => {
      const current = matchRef.current
      if (!current || busyRef.current || pendingSync.current) return false
      const token = ++operation.current
      busyRef.current = true
      setBusy(true)
      setNotice(null)
      try {
        const result = await request(current)
        if (!isCurrent(token)) return false
        apply(result, current)
        return true
      } catch (error) {
        if (!isCurrent(token)) return false
        if (error instanceof ApiError && (error.code === STALE_REVISION || error.code === MATCH_OVER)) {
          const message = error.code === STALE_REVISION ? 'The game changed elsewhere, so the board was brought up to date.' : 'The latest game was loaded.'
          return await reconcile({ matchId: current.id, message }, token) ? 'stale' : false
        } else if (uncertain(error) && (changesBoard || !(error instanceof ApiError) || error.code === NETWORK_ERROR)) {
          return await reconcile({ matchId: current.id, message: SYNCED }, token) ? 'stale' : false
        } else if (error instanceof ApiError && error.code === HINT_LIMIT_REACHED) {
          say(error.message, 'info')
        } else if (error instanceof ApiError && error.code !== NETWORK_ERROR) {
          say(error.message)
        }
        return false
      } finally {
        if (isCurrent(token)) {
          busyRef.current = false
          setBusy(false)
          setLoading(false)
          setSelected(null)
          setPromotion(null)
        }
      }
    },
    [isCurrent, reconcile, say],
  )

  /** Sends one action for the match as shown, and shows the match the server answers with. */
  const act = useCallback((request: (current: MatchView) => Promise<MatchView>) => perform(request, (next) => {
    if (!show(next)) throw new Error('The server returned an older revision')
  }), [perform, show])

  const playing = recovery === null && match !== null && match.status === 'ACTIVE' && match.result === null
  // Against Stockfish the player moves only on their own turn; the engine's moves come from the server.
  const engineTurn = playing && match !== null && match.mode === 'AI' && match.engine !== null && match.turn === match.engine.side
  const playerTurn = playing && !engineTurn
  const placement = useMemo(() => (match ? parsePlacement(match.fen) : []), [match])

  const submit = useCallback((uci: string) => act((current) => sendMove(current.id, current.revision, uci)), [act])

  /** A tap or click on a square: pick a piece up, put it down on a legal square, or let go. */
  const select = useCallback(
    (square: string) => {
      const current = matchRef.current
      if (!current || !playerTurn || busyRef.current || pendingSync.current) return
      if (selected && square !== selected) {
        const moves = movesBetween(current.legalMoves, selected, square)
        if (moves.length === 1) {
          void submit(moves[0].uci)
          return
        }
        if (moves.length > 1) {
          setPromotion({ from: selected, to: square })
          return
        }
      }
      const piece = placement[squareIndex(square)]
      if (square === selected || !piece || piece.side !== current.turn) {
        setSelected(null)
        // Only the side to move moves: say so rather than ignore the tap (in a game against
        // Stockfish its pieces never answer; a premove is made while Stockfish is to move).
        if (piece && piece.side !== current.turn && square !== selected) {
          say(current.mode !== 'AI' ? `It is ${sideLabel(current.turn)}'s move: only ${sideLabel(current.turn)}'s pieces can move now.` : "Those are Stockfish's pieces.", 'info')
        }
        return
      }
      setSelected(square)
      // A notice above the board stays until the next action is sent: clearing it now would move the
      // board under the player's second click (or drag) and land the move on another square.
      if (!canMoveFrom(current.legalMoves, square)) say('That piece has no legal move right now.', 'info')
    },
    [placement, playerTurn, say, selected, submit],
  )

  /** The piece a pawn becomes, or `null` to put the pawn back. */
  const choosePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const pending = promotion
      const current = matchRef.current
      setPromotion(null)
      if (!pending || !piece || !current) {
        setSelected(null)
        return
      }
      const move = movesBetween(current.legalMoves, pending.from, pending.to).find((candidate) => candidate.promotion === piece)
      if (move) void submit(move.uci)
    },
    [promotion, submit],
  )

  /** A drag picked up a piece: it is selected, so its legal squares show while it moves. */
  const pickUp = useCallback(
    (square: string) => {
      const current = matchRef.current
      if (!current || !playerTurn || busyRef.current || pendingSync.current || !canMoveFrom(current.legalMoves, square)) return
      // The notice stays: the board must not move under a piece being dragged.
      setSelected(square)
    },
    [playerTurn],
  )

  /**
   * A dragged piece let go over a square: the move if it is legal (with the promotion choice for a
   * pawn), else nothing but a word to say so. The same move submitted by a click is the same request.
   */
  const drop = useCallback(
    (from: string, to: string) => {
      const current = matchRef.current
      if (!current || !playerTurn || busyRef.current || pendingSync.current) return
      const moves = movesBetween(current.legalMoves, from, to)
      if (moves.length === 1) {
        void submit(moves[0].uci)
        return
      }
      if (moves.length > 1) {
        setSelected(from)
        setPromotion({ from, to })
        return
      }
      setSelected(null)
      say('That move is not legal here.', 'info')
    },
    [playerTurn, say, submit],
  )

  /**
   * A planned move (a premove) once it is the player's turn: played if it is still legal, with the
   * promotion dialog for a pawn (the piece is never guessed); otherwise nothing is sent.
   * @returns `'played'`, `'promotion'` (the dialog is open), `'illegal'`, or `'wait'` (not now)
   */
  const playPlanned = useCallback(
    (from: string, to: string): 'played' | 'promotion' | 'illegal' | 'wait' => {
      const current = matchRef.current
      if (!current || busyRef.current || pendingSync.current || !playerTurn) return 'wait'
      const moves = movesBetween(current.legalMoves, from, to)
      if (moves.length === 1) {
        void submit(moves[0].uci)
        return 'played'
      }
      if (moves.length > 1) {
        setSelected(from)
        setPromotion({ from, to })
        return 'promotion'
      }
      return 'illegal'
    },
    [playerTurn, submit],
  )

  /** Whether the piece on a square may be dragged now: the player's turn, a piece with a legal move. */
  const movable = useCallback(
    (square: string) => playerTurn && !busy && match !== null && canMoveFrom(match.legalMoves, square),
    [busy, match, playerTurn],
  )

  const deselect = useCallback(() => {
    setSelected(null)
    setPromotion(null)
  }, [])

  const undo = useCallback(() => act((current) => undoMove(current.id, current.revision)), [act])
  const redo = useCallback(() => act((current) => redoMove(current.id, current.revision)), [act])
  const resign = useCallback((side: Side) => act((current) => sendResign(current.id, current.revision, side)), [act])
  const draw = useCallback(
    (action: DrawAction, side: Side) => act((current) => sendDraw(current.id, current.revision, action, side)),
    [act],
  )

  /**
   * A new game from the start, local or (admins) against Stockfish. The one in progress, if any, is
   * left. `quiet` for a match that is no new game (a variation, or back to the game): the hub is not told.
   * @returns whether the board now shows the new match
   */
  const begin = useCallback(
    async (start: () => Promise<MatchView>, quiet = false): Promise<boolean> => {
      if (busyRef.current || pendingSync.current) return false
      const token = ++operation.current
      const source = matchRef.current
      busyRef.current = true
      setBusy(true)
      setNotice(null)
      try {
        const fresh = await start()
        if (!isCurrent(token)) return false
        firstMoveCalled.current = quiet ? fresh.id : null
        setEngineFailed(false)
        setHint(null)
        if (!show(fresh)) throw new Error('The server returned an older revision')
        return true
      } catch (error) {
        if (!isCurrent(token)) return false
        if (uncertain(error)) await reconcile({ matchId: quiet ? source?.id ?? null : null, message: SYNCED }, token)
        else say(error instanceof ApiError ? error.message : "Couldn't start a new game.")
        return false
      } finally {
        if (isCurrent(token)) {
          busyRef.current = false
          setBusy(false)
          setLoading(false)
          setSelected(null)
          setPromotion(null)
        }
      }
    },
    [isCurrent, reconcile, say, show],
  )

  const newGame = useCallback(() => begin(startMatch), [begin])

  /**
   * "Continue from here": a variation of the match shown from its position after `ply` moves. The
   * match itself stays as it is (its moves, its result); the board shows the variation instead.
   */
  const explore = useCallback(
    (ply: number) => {
      const shown = matchRef.current
      if (!shown) return Promise.resolve(false)
      return begin(() => startVariation(shown.id, ply), true)
    },
    [begin],
  )

  /** From a variation back to the game it came from (or, once that is gone, the current game). */
  const leaveVariation = useCallback(() => {
    const source = matchRef.current?.source
    return begin(async () => {
      if (source?.matchId) {
        try {
          return await fetchMatch(source.matchId)
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error
          // Forgotten since: the player's current game instead.
        }
      }
      return (await fetchCurrentMatch()) ?? startMatch()
    }, true)
  }, [begin])
  const playEngine = useCallback((playerSide: Side, difficulty: Difficulty) => begin(() => startEngineGame(playerSide, difficulty)), [begin])

  // --- Hints -----------------------------------------------------------------------------------------

  /**
   * Asks the server for a hint. It is shown only while the board is still the one it is for, and
   * never plays itself; the allowance shown is the server's count.
   */
  const askHint = useCallback(
    () =>
      perform(
        (current) => requestHint(current.id, current.revision),
        (response, current) => {
          const now = matchRef.current
          if (!now || now.id !== current.id || now.revision !== response.revision) return
          setHint(response)
          show({ ...now, hints: response.hints })
        },
        false,
      ),
    [perform, show],
  )

  const visibleHint = hint && match && playerTurn && hint.revision === match.revision ? hint : null

  // --- Stockfish's moves (admins' games against it) ---------------------------------------------------

  const engineMove = useCallback(async () => {
    if (busyRef.current || pendingSync.current || !mounted.current) return
    setEngineThinking(true)
    const request = perform((current) => requestEngineMove(current.id, current.revision), (next) => {
      if (!show(next)) throw new Error('The server returned an older revision')
    })
    const token = operation.current
    const outcome = await request
    if (!isCurrent(token)) return
    setEngineThinking(false)
    // If a lost reply was recovered and it is now the player's turn, never ask Stockfish again.
    const latest = matchRef.current
    setEngineFailed(outcome !== true && latest?.engine != null && latest.turn === latest.engine.side)
  }, [isCurrent, perform, show])

  const revision = match?.revision
  useEffect(() => {
    if (!engineTurn || engineFailed || busyRef.current) return
    // A moment's pause so the player sees their own move land before the engine's answer.
    const timer = window.setTimeout(() => void engineMove(), 250)
    return () => window.clearTimeout(timer)
  }, [engineTurn, engineFailed, engineMove, revision])

  const retryEngine = useCallback(async () => {
    const current = matchRef.current
    if (!current || pendingSync.current) return
    // Read again before an explicit engine retry: its earlier response may have been lost.
    if (await sync({ matchId: current.id, message: SYNCED })) setEngineFailed(false)
  }, [sync])

  const targets = useMemo(
    () => (match && selected && playerTurn ? targetsFrom(match.legalMoves, selected) : NO_TARGETS),
    [match, playerTurn, selected],
  )

  return {
    match,
    placement,
    loading,
    loadError,
    reload: load,
    busy: busy || recovery !== null,
    recovery,
    retrySync,
    playing,
    playerTurn,
    engineTurn,
    engineThinking,
    engineFailed,
    retryEngine,
    playEngine,
    hint: visibleHint,
    askHint,
    dismissHint: () => setHint(null),
    notice,
    dismissNotice: () => setNotice(null),
    selected,
    targets,
    promotion,
    select,
    deselect,
    choosePromotion,
    undo,
    redo,
    resign,
    draw,
    newGame,
    explore,
    leaveVariation,
    pickUp,
    drop,
    movable,
    playPlanned,
    say,
  }
}

export type ChessController = ReturnType<typeof useChessGame>
