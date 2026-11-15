-- Minesweeper Daily Board: one 16 × 16 board with 40 mines per UTC date, the same for every signed-in
-- player, played on the server. The mines never leave the server: they are laid again from the day's
-- seed and the attempt's first cell whenever an attempt is played, and never stored or sent.

-- Each day's board, stored the first time the day is asked for. From then on the stored seed is that
-- day's, whatever later secrets or versions would make. The seed comes from a server-side secret and
-- the date, and is never sent to a browser.
CREATE TABLE minesweeper_daily_boards (
    board_date     DATE        PRIMARY KEY,
    board_number   INTEGER     NOT NULL UNIQUE,
    board_rows     SMALLINT    NOT NULL,
    board_columns  SMALLINT    NOT NULL,
    mines          SMALLINT    NOT NULL,
    -- The low 32 bits the layout reads, as an unsigned number.
    seed           BIGINT      NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
    layout_version INTEGER     NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_minesweeper_daily_boards_size CHECK (board_rows > 0 AND board_columns > 0 AND mines > 0
        AND mines < board_rows * board_columns)
);

-- One attempt per account and board, the clock kept by the server: from started_at (the start
-- request) to finished_at (the reveal that ended it). The board as the player sees it is kept as one
-- character per cell: H covered, F flagged, 0-8 uncovered with that many mines around, X the mine
-- that went off. A row is finished exactly once; a won attempt keeps its server-measured time.
CREATE TABLE minesweeper_daily_attempts (
    id             UUID        PRIMARY KEY,
    board_date     DATE        NOT NULL REFERENCES minesweeper_daily_boards (board_date),
    user_id        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status         VARCHAR(10) NOT NULL CHECK (status IN ('PLAYING', 'WON', 'LOST', 'EXPIRED')),
    first_cell     SMALLINT,
    cells          TEXT        NOT NULL CHECK (cells ~ '^[HF0-8X]+$'),
    moves          INTEGER     NOT NULL DEFAULT 0 CHECK (moves >= 0),
    revealed_cells INTEGER     NOT NULL DEFAULT 0 CHECK (revealed_cells >= 0),
    flags          INTEGER     NOT NULL DEFAULT 0 CHECK (flags >= 0),
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ,
    elapsed_ms     INTEGER     CHECK (elapsed_ms >= 0),
    CONSTRAINT uq_minesweeper_daily_attempts_account_day UNIQUE (user_id, board_date),
    CONSTRAINT ck_minesweeper_daily_attempts_finished CHECK ((status = 'PLAYING') = (finished_at IS NULL)),
    CONSTRAINT ck_minesweeper_daily_attempts_won_time CHECK (status <> 'WON' OR (elapsed_ms IS NOT NULL AND first_cell IS NOT NULL))
);

-- The day's leaderboard: its wins, fastest first, then whoever finished first.
CREATE INDEX ix_minesweeper_daily_attempts_ranking ON minesweeper_daily_attempts (board_date, elapsed_ms, finished_at, id)
    WHERE status = 'WON';
