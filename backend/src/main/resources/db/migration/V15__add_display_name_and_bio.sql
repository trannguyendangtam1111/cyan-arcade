-- Player identity. The username stays the account's stable identity (sign-in, uniqueness, profile
-- links); the display name is what other players see, and the player may change it at will. A
-- short bio is optional.

-- Existing accounts start with their username as their display name, so nothing changes on screen.
ALTER TABLE users ADD COLUMN display_name VARCHAR(24);
UPDATE users SET display_name = username;
ALTER TABLE users
    ALTER COLUMN display_name SET NOT NULL,
    -- 2 to 24 characters, with no blank edges: the application trims before saving.
    ADD CONSTRAINT ck_users_display_name CHECK (char_length(display_name) BETWEEN 2 AND 24
        AND display_name = btrim(display_name)),
    ADD COLUMN bio VARCHAR(160),
    -- NULL for no bio, never an empty one.
    ADD CONSTRAINT ck_users_bio CHECK (bio IS NULL OR (char_length(bio) BETWEEN 1 AND 160 AND bio = btrim(bio)));
