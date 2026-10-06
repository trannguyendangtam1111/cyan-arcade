-- Minesweeper joins the catalog. Its rules live in the application (gamerules.MinesweeperRunRules);
-- here is only what the hub shows, and the highest score its one board allows:
-- 71 safe cells × 10, plus 500 for clearing the board and up to 600 for time.
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
VALUES ('minesweeper', 'Minesweeper',
        'Uncover every safe square without setting off a mine. The numbers tell you how many are hiding nearby.',
        'PUZZLE', '/thumbnails/minesweeper.svg', '#e11d48', 40, 1810);
