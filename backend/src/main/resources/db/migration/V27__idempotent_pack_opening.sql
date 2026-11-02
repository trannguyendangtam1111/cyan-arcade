-- Successful request results commit with the opening, collection and rewards. Existing openings
-- need no backfill and retain their history. Keep the snapshot even if catalog details change.
CREATE TABLE tcg_pack_opening_requests (
    user_id    BIGINT NOT NULL REFERENCES users (id),
    request_id UUID   NOT NULL,
    pack_id    BIGINT NOT NULL REFERENCES tcg_packs (id),
    opening_id BIGINT NOT NULL UNIQUE REFERENCES tcg_pack_openings (id),
    response   JSONB  NOT NULL,

    PRIMARY KEY (user_id, request_id)
);
