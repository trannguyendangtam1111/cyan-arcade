/** What the Sudoku API sends. The solution is only ever in a run that is over. */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'

export const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT']

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  EXPERT: 'Expert',
}

export type RunStatus = 'PLAYING' | 'SOLVED' | 'FAILED' | 'ABANDONED'

export type HintType = 'REVEAL' | 'FIND' | 'EXPLAIN'

export interface DifficultyInfo {
  id: Difficulty
  label: string
  level: number
  baseScore: number
  parSeconds: number
}

export interface ResultView {
  score: number
  seconds: number
  timePercent: number
  mistakePercent: number
  hintPercent: number
  details: Record<string, number>
}

export interface RunView {
  id: string
  mode: 'DAILY' | 'PRACTICE'
  /** Ranked runs are scored and counted; relaxed practice is just for fun. */
  ranked: boolean
  difficulty: Difficulty
  puzzleNumber: number | null
  date: string | null
  status: RunStatus
  /** 81 characters, `0` for an empty cell. */
  givens: string
  values: string
  /** Cells filled by a hint: locked like clues. */
  revealed: number[]
  /** For a ranked run: cells holding a digit that is not the solution's. */
  wrong: number[]
  mistakes: number
  mistakeRule: 'SOLUTION' | 'CONFLICT'
  /** 0 for no limit. */
  mistakeLimit: number
  hintsUsed: number
  hintsLeft: number
  hints: { type: HintType; cell: number }[]
  elapsedMs: number
  paused: boolean
  solution: string | null
  result: ResultView | null
  scored: boolean
}

export interface TodayView {
  puzzleNumber: number
  date: string
  difficulty: Difficulty
  nextPuzzleAt: string
  maxHints: number
  mistakeLimit: number
  hintPercents: number[]
  difficulties: DifficultyInfo[]
  daily: RunView | null
  practice: RunView | null
}

export interface HintView {
  type: HintType
  cell: number
  /** 0 for a find. */
  digit: number
  technique: string | null
  explanation: string[]
  highlight: number[]
  /** "cell:digit" candidates the reasoning removes. */
  eliminations: string[]
}

export interface HintResponse {
  run: RunView
  hint: HintView
}

export interface ModeStats {
  played: number
  completed: number
  winRate: number
  averageSeconds: number | null
  averageMistakes: number | null
  averageHints: number | null
  bestSeconds: Record<Difficulty, number | null>
}

export interface StatsView {
  daily: ModeStats
  practice: ModeStats
  currentStreak: number
  bestStreak: number
  lastDaily: string | null
}

// --- AI (admins) ---------------------------------------------------------------------------------

export type Strategy = 'STEP_BY_STEP' | 'FAST' | 'TEACHING'

export type AiMoveKind = 'PLACE' | 'ELIMINATE' | 'GUESS' | 'BACKTRACK'

export interface AiMove {
  kind: AiMoveKind
  cell: number
  digit: number
  /** "cell:digit" candidates removed. */
  eliminations: string[]
  cleared: number[]
  technique: string | null
  text: string
  lesson: string[]
  highlight: number[]
}

export interface AiSolution {
  strategy: Strategy
  date: string | null
  puzzleNumber: number | null
  difficulty: Difficulty
  seed: number
  givens: string
  solution: string
  moves: AiMove[]
  guesses: number
  backtracks: number
  techniques: Record<string, number>
  searched: number
  trimmed: boolean
  millis: number
}
