import type { SessionUser } from '@/api/auth'
import type {
  Difficulty,
  DifficultyOption,
  Evaluation,
  HintAllowance,
  LegalMove,
  MatchResult,
  MatchView,
  MoveClass,
  PieceKind,
  ReviewResponse,
  Side,
  Termination,
} from '@/games/chess/types/chessTypes'
import type { MockHandler } from './mockApi'
import { mockJson, mockProblem } from './mockApi'

/**
 * A stand-in for the chess server, for tests. It does not know the rules: it replays a script of
 * positions the real server gives (written out by hand from real games), keyed by the moves that
 * lead to them, and keeps a match's revision, takebacks, draw offers and result the way the server
 * does. A move the script does not list is refused as illegal. Stockfish is played by the script
 * too: its move is the first legal move the script continues with, its hint likewise. Who may do
 * what (hints for signed-in players, a few a game; the AI endpoints for admins) is enforced as the
 * real server does.
 */

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface Scripted {
  fen: string
  /** The notation of the move that led here. */
  san?: string
  legal: LegalMove[]
  check?: boolean
  checkedKing?: string
  captured?: Partial<Record<Side, PieceKind[]>>
  material?: Record<Side, number>
  claimableDraw?: Termination
  result?: MatchResult
}

/** A legal move as the server lists it. */
export function legal(uci: string, san: string, extra: Partial<LegalMove> = {}): LegalMove {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: (uci[4] as LegalMove['promotion']) ?? null,
    uci,
    san,
    capture: san.includes('x'),
    castling: san.startsWith('O-O'),
    enPassant: false,
    ...extra,
  }
}

/** The twenty first moves of a side: every pawn one or two squares, the knights out. */
function firstMoves(side: Side): LegalMove[] {
  const [home, one, two] = side === 'WHITE' ? ['2', '3', '4'] : ['7', '6', '5']
  const knights = side === 'WHITE' ? ['b1a3', 'b1c3', 'g1f3', 'g1h3'] : ['b8a6', 'b8c6', 'g8f6', 'g8h6']
  return [
    ...[...'abcdefgh'].flatMap((file) => [legal(`${file}${home}${file}${one}`, `${file}${one}`), legal(`${file}${home}${file}${two}`, `${file}${two}`)]),
    ...knights.map((uci) => legal(uci, `N${uci.slice(2)}`)),
  ]
}

/** From the start: 1.e4 d5 2.exd5, and Fool's mate (1.f3 e5 2.g4 Qh4#). */
export const OPENING: Record<string, Scripted> = {
  '': { fen: INITIAL_FEN, legal: firstMoves('WHITE') },
  e2e4: { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', san: 'e4', legal: firstMoves('BLACK') },
  'e2e4 d7d5': {
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
    san: 'd5',
    legal: [legal('e4d5', 'exd5'), legal('e4e5', 'e5'), legal('d2d4', 'd4'), legal('g1f3', 'Nf3'), legal('f1b5', 'Bb5+')],
  },
  'e2e4 d7d5 e4d5': {
    fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
    san: 'exd5',
    legal: [legal('d8d5', 'Qxd5'), legal('g8f6', 'Nf6'), legal('c7c6', 'c6')],
    captured: { WHITE: ['p'] },
    material: { WHITE: 39, BLACK: 38 },
  },
  f2f3: { fen: 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1', san: 'f3', legal: firstMoves('BLACK') },
  'f2f3 e7e5': {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2',
    san: 'e5',
    legal: [legal('g2g4', 'g4'), legal('g2g3', 'g3'), legal('e2e4', 'e4')],
  },
  'f2f3 e7e5 g2g4': {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
    san: 'g4',
    legal: [legal('d8h4', 'Qh4#'), legal('d7d5', 'd5'), legal('g8f6', 'Nf6')],
  },
  'f2f3 e7e5 g2g4 d8h4': {
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    san: 'Qh4#',
    legal: [],
    check: true,
    checkedKing: 'e1',
    result: { winner: 'BLACK', termination: 'CHECKMATE', score: '0-1' },
  },
}

/** A pawn about to promote on g8, with the black king on a8 and a rook guarding the b-file. */
export const PROMOTION: Record<string, Scripted> = {
  '': {
    fen: 'k7/6P1/8/8/8/8/8/1R5K w - - 0 1',
    legal: [
      legal('g7g8q', 'g8=Q+'),
      legal('g7g8r', 'g8=R+'),
      legal('g7g8b', 'g8=B'),
      legal('g7g8n', 'g8=N'),
      legal('h1h2', 'Kh2'),
      legal('h1g1', 'Kg1'),
      legal('h1g2', 'Kg2'),
    ],
    material: { WHITE: 6, BLACK: 0 },
  },
  g7g8n: { fen: 'k5N1/8/8/8/8/8/8/1R5K b - - 0 1', san: 'g8=N', legal: [legal('a8a7', 'Ka7')], material: { WHITE: 8, BLACK: 0 } },
  g7g8q: {
    fen: 'k5Q1/8/8/8/8/8/8/1R5K b - - 0 1',
    san: 'g8=Q+',
    legal: [legal('a8a7', 'Ka7')],
    check: true,
    checkedKing: 'a8',
    material: { WHITE: 14, BLACK: 0 },
  },
}

export interface ChessServerOptions {
  script?: Record<string, Scripted>
  /** The player's match already on the server: its moves, or `null` for none. */
  current?: { moves: string[]; abandoned?: boolean; engine?: { side: Side; difficulty: Difficulty }; hintsUsed?: number } | null
  /** A draw the side to move may claim from the start. */
  claimableDraw?: Termination
  /** The first request fails as if the network were down. */
  failFirst?: boolean
  /** Hints a player gets per game. */
  hintsPerGame?: number
  /** The evaluation the engine reports (White's side); a slight edge for White by default. */
  evaluation?: Partial<Evaluation>
  /** Labels the review gives the moves, in order (Best for the engine's own choice, Good for the rest). */
  classifications?: MoveClass[]
}

export const DIFFICULTIES: DifficultyOption[] = [
  { id: 'BEGINNER', label: 'Beginner', setting: 'Skill Level 0 of 20', movetimeMs: 100 },
  { id: 'CASUAL', label: 'Casual', setting: 'Skill Level 6 of 20', movetimeMs: 200 },
  { id: 'CLUB', label: 'Club', setting: 'Elo setting 1600', movetimeMs: 300 },
  { id: 'ADVANCED', label: 'Advanced', setting: 'Elo setting 2200', movetimeMs: 500 },
  { id: 'MAXIMUM', label: 'Maximum', setting: 'Full strength, 1 second a move', movetimeMs: 1000 },
]

export const SLIGHT_EDGE: Evaluation = {
  kind: 'CENTIPAWNS',
  centipawns: 34,
  mateIn: null,
  matingSide: null,
  display: '+0.34',
  whiteWinPercent: 53.1,
  favoured: 'WHITE',
  exact: true,
}

type FakeMatch = {
  id: string
  moves: string[]
  undone: string[]
  revision: number
  status: MatchView['status']
  drawOffer: Side | null
  result: MatchResult | null
  claimableDraw: Termination | null
  engine: { side: Side; difficulty: Difficulty } | null
  hintsUsed: number
}

export function chessServer({
  script = OPENING,
  current = null,
  claimableDraw,
  failFirst = false,
  hintsPerGame = 3,
  evaluation = {},
  classifications = [],
}: ChessServerOptions = {}) {
  const calls: { method: string; path: string; body: Record<string, unknown> | undefined }[] = []
  let matchCount = 0
  let match: FakeMatch | null = null
  let review: ReviewResponse | null = null

  const fresh = (moves: string[] = [], engine: FakeMatch['engine'] = null) => {
    matchCount++
    review = null
    match = { id: `match-${matchCount}`, moves, undone: [], revision: moves.length, status: 'ACTIVE', drawOffer: null, result: null, claimableDraw: claimableDraw ?? null, engine, hintsUsed: 0 }
  }

  if (current) {
    fresh(current.moves, current.engine ?? null)
    if (current.abandoned) match!.status = 'ABANDONED'
    match!.hintsUsed = current.hintsUsed ?? 0
  }

  const state = (moves: string[]) => script[moves.join(' ')]

  const allowance = (user: SessionUser | null): HintAllowance => {
    const used = match?.hintsUsed ?? 0
    if (!user) return { allowed: false, used, limit: 0, remaining: 0 }
    if (user.role === 'ADMIN') return { allowed: true, used, limit: null, remaining: null }
    return { allowed: true, used, limit: hintsPerGame, remaining: Math.max(0, hintsPerGame - used) }
  }

  const view = (user: SessionUser | null): MatchView => {
    const m = match!
    const spec = state(m.moves)
    const result = m.result ?? spec.result ?? null
    const turn: Side = spec.fen.split(' ')[1] === 'w' ? 'WHITE' : 'BLACK'
    const status = m.status === 'ABANDONED' ? 'ABANDONED' : result ? 'FINISHED' : 'ACTIVE'
    const on = status === 'ACTIVE'
    const local = m.engine === null
    const history = m.moves.map((uci, index) => ({
      ply: index + 1,
      color: (index % 2 === 0 ? 'WHITE' : 'BLACK') as Side,
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      uci,
      san: state(m.moves.slice(0, index + 1)).san ?? uci,
    }))
    const difficulty = m.engine ? DIFFICULTIES.find((option) => option.id === m.engine!.difficulty)! : null
    return {
      id: m.id,
      mode: local ? 'LOCAL' : 'AI',
      status,
      revision: m.revision,
      fen: spec.fen,
      turn,
      fullmoveNumber: Number(spec.fen.split(' ')[5]),
      halfmoveClock: Number(spec.fen.split(' ')[4]),
      check: spec.check ?? false,
      checkedKing: spec.checkedKing ?? null,
      legalMoves: on ? spec.legal : [],
      lastMove: history[history.length - 1] ?? null,
      history,
      captured: { WHITE: spec.captured?.WHITE ?? [], BLACK: spec.captured?.BLACK ?? [] },
      material: spec.material ?? { WHITE: 39, BLACK: 39 },
      drawOffer: on ? m.drawOffer : null,
      claimableDraw: on ? (m.claimableDraw ?? spec.claimableDraw ?? null) : null,
      repetitions: 1,
      canUndo: on && local && m.moves.length > 0,
      canRedo: on && local && m.undone.length > 0,
      engine: m.engine && difficulty ? { side: m.engine.side, difficulty: m.engine.difficulty, label: difficulty.label, setting: difficulty.setting } : null,
      hints: allowance(user),
      result,
      createdAt: '2026-10-10T08:00:00Z',
      updatedAt: '2026-10-10T08:00:00Z',
    }
  }

  const suggestion = (move: LegalMove) => ({ from: move.from, to: move.to, promotion: move.promotion, uci: move.uci, san: move.san })

  /** The engine's choice: the first legal move the script continues with. */
  const engineChoice = (moves: string[]) => state(moves).legal.find((move) => state([...moves, move.uci])) ?? null

  const reviewed = (): ReviewResponse => {
    const m = match!
    const moves = m.moves.map((uci, index) => {
      const before = state(m.moves.slice(0, index))
      const best = engineChoice(m.moves.slice(0, index)) ?? before.legal[0]
      return {
        ply: index + 1,
        color: (index % 2 === 0 ? 'WHITE' : 'BLACK') as Side,
        uci,
        san: state(m.moves.slice(0, index + 1)).san ?? uci,
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        fenBefore: before.fen,
        fenAfter: state(m.moves.slice(0, index + 1)).fen,
        best: suggestion(best),
        bestLine: [best.san, 'Nf6'],
        before: { ...SLIGHT_EDGE },
        after: { ...SLIGHT_EDGE, centipawns: -40, display: '-0.40', whiteWinPercent: 46.3, favoured: 'BLACK' as Side },
        classification: classifications[index] ?? (best.uci === uci ? 'BEST' : 'GOOD'),
        loss: best.uci === uci ? 0 : 6.8,
        depth: 14,
      }
    })
    return { matchId: m.id, status: 'DONE', analyzed: m.moves.length + 1, total: m.moves.length + 1, moves, engine: 'Stockfish 19', settings: { movetimeMs: 250, depth: 16, minDepth: 8 }, error: null }
  }

  const server = {
    calls,
    /** Makes the next request fail as if the network were down. */
    failNext: failFirst,
    /** Makes the next engine requests (hints, engine moves, evaluations) fail with `engineFailureCode`. */
    engineFailures: 0,
    engineFailureCode: 'ENGINE_FAILED',
    /** Plays a move as another tab would: the page's next action finds the match moved on. */
    moveElsewhere(uci: string) {
      match!.moves = [...match!.moves, uci]
      match!.undone = []
      match!.revision++
    },
    get match() {
      return match
    },
    handler: (({ path, method, body, user }) => {
      if (!path.startsWith('/api/chess/') && !path.startsWith('/api/ai/chess/')) return undefined
      calls.push({ method, path, body })
      if (server.failNext) {
        server.failNext = false
        throw new TypeError('Failed to fetch')
      }
      const engineFailure = () => {
        if (server.engineFailures <= 0) return undefined
        server.engineFailures--
        return mockProblem(503, server.engineFailureCode, 'The chess engine did not answer properly. Nothing was changed; try again.')
      }

      // --- AI mode: admins only, as on the server ---------------------------------------------------
      if (path.startsWith('/api/ai/chess/')) {
        if (!user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')
        if (user.role !== 'ADMIN') return mockProblem(403, 'FORBIDDEN', 'You are not allowed to do this')
        if (method === 'GET' && path === '/api/ai/chess/engine') {
          return mockJson({ available: true, engine: 'Stockfish 19', difficulties: DIFFICULTIES, defaultDepth: 16, maxDepth: 22, maxLines: 3, hintsPerGame })
        }
        if (method === 'POST' && path === '/api/ai/chess/matches') {
          if (match && match.status === 'ACTIVE' && !match.result) match.status = 'ABANDONED'
          const playerSide = body?.playerSide as Side
          fresh([], { side: playerSide === 'WHITE' ? 'BLACK' : 'WHITE', difficulty: body?.difficulty as Difficulty })
          return mockJson(view(user), 201)
        }
        const ai = path.match(/^\/api\/ai\/chess\/matches\/([^/]+)\/(engine-move|evaluation|review)$/)
        if (!ai || !match || decodeURIComponent(ai[1]) !== match.id) return mockProblem(404, 'NOT_FOUND', 'Chess match was not found')
        const m: FakeMatch = match
        const shown = view(user)
        if (ai[2] === 'engine-move') {
          if (shown.status !== 'ACTIVE') return mockProblem(409, 'MATCH_OVER', 'This match is over')
          if (body?.revision !== m.revision) return mockProblem(409, 'STALE_REVISION', 'The match has changed since')
          if (!m.engine || shown.turn !== m.engine.side) return mockProblem(409, 'NOT_ENGINE_TURN', "It is not Stockfish's turn")
          const failure = engineFailure()
          if (failure) return failure
          const choice = engineChoice(m.moves)
          if (!choice) return mockProblem(503, 'ENGINE_FAILED', 'No scripted engine move')
          m.moves = [...m.moves, choice.uci]
          m.revision++
          return mockJson(view(user))
        }
        if (ai[2] === 'evaluation') {
          if (body?.revision !== m.revision) return mockProblem(409, 'STALE_REVISION', 'The match has changed since')
          const failure = engineFailure()
          if (failure) return failure
          const depth = Number(body?.depth)
          if (shown.result) {
            const winner = shown.result.winner
            const finished: Evaluation = { kind: 'MATE', centipawns: 0, mateIn: 0, matingSide: winner, display: shown.result.score, whiteWinPercent: winner === 'WHITE' ? 100 : 0, favoured: winner, exact: true }
            return mockJson({ revision: m.revision, sideToMove: shown.turn, evaluation: finished, bestMove: null, lines: [], depth: 0, requestedDepth: depth, complete: true, finished: true, engine: 'Stockfish 19' })
          }
          const shownEvaluation = { ...SLIGHT_EDGE, ...evaluation }
          const lines = state(m.moves).legal.slice(0, Number(body?.lines ?? 1))
          return mockJson({
            revision: m.revision,
            sideToMove: shown.turn,
            evaluation: shownEvaluation,
            bestMove: lines[0] ? suggestion(lines[0]) : null,
            lines: lines.map((move, index) => ({ rank: index + 1, evaluation: index === 0 ? shownEvaluation : { ...SLIGHT_EDGE, centipawns: 10, display: '+0.10' }, san: [move.san, 'Nf6'], uci: [move.uci, 'g8f6'], depth })),
            depth,
            requestedDepth: depth,
            complete: true,
            finished: false,
            engine: 'Stockfish 19',
          })
        }
        // The review.
        if (method === 'POST') {
          if (shown.status !== 'FINISHED') return mockProblem(409, 'REVIEW_NEEDS_FINISHED_GAME', 'Only a finished game can be reviewed')
          review = { ...reviewed(), status: 'RUNNING', analyzed: 0, moves: [] }
          return mockJson(review, 202)
        }
        if (!review) return mockProblem(404, 'NOT_FOUND', 'Review was not found')
        if (method === 'DELETE') {
          review = { ...review, status: 'CANCELLED' }
          return mockJson(review)
        }
        if (review.status === 'RUNNING') review = reviewed()
        return mockJson(review)
      }

      if (method === 'GET' && path === '/api/chess/matches/current') {
        return match ? mockJson(view(user)) : new Response(null, { status: 204 })
      }
      if (method === 'POST' && path === '/api/chess/matches') {
        if (match && match.status === 'ACTIVE' && !match.result) match.status = 'ABANDONED'
        fresh()
        return mockJson(view(user), 201)
      }
      const route = path.match(/^\/api\/chess\/matches\/([^/]+)(?:\/(moves|undo|redo|resign|draw|hint))?$/)
      if (!route || !match || decodeURIComponent(route[1]) !== match.id) return mockProblem(404, 'NOT_FOUND', 'Chess match was not found')
      if (method === 'GET' && !route[2]) return mockJson(view(user))
      const m: FakeMatch = match
      const shown = view(user)
      if (route[2] === 'hint' && !user) return mockProblem(401, 'UNAUTHORIZED', 'Authentication is required')
      if (shown.status !== 'ACTIVE') return mockProblem(409, 'MATCH_OVER', 'This match is over')
      if (body?.revision !== m.revision) return mockProblem(409, 'STALE_REVISION', 'The match has changed since; showing it as it is now')
      const yours = (side: Side) => !m.engine || side !== m.engine.side
      switch (route[2]) {
        case 'hint': {
          if (!yours(shown.turn)) return mockProblem(403, 'NOT_YOUR_SIDE', 'You do not play ' + shown.turn)
          if (shown.hints.remaining !== null && shown.hints.remaining <= 0) {
            return mockProblem(409, 'HINT_LIMIT_REACHED', `No hints left in this game (${hintsPerGame} per game). A new game brings new ones.`)
          }
          const failure = engineFailure()
          if (failure) return failure
          const best = engineChoice(m.moves) ?? shown.legalMoves[0]
          m.hintsUsed++
          return mockJson({ revision: m.revision, move: suggestion(best), line: [best.san, 'e5', 'Nf3'], depth: 18, engine: 'Stockfish 19', hints: allowance(user) })
        }
        case 'moves': {
          const uci = String(body?.move)
          if (!yours(shown.turn)) return mockProblem(403, 'NOT_YOUR_SIDE', 'You do not play ' + shown.turn)
          if (!shown.legalMoves.some((move) => move.uci === uci) || !state([...m.moves, uci])) {
            return mockProblem(400, 'ILLEGAL_MOVE', 'That move is not legal here')
          }
          if (m.drawOffer && m.drawOffer !== shown.turn) m.drawOffer = null
          m.moves = [...m.moves, uci]
          m.undone = []
          break
        }
        case 'undo':
          if (m.engine) return mockProblem(409, 'UNDO_NOT_ALLOWED', 'Moves can only be taken back in a local match')
          if (m.moves.length === 0) return mockProblem(409, 'NOTHING_TO_UNDO', 'There is no move to take back')
          m.undone = [...m.undone, m.moves[m.moves.length - 1]]
          m.moves = m.moves.slice(0, -1)
          m.drawOffer = null
          break
        case 'redo':
          if (m.undone.length === 0) return mockProblem(409, 'NOTHING_TO_REDO', 'There is no move to replay')
          m.moves = [...m.moves, m.undone[m.undone.length - 1]]
          m.undone = m.undone.slice(0, -1)
          break
        case 'resign': {
          const side = body?.side as Side
          if (!yours(side)) return mockProblem(403, 'NOT_YOUR_SIDE', 'You do not play ' + side)
          m.result = { winner: side === 'WHITE' ? 'BLACK' : 'WHITE', termination: 'RESIGNATION', score: side === 'WHITE' ? '0-1' : '1-0' }
          break
        }
        case 'draw': {
          const side = body?.side as Side
          const action = String(body?.action)
          if (m.engine && action !== 'CLAIM') return mockProblem(409, 'DRAW_OFFER_NOT_SUPPORTED', 'Stockfish does not answer draw offers')
          if (action === 'OFFER') m.drawOffer = side
          else if (action === 'DECLINE') m.drawOffer = null
          else if (action === 'ACCEPT') m.result = { winner: null, termination: 'AGREEMENT', score: '1/2-1/2' }
          else if (action === 'CLAIM') {
            if (!shown.claimableDraw) return mockProblem(409, 'DRAW_NOT_CLAIMABLE', 'No draw can be claimed in this position')
            m.result = { winner: null, termination: shown.claimableDraw, score: '1/2-1/2' }
          }
          break
        }
      }
      m.revision++
      return mockJson(view(user))
    }) as MockHandler,
  }
  return server
}
