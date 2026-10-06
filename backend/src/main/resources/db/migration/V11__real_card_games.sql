-- Real card games (Pokémon, One Piece, ...) imported from external sources.
--
-- 1. The fictional demo game that used to ship with the arcade is removed, together with everything
--    players did with it: its cards must not end up mixed with real ones.
-- 2. Cards, sets and games learn what real data needs: stable external ids, card variants that share
--    a printed number, an image in two sizes, logos instead of drawn artwork, attribution.

-- 1. The demo game, in dependency order. Openings and collections of other games are untouched.
DELETE FROM tcg_pack_opening_cards
WHERE card_id IN (SELECT c.id FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = 'cyan-critters');

DELETE FROM tcg_pack_openings
WHERE pack_id IN (SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id = p.set_id
                  JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = 'cyan-critters');

DELETE FROM tcg_user_cards
WHERE card_id IN (SELECT c.id FROM tcg_cards c JOIN tcg_games g ON g.id = c.game_id WHERE g.slug = 'cyan-critters');

-- Pools and odds go with their packs (ON DELETE CASCADE).
DELETE FROM tcg_packs
WHERE set_id IN (SELECT s.id FROM tcg_sets s JOIN tcg_games g ON g.id = s.game_id WHERE g.slug = 'cyan-critters');

DELETE FROM tcg_cards WHERE game_id IN (SELECT id FROM tcg_games WHERE slug = 'cyan-critters');
DELETE FROM tcg_sets WHERE game_id IN (SELECT id FROM tcg_games WHERE slug = 'cyan-critters');
DELETE FROM tcg_rarities WHERE game_id IN (SELECT id FROM tcg_games WHERE slug = 'cyan-critters');
DELETE FROM tcg_games WHERE slug = 'cyan-critters';

-- 2a. Games: a brand color, and who the data and images come from.
ALTER TABLE tcg_games
    ALTER COLUMN image_url DROP NOT NULL,
    -- The game's own accent color, "#rrggbb". The arcade keeps its cyan; this colors the game's pages.
    ADD COLUMN accent_color VARCHAR(7),
    -- Where the catalog came from and whose the cards are, shown on the game's pages.
    ADD COLUMN attribution  VARCHAR(500) NOT NULL DEFAULT '',
    ADD CONSTRAINT ck_tcg_games_accent_color CHECK (accent_color ~ '^#[0-9a-f]{6}$');

-- 2b. Sets: the source's own id, a logo that may be missing, and a real card to show for the set.
ALTER TABLE tcg_sets
    ALTER COLUMN image_url DROP NOT NULL,
    ADD COLUMN external_id     VARCHAR(100),
    -- A group of sets, such as "Scarlet & Violet" or "Booster Pack".
    ADD COLUMN series          VARCHAR(100),
    -- The image of one of the set's own cards, for when there is no logo to show.
    ADD COLUMN cover_image_url VARCHAR(500),
    ADD CONSTRAINT uq_tcg_sets_game_external_id UNIQUE (game_id, external_id);

-- 2c. Cards. The printed number no longer identifies a card: real sets print alternate arts
-- ("parallels") under the same number. The source's id does, across the whole game.
ALTER TABLE tcg_cards
    ADD COLUMN external_id   VARCHAR(100),
    -- Where the card sits in its set's list; sources give the order, and "10" sorts before "2" as text.
    ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0,
    -- A smaller image for grids, when the source has one; image_url is the full-size image.
    ADD COLUMN thumbnail_url VARCHAR(500);

UPDATE tcg_cards c SET external_id = s.code || '-' || c.card_number FROM tcg_sets s WHERE s.id = c.set_id;

ALTER TABLE tcg_cards
    ALTER COLUMN external_id SET NOT NULL,
    DROP CONSTRAINT uq_tcg_cards_set_number,
    ADD CONSTRAINT uq_tcg_cards_game_external_id UNIQUE (game_id, external_id);

-- A set's cards in order (also serves "the cards of a set"), and lookups by printed number.
CREATE INDEX ix_tcg_cards_set_order ON tcg_cards (set_id, display_order, id);
CREATE INDEX ix_tcg_cards_game_number ON tcg_cards (game_id, card_number);

-- 2d. Packs: drawn from their set's logo when there is no artwork, and honest about their odds.
ALTER TABLE tcg_packs
    ALTER COLUMN image_url DROP NOT NULL,
    -- Where the odds come from, e.g. that they are a simulator's and not the publisher's.
    ADD COLUMN odds_note VARCHAR(300);
