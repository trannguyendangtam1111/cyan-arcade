/**
 * Word Guess as the server describes it. The game is played on the server (it keeps the hidden word),
 * so these are the shapes of its answers; the rules themselves live there.
 */

export type LetterResult = 'CORRECT' | 'PRESENT' | 'ABSENT'

export type HintType = 'REVEAL_LETTER' | 'CHECK_LETTER' | 'ELIMINATE_LETTERS'

export type RunStatus = 'PLAYING' | 'SOLVED' | 'FAILED'

export type RunMode = 'DAILY' | 'PRACTICE'

export interface GuessView {
  word: string
  feedback: LetterResult[]
}

/** A hint taken, and what it said. */
export interface HintView {
  type: HintType
  /** For a reveal: which position (0 to 4). */
  position: number | null
  /** For a reveal, the letter there; for a check, the letter checked. */
  letter: string | null
  /** For a check: whether the letter is in the word. */
  present: boolean | null
  /** For an elimination: letters the word does not have. */
  letters: string[] | null
}

/** A finished run's score, and the numbers it reports to the platform. */
export interface RunResult {
  score: number
  hintPercent: number
  details: Record<string, number>
}

export interface RunView {
  id: string
  mode: RunMode
  puzzleNumber: number | null
  date: string | null
  status: RunStatus
  wordLength: number
  maxGuesses: number
  guesses: GuessView[]
  hints: HintView[]
  hintsLeft: number
  availableHints: HintType[]
  /** The word, once the run is over. */
  answer: string | null
  result: RunResult | null
  /** For a daily run: whether its score has reached the platform. */
  scored: boolean
}

export interface DailyView {
  puzzleNumber: number
  date: string
  nextPuzzleAt: string
  wordLength: number
  maxGuesses: number
  maxHints: number
  /** The score multiplier, in percent, after 0, 1, 2 and 3 hints. */
  hintPercents: number[]
  run: RunView | null
}

export interface StatsView {
  played: number
  solved: number
  winRate: number
  currentStreak: number
  bestStreak: number
  averageGuesses: number | null
  /** Solved puzzles by guesses used; index 0 is one guess. */
  distribution: number[]
  lastPlayed: string | null
}

// --- AI mode (admins) ------------------------------------------------------------------------

export type Strategy = 'BALANCED' | 'INFORMATION_HUNTER' | 'CONSERVATIVE' | 'SPEED_SOLVER'

export interface AiStep {
  guess: string
  feedback: LetterResult[]
  candidatesBefore: number
  candidatesAfter: number
  reason: string
  couldWin: boolean
  remaining: string[]
}

export interface AiSolution {
  puzzleNumber: number
  date: string
  strategy: Strategy
  solved: boolean
  guesses: number
  score: number
  answer: string
  steps: AiStep[]
}

export interface AiBenchmark {
  strategy: Strategy
  games: number
  solved: number
  failed: number
  averageGuesses: number
  distribution: number[]
  millis: number
}
