-- Finding runs that were started and never finished, which a scheduled job removes once they are
-- a day old. Partial, because finished sessions (nearly all of them) never need to be found this way.
CREATE INDEX ix_game_sessions_unfinished ON game_sessions (started_at) WHERE finished_at IS NULL;

-- Tetris's accent was too light to carry text: white on it fell just short of the 4.5:1 contrast
-- that WCAG AA asks for. One step darker passes.
UPDATE games
SET accent_color = '#7c3aed'
WHERE slug = 'tetris' AND accent_color = '#8b5cf6';
