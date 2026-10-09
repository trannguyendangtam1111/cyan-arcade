-- Sudoku joins the catalog. Its rules live in the application (sudoku.SudokuRunRules); here is what
-- the hub shows, and the highest score a run can reach: an Expert solve with no mistake and no hint,
-- at the full 150% time bonus (5,000 × 1.5).
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
VALUES ('sudoku', 'Sudoku',
        'Fill the grid so every row, column and box holds 1 to 9. A new Daily Sudoku for everyone each day, and practice puzzles from Easy to Expert.',
        'PUZZLE', '/thumbnails/sudoku.svg', '#06b6d4', 80, 7500);

-- Each day's puzzle, stored the first time it is asked for. From then on the stored puzzle is that
-- day's, whatever later versions of the generator would make of its seed.
CREATE TABLE sudoku_daily_puzzles (
    puzzle_date       DATE        PRIMARY KEY,
    puzzle_number     INTEGER     NOT NULL UNIQUE,
    difficulty        VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD', 'EXPERT')),
    seed              BIGINT      NOT NULL,
    -- 81 digits in reading order, 0 for an empty cell.
    givens            CHAR(81)    NOT NULL,
    solution          CHAR(81)    NOT NULL,
    generator_version INTEGER     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL
);

-- Sudoku is played on the server, like Word Guess: the puzzle, its solution, every action and the
-- clock are kept here, and the solution reaches the browser only when a run is over. A ranked run
-- (daily, or practice with a session) is tied to the platform game session its score is submitted
-- with; relaxed practice runs have none and are never scored.
CREATE TABLE sudoku_runs (
    id            UUID        PRIMARY KEY,
    mode          VARCHAR(10) NOT NULL CHECK (mode IN ('DAILY', 'PRACTICE')),
    ranked        BOOLEAN     NOT NULL,
    difficulty    VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD', 'EXPERT')),
    puzzle_date   DATE,
    puzzle_number INTEGER,
    seed          BIGINT      NOT NULL,
    givens        CHAR(81)    NOT NULL,
    solution      CHAR(81)    NOT NULL,
    -- Comma-separated, in the order they were played: "M12=5" enters 5 in cell 12, "M12=0" clears it,
    -- "R40", "F7" and "E7" are hints (reveal, find, explain) about a cell.
    actions       TEXT        NOT NULL DEFAULT '',
    status        VARCHAR(10) NOT NULL CHECK (status IN ('PLAYING', 'SOLVED', 'FAILED', 'ABANDONED')),
    -- Counted from the actions, kept here for statistics.
    mistakes      INTEGER     NOT NULL DEFAULT 0,
    hints         INTEGER     NOT NULL DEFAULT 0,
    -- For a solved daily run, the streak it made, worked out by the server when it was solved.
    streak        INTEGER     NOT NULL DEFAULT 0,
    session_id    UUID        UNIQUE REFERENCES game_sessions (id) ON DELETE SET NULL,
    user_id       BIGINT      REFERENCES users (id) ON DELETE CASCADE,
    player_id     UUID,
    started_at    TIMESTAMPTZ NOT NULL,
    finished_at   TIMESTAMPTZ,
    -- The server's clock: playing time is finished_at (or now) - started_at - paused_ms - the current pause.
    paused_at     TIMESTAMPTZ,
    paused_ms     BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT sudoku_runs_one_owner CHECK ((user_id IS NULL) <> (player_id IS NULL)),
    CONSTRAINT sudoku_runs_daily_has_a_day CHECK ((mode = 'DAILY') = (puzzle_date IS NOT NULL AND puzzle_number IS NOT NULL)),
    CONSTRAINT sudoku_runs_daily_is_ranked CHECK (mode <> 'DAILY' OR ranked)
);

-- One daily run per player and UTC day: the database has the last word on replays.
CREATE UNIQUE INDEX ux_sudoku_daily_account ON sudoku_runs (user_id, puzzle_date) WHERE mode = 'DAILY' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX ux_sudoku_daily_guest ON sudoku_runs (player_id, puzzle_date) WHERE mode = 'DAILY' AND player_id IS NOT NULL;
CREATE INDEX ix_sudoku_runs_account ON sudoku_runs (user_id, started_at) WHERE user_id IS NOT NULL;
CREATE INDEX ix_sudoku_runs_guest ON sudoku_runs (player_id, started_at) WHERE player_id IS NOT NULL;

-- A few looks for the board and the number pad, sold as game skins like the other games'. Only
-- colours: no pictures. The Cyan board and pad are the game's own and free.
INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order,
                        game_slug, slot)
VALUES
    ('SUDOKU_BOARD_MINT', 'Mint Paper', 'A soft mint grid on warm paper.',
        'GAME_SKIN', 250, 1, 1, 1, 'mint', 500, 'sudoku', 'board'),
    ('SUDOKU_BOARD_SAKURA', 'Sakura Grid', 'Cherry-blossom pink lines and rosy highlights.',
        'GAME_SKIN', 400, 1, 1, 2, 'sakura', 501, 'sudoku', 'board'),
    ('SUDOKU_BOARD_MIDNIGHT', 'Midnight Grid', 'Glowing cyan digits on a deep night board.',
        'GAME_SKIN', 700, 1, 1, 3, 'midnight', 502, 'sudoku', 'board'),
    ('SUDOKU_PAD_CANDY', 'Candy Pad', 'Round, sweet number keys in lemon and lilac.',
        'GAME_SKIN', 300, 1, 1, 1, 'candy', 520, 'sudoku', 'pad');
