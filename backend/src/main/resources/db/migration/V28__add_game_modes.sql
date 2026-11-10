-- Which ruleset of its game a run was played under. Every run so far, and every insert that does not
-- name one (an older backend during a rollout or rollback), is the game's standard ruleset: 'classic'.
-- Which modes exist is decided by the application; the database only keeps the identifiers well formed.
--
-- A column with a constant default is added without rewriting the table (PostgreSQL 11+), so existing
-- rows read as 'classic' at once. The default stays permanently.
ALTER TABLE game_sessions ADD COLUMN mode VARCHAR(24) NOT NULL DEFAULT 'classic';
ALTER TABLE scores ADD COLUMN mode VARCHAR(24) NOT NULL DEFAULT 'classic';

-- Lowercase letters, digits and hyphens, starting with a letter: safe in URLs, logs and query keys.
ALTER TABLE game_sessions ADD CONSTRAINT ck_game_sessions_mode CHECK (mode ~ '^[a-z][a-z0-9-]{0,23}$');
ALTER TABLE scores ADD CONSTRAINT ck_scores_mode CHECK (mode ~ '^[a-z][a-z0-9-]{0,23}$');
