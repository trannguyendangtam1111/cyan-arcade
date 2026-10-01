-- Upper bound for a plausible score, used to reject obviously invalid submissions.
-- NULL means the game has no practical maximum.
ALTER TABLE games
    ADD COLUMN max_score INTEGER,
    ADD CONSTRAINT ck_games_max_score CHECK (max_score IS NULL OR max_score > 0);

-- Snake: one point per apple on a 16x16 board that starts with a three-cell snake (256 - 3).
UPDATE games SET max_score = 253 WHERE slug = 'snake';
-- 2048: just above the theoretical maximum (a full board topped by a 131072 tile).
UPDATE games SET max_score = 4000000 WHERE slug = '2048';
-- Tetris has no upper bound: a game can go on indefinitely.
