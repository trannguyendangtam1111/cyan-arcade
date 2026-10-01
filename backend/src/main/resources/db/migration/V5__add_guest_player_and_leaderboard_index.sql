-- Guest identity: a random id chosen by the player's browser and sent with each run.
-- It lets the leaderboard say "this is your score" before accounts exist. NULL means the client
-- sent none. It is never returned by the API. Once accounts arrive, "user_id" takes over and this
-- column can be used to hand a guest's past scores to their new account.
ALTER TABLE game_sessions ADD COLUMN player_id UUID;
ALTER TABLE scores ADD COLUMN player_id UUID;

-- "My best score in this game".
CREATE INDEX ix_scores_player_game ON scores (player_id, game_id) WHERE player_id IS NOT NULL;

-- The leaderboard order: best score first, and among equal scores the one achieved first.
DROP INDEX ix_scores_game_score;
CREATE INDEX ix_scores_leaderboard ON scores (game_id, score DESC, created_at, id);
