-- Word Guess joins the catalog. Its rules live in the application (wordle.WordleRunRules); here is
-- what the hub shows, and the highest score a run can reach: 600 for one guess plus 100 for a streak.
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
VALUES ('wordle', 'Word Guess',
        'Find the hidden five-letter word in six guesses. One new puzzle for everyone every day, and practice words in between.',
        'PUZZLE', '/thumbnails/wordle.svg', '#ec4899', 70, 700);

-- Unlike the other games, Word Guess is played on the server: the hidden word, every guess and every
-- hint are kept here, and the word reaches the browser only when a run is over. A daily run is tied to
-- the platform game session its score is submitted with (moved to a new session if the player comes
-- back to it before submitting); practice runs have none.
CREATE TABLE wordle_runs (
    id             UUID        PRIMARY KEY,
    mode           VARCHAR(10) NOT NULL CHECK (mode IN ('DAILY', 'PRACTICE')),
    session_id     UUID        UNIQUE REFERENCES game_sessions (id) ON DELETE SET NULL,
    user_id        BIGINT      REFERENCES users (id) ON DELETE CASCADE,
    player_id      UUID,
    puzzle_date    DATE,
    puzzle_number  INTEGER,
    target         CHAR(5)     NOT NULL,
    -- Comma-separated, in the order they were played: "CRANE,SLOTH" and "REVEAL_LETTER:2,CHECK_LETTER:E".
    guesses        TEXT        NOT NULL DEFAULT '',
    hints          TEXT        NOT NULL DEFAULT '',
    status         VARCHAR(10) NOT NULL CHECK (status IN ('PLAYING', 'SOLVED', 'FAILED')),
    -- For a solved daily run, the streak it made, worked out by the server when it was solved.
    streak         INTEGER     NOT NULL DEFAULT 0,
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ,
    CONSTRAINT wordle_runs_one_owner CHECK ((user_id IS NULL) <> (player_id IS NULL)),
    CONSTRAINT wordle_runs_daily_has_a_day CHECK ((mode = 'DAILY') = (puzzle_date IS NOT NULL AND puzzle_number IS NOT NULL))
);

-- One daily run per player and UTC day: the database has the last word on replays.
CREATE UNIQUE INDEX ux_wordle_daily_account ON wordle_runs (user_id, puzzle_date) WHERE mode = 'DAILY' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX ux_wordle_daily_guest ON wordle_runs (player_id, puzzle_date) WHERE mode = 'DAILY' AND player_id IS NOT NULL;
CREATE INDEX ix_wordle_practice_started ON wordle_runs (started_at) WHERE mode = 'PRACTICE';

-- A few looks for the board and the keyboard, sold as game skins like Flappy Bird's and Brick
-- Breaker's. Only colours: no pictures. The Cyan tiles and keys are the game's own and free.
INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order,
                        game_slug, slot)
VALUES
    ('WORDLE_TILES_CANDY', 'Candy Tiles', 'Glossy sweets in mint, lemon and lilac.',
        'GAME_SKIN', 250, 1, 1, 1, 'candy', 400, 'wordle', 'tiles'),
    ('WORDLE_TILES_MOCHI', 'Mochi Tiles', 'Soft pastel squares with a gentle bounce.',
        'GAME_SKIN', 400, 1, 1, 2, 'mochi', 401, 'wordle', 'tiles'),
    ('WORDLE_TILES_NEON', 'Neon Tiles', 'Glowing letters on a midnight board.',
        'GAME_SKIN', 700, 1, 1, 3, 'neon', 402, 'wordle', 'tiles'),
    ('WORDLE_KEYS_SAKURA', 'Sakura Keys', 'A keyboard in cherry-blossom pink.',
        'GAME_SKIN', 300, 1, 1, 1, 'sakura', 420, 'wordle', 'keyboard'),
    ('WORDLE_KEYS_MIDNIGHT', 'Midnight Keys', 'Dark keys with a soft cyan glow.',
        'GAME_SKIN', 600, 1, 1, 3, 'midnight', 421, 'wordle', 'keyboard');
