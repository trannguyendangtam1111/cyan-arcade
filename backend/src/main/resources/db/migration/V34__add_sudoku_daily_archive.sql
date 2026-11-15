-- The Daily Sudoku archive: past daily puzzles replayed for practice. Each replay is a run of its own
-- mode, ARCHIVE, kept apart from the official daily runs: it has the puzzle's date and number, but it
-- is never ranked and never tied to a game session, so it has no score, no leaderboard place, no
-- rewards and no streak. The one-daily-run-per-day indexes are for mode 'DAILY' only, so replays
-- are unlimited and never use up a day's official attempt.
ALTER TABLE sudoku_runs DROP CONSTRAINT sudoku_runs_mode_check;
ALTER TABLE sudoku_runs ADD CONSTRAINT sudoku_runs_mode_check CHECK (mode IN ('DAILY', 'PRACTICE', 'ARCHIVE'));

ALTER TABLE sudoku_runs DROP CONSTRAINT sudoku_runs_daily_has_a_day;
ALTER TABLE sudoku_runs ADD CONSTRAINT sudoku_runs_daily_has_a_day
    CHECK ((mode IN ('DAILY', 'ARCHIVE')) = (puzzle_date IS NOT NULL AND puzzle_number IS NOT NULL));

ALTER TABLE sudoku_runs ADD CONSTRAINT sudoku_runs_archive_is_unranked
    CHECK (mode <> 'ARCHIVE' OR (NOT ranked AND session_id IS NULL));
