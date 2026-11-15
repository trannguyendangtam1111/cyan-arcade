import { useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { fetchNotes, NOTES_STALE, saveRunNotes } from '../api/sudokuApi'
import { fromNoteCells, mergeNotes, NO_NOTES, sameNotes, toNoteCells } from '../engine/notesSync'
import type { NotesView, RunView } from '../types/sudokuTypes'
import { forgetSentNotes, loadSentNotes, loadSyncedNotes, rememberSentNotes, saveNotes, saveSyncedNotes } from './useSettings'

/** How long the marks rest before they are saved: a burst of toggles goes out as one save. */
export const NOTES_SAVE_DELAY = 800
/** Waits before trying again after the server could not be reached. */
const RETRY_DELAYS = [2000, 5000, 15000, 30000]

/** One run's marks between this page and the server. */
interface RunSync {
  /** The marks on this page now. */
  notes: readonly number[]
  /** The server's revision of the marks, once read; `null` until then. */
  revision: number | null
  /** The marks the server holds at `revision`, as this page last read or saved them. */
  base: readonly number[] | null
  /** A read or a save is on its way: one at a time per run, in order. */
  busy: boolean
  /** The marks of the save on its way, while it is. */
  sending: readonly number[] | null
  /** Newer marks sent as the page was left, over the revision that save would make, while unanswered. */
  ahead: readonly number[] | null
  timer: number | undefined
  failures: number
  /** The server takes no more for this run: it is over, gone, or the player signed out. */
  stopped: boolean
  /** Only a run in play takes saves. */
  playing: boolean
}

/** What the syncer tells the page: marks to put on a run's board, and a word for the player. */
export interface NotesCallbacks {
  replace(runId: string, notes: number[]): void
  say(text: string): void
}

export interface NotesSyncer {
  /** Where marks read from the server go, and messages. */
  connect(callbacks: NotesCallbacks): void
  /** The marks of a run on this page now; `sync` false (a guest's run) keeps them in the browser only. */
  track(runId: string, notes: readonly number[], sync: boolean, playing: boolean): void
  /**
   * Saves every run's marks that are waiting, now. With `keepalive` the page is being hidden or left:
   * marks edited while a save is still on its way go out too, after it, so they need not wait for its
   * answer (which a closed page never gets).
   */
  flush(keepalive: boolean): void
  /** Reads every settled run's marks again: the page is back, maybe after another device was used. */
  refresh(): void
  /** The browser is online again: saves that failed go out now, not after their wait. */
  reconnect(): void
  start(): void
  stop(): void
}

/**
 * Keeps a signed-in player's pencil marks on the server, run by run, so another device (or a
 * reload) finds them. The board stays the page's own and is edited at once; marks are saved after
 * they rest a moment, one save at a time, each over the revision last seen. When another device has
 * saved since (409 `NOTES_STALE`) the two are merged cell by cell, the server's marks winning where
 * both changed, and saved again. When the server cannot be reached the marks stay on the page (and
 * in this browser) and go out later. Nothing here touches the game itself: digits, mistakes, hints,
 * the clock and the score are the server's run, not its notes.
 */
export function createNotesSyncer(): NotesSyncer {
  const runs = new Map<string, RunSync>()
  let stopped = false
  let callbacks: NotesCallbacks = { replace: () => undefined, say: () => undefined }

  const dirty = (sync: RunSync) => sync.base !== null && !sameNotes(sync.notes, sync.base)
  /** Work for the run: its first read, or marks to save. */
  const pending = (sync: RunSync) => sync.revision === null || (sync.playing && dirty(sync))

  /**
   * The marks a merge starts from: if the server holds marks this browser sent (a save whose answer
   * was never seen: the page closed, or the network dropped it), those; else the ones last agreed on.
   * Without that, a mark taken off after such a save would come back from the server.
   */
  const mergeBase = (runId: string, sync: RunSync, server: readonly number[]) =>
    loadSentNotes(runId).find((sent) => sameNotes(sent, server)) ?? sync.base ?? loadSyncedNotes(runId) ?? NO_NOTES

  /** A save's answer: the server's marks, unless a newer answer is already in. */
  const settle = (runId: string, sync: RunSync, view: NotesView) => {
    if (sync.revision === null || view.revision > sync.revision) {
      sync.revision = view.revision
      sync.base = fromNoteCells(view.cells)
      saveSyncedNotes(runId, sync.base)
    }
    if (!sync.ahead) forgetSentNotes(runId)
  }

  const schedule = (runId: string, sync: RunSync, delay: number) => {
    window.clearTimeout(sync.timer)
    sync.timer = window.setTimeout(() => {
      sync.timer = undefined
      kick(runId)
    }, delay)
  }

  /** The server's marks, merged with this page's from the marks both last agreed on. */
  const pull = (runId: string, sync: RunSync, announce: boolean) =>
    fetchNotes(runId).then((view) => {
      const server = fromNoteCells(view.cells)
      const base = mergeBase(runId, sync, server)
      const merged = mergeNotes(base, sync.notes, server)
      sync.revision = view.revision
      sync.base = server
      saveSyncedNotes(runId, server)
      if (!sync.ahead) forgetSentNotes(runId)
      if (!sameNotes(merged, sync.notes)) {
        sync.notes = merged
        callbacks.replace(runId, merged)
        if (announce) callbacks.say('Notes updated from another device.')
      }
    })

  const push = (runId: string, sync: RunSync, keepalive: boolean) => {
    const sending = sync.notes
    sync.sending = sending
    // Known to this browser before it goes: if the page closes first, the next visit can tell.
    rememberSentNotes(runId, sending)
    return saveRunNotes(runId, sync.revision ?? 0, toNoteCells(sending), keepalive).then(
      (view) => {
        sync.sending = null
        settle(runId, sync, view)
      },
      (error: unknown) => {
        sync.sending = null
        // Saved from another device since: take its marks in, then this page's go out over them.
        if (error instanceof ApiError && error.code === NOTES_STALE) return pull(runId, sync, true)
        throw error
      },
    )
  }

  /**
   * The page is being left while a save is on its way and the marks have changed since: sends them now,
   * over the revision that save makes if it is in, and only if the server holds exactly its marks there.
   * If that save was refused, or another device's came first, this one is refused too and nothing is
   * overwritten. It may not arrive at all; the marks are in this browser for its next visit either way.
   */
  const sendAhead = (runId: string, sync: RunSync) => {
    const expected = sync.sending
    if (!expected || sync.revision === null || !sync.playing || sync.stopped || stopped) return
    if (sameNotes(sync.notes, expected) || (sync.ahead && sameNotes(sync.notes, sync.ahead))) return
    const notes = sync.notes
    sync.ahead = notes
    rememberSentNotes(runId, notes)
    saveRunNotes(runId, sync.revision + 1, toNoteCells(notes), true, toNoteCells(expected))
      .then(
        (view) => {
          sync.ahead = null
          settle(runId, sync, view)
        },
        () => {
          sync.ahead = null
        },
      )
      .finally(() => next(runId, sync))
  }

  /** After an answer: edits made meanwhile, or a merge, still to go out. */
  const next = (runId: string, sync: RunSync) => {
    if (stopped || sync.stopped || sync.busy || sync.ahead || sync.timer !== undefined || !pending(sync)) return
    schedule(runId, sync, sync.revision === null ? 0 : NOTES_SAVE_DELAY)
  }

  const kick = (runId: string, keepalive = false) => {
    const sync = runs.get(runId)
    if (!sync || stopped || sync.stopped || sync.busy || sync.ahead) return
    let task: Promise<void>
    if (sync.revision === null) task = pull(runId, sync, false)
    else if (sync.playing && dirty(sync)) task = push(runId, sync, keepalive)
    else return
    sync.busy = true
    task
      .then(() => {
        sync.failures = 0
      })
      .catch((error: unknown) => {
        const unreachable = !(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500
        if (!unreachable) {
          // Over, not this player's, or signed out: the marks stay on this page only.
          sync.stopped = true
          return
        }
        sync.failures++
        if (!stopped) schedule(runId, sync, RETRY_DELAYS[Math.min(sync.failures, RETRY_DELAYS.length) - 1])
      })
      .finally(() => {
        sync.busy = false
        next(runId, sync)
      })
  }

  return {
    connect(given) {
      callbacks = given
    },
    track(runId, notes, sync, playing) {
      if (!sync) return
      const known = runs.get(runId)
      if (!known) {
        runs.set(runId, { notes, revision: null, base: null, busy: false, sending: null, ahead: null, timer: undefined, failures: 0, stopped: false, playing })
        kick(runId)
        return
      }
      known.playing = playing
      if (sameNotes(notes, known.notes)) return
      known.notes = notes
      if (known.revision !== null && !known.stopped && !stopped && playing && dirty(known)) schedule(runId, known, NOTES_SAVE_DELAY)
    },
    flush(keepalive) {
      for (const [runId, sync] of runs) {
        // The marks stay in this browser whatever becomes of the requests below.
        if (keepalive && (sync.sending || dirty(sync))) saveNotes(runId, sync.notes)
        if (sync.timer !== undefined) {
          window.clearTimeout(sync.timer)
          sync.timer = undefined
          kick(runId, keepalive)
        }
        if (keepalive && sync.busy) sendAhead(runId, sync)
      }
    },
    refresh() {
      for (const [runId, sync] of runs) {
        if (stopped || sync.stopped || sync.busy || sync.ahead || sync.revision === null || dirty(sync)) continue
        sync.busy = true
        pull(runId, sync, true)
          .catch(() => undefined)
          .finally(() => {
            sync.busy = false
          })
      }
    },
    reconnect() {
      for (const [runId, sync] of runs) {
        if (stopped || sync.stopped || sync.busy || sync.ahead || sync.failures === 0) continue
        window.clearTimeout(sync.timer)
        sync.timer = undefined
        kick(runId)
      }
    },
    start() {
      stopped = false
      for (const runId of runs.keys()) kick(runId)
    },
    stop() {
      this.flush(true)
      stopped = true
      for (const sync of runs.values()) {
        window.clearTimeout(sync.timer)
        sync.timer = undefined
      }
    },
  }
}

interface NotesOwner {
  runId: string
  board: { notes: readonly number[] }
}

/**
 * Keeps the marks of the page's runs (one a mode) on the server, for a signed-in player's runs
 * (`notesSync`); a guest's stay in the browser. `replace` puts marks read from the server on the board
 * of that run, if it is still on the page.
 */
export function useNotesSync(
  runs: Readonly<Record<string, RunView | null>>,
  locals: Readonly<Record<string, NotesOwner | null>>,
  replace: (runId: string, notes: number[]) => void,
  say: (text: string) => void,
) {
  const [syncer] = useState(createNotesSyncer)
  useEffect(() => {
    syncer.connect({ replace, say })
  }, [syncer, replace, say])

  useEffect(() => {
    syncer.start()
    return () => syncer.stop()
  }, [syncer])

  useEffect(() => {
    for (const key of Object.keys(runs)) {
      const run = runs[key]
      const local = locals[key]
      if (run && local && local.runId === run.id) syncer.track(run.id, local.board.notes, run.notesSync, run.status === 'PLAYING')
    }
  }, [runs, locals, syncer])

  // Leaving the page saves what is waiting; coming back reads what another device may have saved.
  // Back online, failed saves go out at once. None of it is certain to arrive as a page closes: what
  // does not is still in this browser, and goes out on the next visit.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') syncer.flush(true)
      else syncer.refresh()
    }
    const onLeave = () => syncer.flush(true)
    const onOnline = () => syncer.reconnect()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('online', onOnline)
    }
  }, [syncer])
}
