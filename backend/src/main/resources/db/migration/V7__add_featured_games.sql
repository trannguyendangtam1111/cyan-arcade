-- Games the hub puts in the spotlight on its home page. Curated here, like the rest of the catalog.
ALTER TABLE games
    ADD COLUMN featured BOOLEAN NOT NULL DEFAULT FALSE;

-- The launch line-up is all playable, so all of it is featured. Later games start out unfeatured.
UPDATE games
SET featured = TRUE
WHERE slug IN ('snake', '2048', 'tetris');
