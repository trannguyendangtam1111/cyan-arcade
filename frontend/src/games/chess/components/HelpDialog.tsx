import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Key } from '@/games/shared/components/GameShell'

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <tr className="align-top">
      <th scope="row" className="py-1 pr-3 text-left font-normal whitespace-nowrap">
        {keys}
      </th>
      <td className="py-1">{children}</td>
    </tr>
  )
}

/** How to play and every control, on request instead of in the page. */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1 text-sm text-ink">
        <section aria-label="Playing" className="flex flex-col gap-1.5">
          <h3 className="font-display font-semibold">Playing</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-soft">
            <li>Two players share this device and take turns, White first; or, for admins, play Stockfish.</li>
            <li>Drag a piece to a marked square, or tap it and then the square: dots are moves, rings are captures.</li>
            <li>Only the side to move can move. Against Stockfish you can plan your next move while it thinks (a premove, violet and dashed): it is played when your turn comes if it is still legal, and dropped if not.</li>
            <li>Every move is checked on the server by the full rules of chess. These games are for fun: they are not scored.</li>
          </ul>
        </section>
        <section aria-label="Looking back and takebacks" className="flex flex-col gap-1.5">
          <h3 className="font-display font-semibold">Looking back is not taking back</h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-soft">
            <li>The arrows under the board and the move list only show earlier positions. The game goes on as it is; return to the live game to move.</li>
            <li>Undo and Redo really take a move back or replay it, in two-player games only. Against Stockfish there are no takebacks.</li>
          </ul>
        </section>
        <section aria-label="Keys" className="flex flex-col gap-1.5">
          <h3 className="font-display font-semibold">Keys (with the board or the move list focused)</h3>
          <table className="text-ink-soft">
            <tbody>
              <Row keys={<Key>←</Key>}>Previous position</Row>
              <Row keys={<Key>→</Key>}>Next position</Row>
              <Row
                keys={
                  <>
                    <Key>↑</Key> <Key>Home</Key>
                  </>
                }
              >
                The start
              </Row>
              <Row
                keys={
                  <>
                    <Key>↓</Key> <Key>End</Key>
                  </>
                }
              >
                The live game
              </Row>
              <Row keys={<Key>Esc</Key>}>Let go of a piece; clear a premove and drawings</Row>
              <Row
                keys={
                  <>
                    <Key>Enter</Key> <Key>Space</Key>
                  </>
                }
              >
                On a square: pick a piece up or put it down (the arrow keys move between squares)
              </Row>
            </tbody>
          </table>
        </section>
        <section aria-label="Drawing" className="flex flex-col gap-1.5">
          <h3 className="font-display font-semibold">Drawing on the board</h3>
          <p className="text-ink-soft">
            Right-click and drag for an arrow, right-click a square to highlight it (<Key>Shift</Key> green, <Key>Alt</Key> blue). On a touch screen, use Draw. Drawings never move a piece.
          </p>
        </section>
        <section aria-label="Move labels" className="flex flex-col gap-1.5">
          <h3 className="font-display font-semibold">Move labels</h3>
          <p className="text-ink-soft">
            With Coach on (signed-in players), Stockfish rates each of your moves: ★ Best, ! Excellent, ✓ Good, ?! Inaccuracy, ? Mistake, ?? Blunder, □ Forced, or Not rated when the analysis was too shallow. A dashed label is from a quick analysis; the game review looks deeper. These are the arcade&apos;s own limits on winning chances lost, not another site&apos;s.
          </p>
        </section>
      </div>
    </Modal>
  )
}
