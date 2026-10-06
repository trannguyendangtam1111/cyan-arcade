-- Daily and weekly leaderboards read one game's scores within a time range, then rank them. This
-- index finds those rows without reading the game's whole history; the all-time board keeps using
-- ix_scores_leaderboard (game_id, score DESC, created_at, id).
CREATE INDEX ix_scores_game_created ON scores (game_id, created_at);
