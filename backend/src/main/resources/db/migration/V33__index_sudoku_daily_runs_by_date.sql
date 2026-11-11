-- The Daily Sudoku leaderboard of one puzzle date: its ranked daily runs, found by date.
CREATE INDEX ix_sudoku_runs_daily_date ON sudoku_runs (puzzle_date) WHERE mode = 'DAILY' AND ranked;
