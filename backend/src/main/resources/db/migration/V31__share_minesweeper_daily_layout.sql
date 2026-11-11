-- Minesweeper Daily Board, one layout per date: the server picks the day's opening cell and lays the
-- mines around it once, so every player gets the same mines. V30 laid them from each attempt's first
-- click instead, which gave different players different boards on the same date.

-- Boards and attempts stored under V30 were laid per attempt and cannot be turned into a shared
-- layout, so they leave the active tables. They are not thrown away: each row is first copied, as it
-- was, into an archive table of its own (same id, account, date, state, board, counters and times),
-- the copies are checked against the originals, and only the rows that were copied are removed. The
-- whole migration is one transaction: should any step fail, nothing of it remains and the V30 rows
-- stay where they were.
--
-- Nothing in the application reads the archive. Archived attempts do not show in the Daily Board, its
-- leaderboard or a player's history, and their dates can be played again on the new layout. V30 paid
-- no rewards, so no coins or XP refer to an archived attempt, and none are added or removed here.

-- Nobody reads or writes the daily tables while they are archived and changed.
LOCK TABLE minesweeper_daily_boards, minesweeper_daily_attempts IN ACCESS EXCLUSIVE MODE;

-- V30's boards: the same columns, types and checks as minesweeper_daily_boards had under V30.
CREATE TABLE minesweeper_daily_legacy_boards (
    board_date     DATE        NOT NULL,
    board_number   INTEGER     NOT NULL,
    board_rows     SMALLINT    NOT NULL,
    board_columns  SMALLINT    NOT NULL,
    mines          SMALLINT    NOT NULL,
    seed           BIGINT      NOT NULL,
    layout_version INTEGER     NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_minesweeper_daily_legacy_boards PRIMARY KEY (board_date),
    CONSTRAINT uq_minesweeper_daily_legacy_boards_number UNIQUE (board_number),
    CONSTRAINT ck_minesweeper_daily_legacy_boards_seed CHECK (seed BETWEEN 0 AND 4294967295),
    CONSTRAINT ck_minesweeper_daily_legacy_boards_size CHECK (board_rows > 0 AND board_columns > 0 AND mines > 0
        AND mines < board_rows * board_columns)
);

-- V30's attempts, first_cell included under its V30 name. An archived attempt belongs to its archived
-- board, which cannot be removed while the attempt exists, and to its account: deleting the account
-- deletes its archived attempts too, just as it does its current ones. One attempt per account and
-- date, as under V30.
CREATE TABLE minesweeper_daily_legacy_attempts (
    id             UUID        NOT NULL,
    board_date     DATE        NOT NULL,
    user_id        BIGINT      NOT NULL,
    status         VARCHAR(10) NOT NULL,
    first_cell     SMALLINT,
    cells          TEXT        NOT NULL,
    moves          INTEGER     NOT NULL,
    revealed_cells INTEGER     NOT NULL,
    flags          INTEGER     NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL,
    finished_at    TIMESTAMPTZ,
    elapsed_ms     INTEGER,
    CONSTRAINT pk_minesweeper_daily_legacy_attempts PRIMARY KEY (id),
    CONSTRAINT fk_minesweeper_daily_legacy_attempts_board FOREIGN KEY (board_date)
        REFERENCES minesweeper_daily_legacy_boards (board_date) ON DELETE RESTRICT,
    CONSTRAINT fk_minesweeper_daily_legacy_attempts_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_minesweeper_daily_legacy_attempts_account_day UNIQUE (user_id, board_date),
    CONSTRAINT ck_minesweeper_daily_legacy_attempts_status CHECK (status IN ('PLAYING', 'WON', 'LOST', 'EXPIRED')),
    CONSTRAINT ck_minesweeper_daily_legacy_attempts_cells CHECK (cells ~ '^[HF0-8X]+$'),
    CONSTRAINT ck_minesweeper_daily_legacy_attempts_counts CHECK (moves >= 0 AND revealed_cells >= 0 AND flags >= 0),
    CONSTRAINT ck_minesweeper_daily_legacy_attempts_elapsed CHECK (elapsed_ms >= 0),
    CONSTRAINT ck_minesweeper_daily_legacy_attempts_finished CHECK ((status = 'PLAYING') = (finished_at IS NULL)),
    CONSTRAINT ck_minesweeper_daily_legacy_attempts_won_time CHECK (status <> 'WON'
        OR (elapsed_ms IS NOT NULL AND first_cell IS NOT NULL))
);

INSERT INTO minesweeper_daily_legacy_boards (board_date, board_number, board_rows, board_columns, mines, seed,
        layout_version, created_at)
SELECT board_date, board_number, board_rows, board_columns, mines, seed, layout_version, created_at
FROM minesweeper_daily_boards;

INSERT INTO minesweeper_daily_legacy_attempts (id, board_date, user_id, status, first_cell, cells, moves,
        revealed_cells, flags, started_at, finished_at, elapsed_ms)
SELECT id, board_date, user_id, status, first_cell, cells, moves, revealed_cells, flags, started_at, finished_at,
       elapsed_ms
FROM minesweeper_daily_attempts;

-- The archive must hold exactly the V30 rows, value for value, before any of them is removed.
DO $$
DECLARE
    board_differences   BIGINT;
    attempt_differences BIGINT;
BEGIN
    SELECT count(*) INTO board_differences FROM (
        (SELECT board_date, board_number, board_rows, board_columns, mines, seed, layout_version, created_at
         FROM minesweeper_daily_boards
         EXCEPT ALL
         SELECT board_date, board_number, board_rows, board_columns, mines, seed, layout_version, created_at
         FROM minesweeper_daily_legacy_boards)
        UNION ALL
        (SELECT board_date, board_number, board_rows, board_columns, mines, seed, layout_version, created_at
         FROM minesweeper_daily_legacy_boards
         EXCEPT ALL
         SELECT board_date, board_number, board_rows, board_columns, mines, seed, layout_version, created_at
         FROM minesweeper_daily_boards)
    ) AS difference;

    SELECT count(*) INTO attempt_differences FROM (
        (SELECT id, board_date, user_id, status, first_cell, cells, moves, revealed_cells, flags, started_at,
                finished_at, elapsed_ms
         FROM minesweeper_daily_attempts
         EXCEPT ALL
         SELECT id, board_date, user_id, status, first_cell, cells, moves, revealed_cells, flags, started_at,
                finished_at, elapsed_ms
         FROM minesweeper_daily_legacy_attempts)
        UNION ALL
        (SELECT id, board_date, user_id, status, first_cell, cells, moves, revealed_cells, flags, started_at,
                finished_at, elapsed_ms
         FROM minesweeper_daily_legacy_attempts
         EXCEPT ALL
         SELECT id, board_date, user_id, status, first_cell, cells, moves, revealed_cells, flags, started_at,
                finished_at, elapsed_ms
         FROM minesweeper_daily_attempts)
    ) AS difference;

    IF board_differences <> 0 OR attempt_differences <> 0 THEN
        RAISE EXCEPTION 'Minesweeper Daily archive differs from the V30 rows: % board rows, % attempt rows',
            board_differences, attempt_differences;
    END IF;
END $$;

-- Only rows that are in the archive leave the active tables.
DELETE FROM minesweeper_daily_attempts AS attempt
USING minesweeper_daily_legacy_attempts AS archived
WHERE archived.id = attempt.id;

DELETE FROM minesweeper_daily_boards AS board
USING minesweeper_daily_legacy_boards AS archived
WHERE archived.board_date = board.board_date;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM minesweeper_daily_attempts) OR EXISTS (SELECT 1 FROM minesweeper_daily_boards) THEN
        RAISE EXCEPTION 'Minesweeper Daily rows remain after archiving them';
    END IF;
END $$;

-- The day's opening cell (it and its neighbours hold no mine) and its mines, row-major cell indexes.
-- Both stay on the server: an attempt shows the opening already uncovered, and the mines never.
ALTER TABLE minesweeper_daily_boards
    ADD COLUMN start_cell SMALLINT NOT NULL,
    ADD COLUMN mine_cells SMALLINT[] NOT NULL,
    ADD CONSTRAINT ck_minesweeper_daily_boards_start_cell CHECK (start_cell >= 0 AND start_cell < board_rows * board_columns),
    ADD CONSTRAINT ck_minesweeper_daily_boards_mine_cells CHECK (cardinality(mine_cells) = mines
        AND array_position(mine_cells, start_cell) IS NULL);

-- Every attempt starts at its board's opening cell, uncovered when the attempt is created.
ALTER TABLE minesweeper_daily_attempts RENAME COLUMN first_cell TO start_cell;
ALTER TABLE minesweeper_daily_attempts ALTER COLUMN start_cell SET NOT NULL;
