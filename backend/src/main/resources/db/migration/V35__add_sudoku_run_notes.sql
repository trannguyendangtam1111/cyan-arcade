-- A signed-in player's pencil marks for one Sudoku run, so they follow the player to another device.
-- Kept apart from the run: the run's action log, digits, mistakes, hints and clock are the game; notes
-- are the player's own jottings and never count for anything.
--
-- notes: 81 cells in order, separated by commas, each its candidate digits in ascending order (an
-- empty cell has none), e.g. "149,,23,...". revision goes up by one with every save; a save names the
-- revision it was based on, so a device cannot overwrite notes it has not seen.
CREATE TABLE sudoku_run_notes (
    run_id     UUID PRIMARY KEY REFERENCES sudoku_runs (id) ON DELETE CASCADE,
    notes      VARCHAR(809) NOT NULL,
    revision   INTEGER      NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    CONSTRAINT sudoku_run_notes_format CHECK (notes ~ '^[1-9]{0,9}(,[1-9]{0,9}){80}$'),
    CONSTRAINT sudoku_run_notes_revision CHECK (revision > 0)
);
