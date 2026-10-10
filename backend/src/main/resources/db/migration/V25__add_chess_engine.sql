-- Stockfish comes to Chess: games against the engine (admins only) and move hints.

-- A match is LOCAL (two players on one device) or AI (one player against Stockfish). An AI match
-- records the engine's side and the difficulty it plays at.
ALTER TABLE chess_matches DROP CONSTRAINT chess_matches_mode_check;
ALTER TABLE chess_matches
    ADD CONSTRAINT chess_matches_mode_check CHECK (mode IN ('LOCAL', 'AI')),
    ADD COLUMN engine_side VARCHAR(5) CHECK (engine_side IN ('WHITE', 'BLACK')),
    ADD COLUMN engine_difficulty VARCHAR(20)
        CHECK (engine_difficulty IN ('BEGINNER', 'CASUAL', 'CLUB', 'ADVANCED', 'MAXIMUM')),
    -- Move hints given for this match. A player's allowance is per match: kept here, on the server,
    -- so neither a reload nor anything a browser sends can give it back. Counted only for a hint
    -- that was actually given.
    ADD COLUMN hints_used INTEGER NOT NULL DEFAULT 0 CHECK (hints_used >= 0),
    ADD CONSTRAINT chess_matches_engine CHECK ((mode = 'AI') = (engine_side IS NOT NULL AND engine_difficulty IS NOT NULL));
