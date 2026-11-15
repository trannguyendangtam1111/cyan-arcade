-- Every leaderboard is one mode of one game: its queries filter on (game_id, mode) and, for the daily
-- and weekly boards, on a created_at window. This index serves those filters for every mode and every
-- period, all time included (a range on its first two columns). Ranking itself (each player's best,
-- then the order) is sorted per query as before, so no index for an ascending score order is needed.
--
-- Additive only: the existing indexes stay, so a backend from before this version runs as it did.
CREATE INDEX ix_scores_game_mode_created ON scores (game_id, mode, created_at);
