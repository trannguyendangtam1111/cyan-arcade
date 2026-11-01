-- Variations: "continue from here" on an earlier position of a game starts an ANALYSIS match, a
-- separate match that begins with the game's moves up to that position. The game it came from is
-- never changed by it (its moves, result and revision stay as they are), and an analysis is never
-- the player's current game. Chess is unscored, so neither earns anything.
ALTER TABLE chess_matches DROP CONSTRAINT chess_matches_mode_check;
ALTER TABLE chess_matches
    ADD CONSTRAINT chess_matches_mode_check CHECK (mode IN ('LOCAL', 'AI', 'ANALYSIS')),
    -- The game the variation was started from, and the ply of it the variation starts at. The game
    -- may be forgotten before its variation (old matches are deleted); the ply stays.
    ADD COLUMN source_match_id UUID REFERENCES chess_matches (id) ON DELETE SET NULL,
    ADD COLUMN source_ply INTEGER CHECK (source_ply >= 0),
    ADD CONSTRAINT chess_matches_variation CHECK ((mode = 'ANALYSIS') = (source_ply IS NOT NULL));

-- One game in progress per player, as before, and separately one analysis: exploring a variation
-- does not leave the game it came from.
DROP INDEX ux_chess_active_account;
DROP INDEX ux_chess_active_guest;
CREATE UNIQUE INDEX ux_chess_active_account ON chess_matches (user_id)
    WHERE status = 'ACTIVE' AND user_id IS NOT NULL AND mode <> 'ANALYSIS';
CREATE UNIQUE INDEX ux_chess_active_guest ON chess_matches (player_id)
    WHERE status = 'ACTIVE' AND player_id IS NOT NULL AND mode <> 'ANALYSIS';
CREATE UNIQUE INDEX ux_chess_analysis_account ON chess_matches (user_id)
    WHERE status = 'ACTIVE' AND user_id IS NOT NULL AND mode = 'ANALYSIS';
CREATE UNIQUE INDEX ux_chess_analysis_guest ON chess_matches (player_id)
    WHERE status = 'ACTIVE' AND player_id IS NOT NULL AND mode = 'ANALYSIS';
CREATE INDEX ix_chess_matches_source ON chess_matches (source_match_id) WHERE source_match_id IS NOT NULL;
