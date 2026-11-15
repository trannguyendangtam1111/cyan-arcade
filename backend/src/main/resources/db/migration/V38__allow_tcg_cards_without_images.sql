-- Cards without a picture. A card game whose artwork the arcade may not show (Yu-Gi-Oh!: the images
-- are Konami's, and the data source forbids hotlinking them) is shown with its card text instead.
-- Which games may do this is decided by the importer, per dataset: Pokémon and One Piece still need an
-- image for every card. Existing rows are not changed: every card here has a non-blank image today.

ALTER TABLE tcg_cards
    ALTER COLUMN image_url DROP NOT NULL,
    -- "No picture" is NULL, never an empty or blank string, for the full-size image and the thumbnail.
    ADD CONSTRAINT ck_tcg_cards_image_url CHECK (image_url ~ '\S'),
    ADD CONSTRAINT ck_tcg_cards_thumbnail_url CHECK (thumbnail_url ~ '\S'),
    -- A thumbnail is a smaller copy of the image, so a card without an image has none.
    ADD CONSTRAINT ck_tcg_cards_thumbnail_needs_image CHECK (thumbnail_url IS NULL OR image_url IS NOT NULL);
