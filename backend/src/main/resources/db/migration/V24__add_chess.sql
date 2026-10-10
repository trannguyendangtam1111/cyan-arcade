-- Not every game produces a score the platform can trust. A game with scored = FALSE is played
-- and listed like any other, but opens no score sessions, so it has no leaderboard, earns no XP or
-- coins and gets no daily challenge. Every game so far is scored.
ALTER TABLE games ADD COLUMN scored BOOLEAN NOT NULL DEFAULT TRUE;

-- Chess joins the catalog unscored: its only mode is two players on one device, and a game in
-- which one person can play both sides has no result worth ranking or rewarding.
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score, scored)
VALUES ('chess', 'Chess',
        'The classic game of kings and queens for two players on one device. Every move is checked by the full rules: castling, en passant, promotion, checkmate and every draw.',
        'STRATEGY', '/thumbnails/chess.svg', '#4f46e5', 100, NULL, FALSE);

-- Chess is played on the server: a match keeps its moves, and every request rebuilds the position
-- from them and judges the next action by the rules (chess.engine), so the browser never decides
-- what is legal or how a game ended.
CREATE TABLE chess_matches (
    id          UUID        PRIMARY KEY,
    -- Two players on one device. Online play between accounts would add a mode and the two seats.
    mode        VARCHAR(10) NOT NULL CHECK (mode IN ('LOCAL')),
    status      VARCHAR(10) NOT NULL CHECK (status IN ('ACTIVE', 'FINISHED', 'ABANDONED')),
    -- Space-separated UCI moves from the starting position, in the order played ("e2e4 e7e5 e7e8q").
    moves       TEXT        NOT NULL DEFAULT '',
    -- Moves taken back and not played again, the latest last: what "redo" replays.
    undone      TEXT        NOT NULL DEFAULT '',
    draw_offer  VARCHAR(5)  CHECK (draw_offer IN ('WHITE', 'BLACK')),
    winner      VARCHAR(5)  CHECK (winner IN ('WHITE', 'BLACK')),
    termination VARCHAR(30) CHECK (termination IN ('CHECKMATE', 'STALEMATE', 'INSUFFICIENT_MATERIAL',
                                                   'FIVEFOLD_REPETITION', 'SEVENTY_FIVE_MOVE_RULE', 'RESIGNATION',
                                                   'AGREEMENT', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE')),
    -- Goes up with every change, so a request made against an older state of the match is refused.
    revision    INTEGER     NOT NULL DEFAULT 0 CHECK (revision >= 0),
    user_id     BIGINT      REFERENCES users (id) ON DELETE CASCADE,
    player_id   UUID,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    CONSTRAINT chess_matches_one_owner CHECK ((user_id IS NULL) <> (player_id IS NULL)),
    CONSTRAINT chess_matches_result CHECK ((status = 'FINISHED') = (termination IS NOT NULL)),
    CONSTRAINT chess_matches_winner CHECK (winner IS NULL OR termination IN ('CHECKMATE', 'RESIGNATION')),
    CONSTRAINT chess_matches_finished_at CHECK ((status = 'ACTIVE') = (finished_at IS NULL))
);

-- One match in progress per player: starting another leaves the old one (ABANDONED).
CREATE UNIQUE INDEX ux_chess_active_account ON chess_matches (user_id) WHERE status = 'ACTIVE' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX ux_chess_active_guest ON chess_matches (player_id) WHERE status = 'ACTIVE' AND player_id IS NOT NULL;
CREATE INDEX ix_chess_matches_account ON chess_matches (user_id, updated_at) WHERE user_id IS NOT NULL;
CREATE INDEX ix_chess_matches_guest ON chess_matches (player_id, updated_at) WHERE player_id IS NOT NULL;
CREATE INDEX ix_chess_matches_updated ON chess_matches (updated_at);

-- A few looks, sold as game skins like the other games'. Colours only: every piece keeps its shape,
-- so a skin never makes the position harder to read. The Arcade board and pieces are the game's own.
INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order,
                        game_slug, slot)
VALUES
    ('CHESS_BOARD_MINT', 'Mint Garden', 'Cream and leafy green squares.',
        'GAME_SKIN', 250, 1, 1, 1, 'mint', 600, 'chess', 'board'),
    ('CHESS_BOARD_SAKURA', 'Sakura Court', 'Blossom pink and plum squares.',
        'GAME_SKIN', 400, 1, 1, 2, 'sakura', 601, 'chess', 'board'),
    ('CHESS_BOARD_MIDNIGHT', 'Midnight Hall', 'Deep navy squares with glowing highlights.',
        'GAME_SKIN', 700, 1, 1, 3, 'midnight', 602, 'chess', 'board'),
    ('CHESS_PIECES_CANDY', 'Candy Set', 'Vanilla and blueberry pieces with sweet outlines.',
        'GAME_SKIN', 350, 1, 1, 1, 'candy', 620, 'chess', 'pieces'),
    ('CHESS_PIECES_COPPER', 'Copper & Ivory', 'Warm ivory against polished copper.',
        'GAME_SKIN', 600, 1, 1, 3, 'copper', 621, 'chess', 'pieces');
