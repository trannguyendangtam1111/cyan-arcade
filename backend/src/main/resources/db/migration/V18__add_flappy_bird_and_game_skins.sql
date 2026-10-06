-- Flappy Bird joins the catalog. Its rules live in the application (gamerules.FlappyBirdRunRules);
-- here is only what the hub shows, and a ceiling for the score: one point per pipe, and a session
-- does not stay open long enough for anything near this many.
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
VALUES ('flappy-bird', 'Flappy Bird',
        'Flap through colourful obstacle courses, master your timing and chase the highest score in the sky.',
        'ARCADE', '/thumbnails/flappy-bird.svg', '#0ea5e9', 50, 9999);

-- Game skins: a new look for one of a game's pieces (Flappy Bird's bird, its pipes, its sky). They
-- are purely cosmetic and never change how a game plays. Like badges and titles they are owned once,
-- and a player wears at most one per slot of a game; wearing none means the game's own default look.
-- The icon names the look in the game's code.
ALTER TABLE shop_items
    ADD COLUMN game_slug VARCHAR(50),
    ADD COLUMN slot      VARCHAR(20),
    ADD CONSTRAINT fk_shop_items_game FOREIGN KEY (game_slug) REFERENCES games (slug),
    DROP CONSTRAINT ck_shop_items_type,
    ADD CONSTRAINT ck_shop_items_type CHECK (type IN ('PACK', 'BADGE', 'TITLE', 'COSMETIC', 'GAME_SKIN')),
    ADD CONSTRAINT ck_shop_items_game_skin CHECK ((type = 'GAME_SKIN') = (game_slug IS NOT NULL AND slot IS NOT NULL));

INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order,
                        game_slug, slot)
VALUES
    -- Birds. The Cyan Bird is the game's own and free for everyone, so it is not sold.
    ('FLAPPY_BIRD_PINKY', 'Pinky Bird', 'A bubbly pink flyer with a bow that never comes undone.',
        'GAME_SKIN', 300, 1, 1, 1, 'pinky', 200, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_MOCHI', 'Mochi Bird', 'Soft, round and a little squishy, with a fresh green sprout.',
        'GAME_SKIN', 350, 1, 1, 1, 'mochi', 201, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_BUNNY', 'Bunny Bird', 'Half bird, half bunny, all ears.',
        'GAME_SKIN', 400, 1, 1, 2, 'bunny', 202, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_CHICK', 'Little Chick', 'Fresh out of the egg, and still wearing a bit of it.',
        'GAME_SKIN', 250, 1, 1, 1, 'chick', 203, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_CLOUD', 'Cloud Bird', 'Made of the fluffiest cloud in the arcade sky.',
        'GAME_SKIN', 450, 1, 1, 2, 'cloud', 204, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_SAKURA', 'Sakura Bird', 'Blossom pink, trailing petals wherever it flies.',
        'GAME_SKIN', 700, 1, 1, 3, 'sakura', 205, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_NEON', 'Neon Anime Bird', 'Big sparkling eyes and a glow straight out of a night-time city.',
        'GAME_SKIN', 900, 1, 1, 4, 'neon', 206, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_STAR', 'Magical Star Bird', 'Wears a star tiara and leaves a trail of glitter.',
        'GAME_SKIN', 900, 1, 1, 4, 'star', 207, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_SAMURAI', 'Samurai Bird', 'A focused warrior with a topknot and a headband.',
        'GAME_SKIN', 800, 1, 1, 3, 'samurai', 208, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_DRAGON', 'Dragon Bird', 'Tiny horns, green scales and a puff of smoke.',
        'GAME_SKIN', 1500, 1, 1, 5, 'dragon', 209, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_PHOENIX', 'Phoenix Bird', 'Burns bright and leaves embers in the sky.',
        'GAME_SKIN', 2000, 1, 1, 6, 'phoenix', 210, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_ANGEL', 'Angel Bird', 'Snow-white feathers and a golden halo.',
        'GAME_SKIN', 1500, 1, 1, 5, 'angel', 211, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_SHADOW', 'Shadow Bird', 'Flies out of the night with glowing violet eyes.',
        'GAME_SKIN', 1800, 1, 1, 6, 'shadow', 212, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_POTATO', 'Potato Bird', 'Nobody knows how it flies. Not even the potato.',
        'GAME_SKIN', 200, 1, 1, 1, 'potato', 213, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_TOAST', 'Toast Bird', 'Golden brown with a pat of butter on top.',
        'GAME_SKIN', 250, 1, 1, 1, 'toast', 214, 'flappy-bird', 'bird'),
    ('FLAPPY_BIRD_BOBA', 'Bubble Tea Bird', 'Milk tea, a straw and a few pearls for the road.',
        'GAME_SKIN', 500, 1, 1, 2, 'boba', 215, 'flappy-bird', 'bird'),

    -- Obstacles. The Classic Cyan Pipe is the game's own.
    ('FLAPPY_PIPE_CANDY', 'Candy Pipes', 'Striped like a candy cane, sweet as can be.',
        'GAME_SKIN', 300, 1, 1, 1, 'candy', 230, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_MARSHMALLOW', 'Marshmallow Pipes', 'Stacks of soft pastel marshmallows.',
        'GAME_SKIN', 300, 1, 1, 1, 'marshmallow', 231, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_STRAWBERRY', 'Strawberry Pipes', 'Juicy red towers with leafy tops.',
        'GAME_SKIN', 350, 1, 1, 1, 'strawberry', 232, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_SAKURA', 'Sakura Towers', 'Blossom-covered towers with little curved roofs.',
        'GAME_SKIN', 700, 1, 1, 3, 'sakura', 233, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_NEON_ENERGY', 'Neon Energy Towers', 'Pillars of humming pink energy.',
        'GAME_SKIN', 900, 1, 1, 4, 'neon-energy', 234, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_MAGIC_CRYSTAL', 'Magical Crystal Towers', 'Amethyst spires sprinkled with stardust.',
        'GAME_SKIN', 900, 1, 1, 4, 'magic-crystal', 235, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_STONE_CASTLE', 'Stone Castle Towers', 'Sturdy grey stone with battlements on top.',
        'GAME_SKIN', 600, 1, 1, 2, 'stone-castle', 236, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_CRYSTAL', 'Crystal Towers', 'Clear ice-blue crystal, cut into sharp facets.',
        'GAME_SKIN', 1200, 1, 1, 5, 'crystal', 237, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_DRAGON', 'Dragon Towers', 'Scaly green towers crowned with horns.',
        'GAME_SKIN', 1500, 1, 1, 5, 'dragon', 238, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_CYBER', 'Cyber Towers', 'Dark steel laced with cyan circuitry.',
        'GAME_SKIN', 1000, 1, 1, 4, 'cyber', 239, 'flappy-bird', 'pipes'),
    ('FLAPPY_PIPE_NEON_TECH', 'Neon Tech Towers', 'Black panels and a bright lime grid.',
        'GAME_SKIN', 1000, 1, 1, 4, 'neon-tech', 240, 'flappy-bird', 'pipes'),

    -- Skies. The Cyan Sky is the game's own.
    ('FLAPPY_SKY_SUNSET', 'Sunset Sky', 'Warm orange evening light over purple hills.',
        'GAME_SKIN', 400, 1, 1, 1, 'sunset', 260, 'flappy-bird', 'sky'),
    ('FLAPPY_SKY_CANDY', 'Candy Sky', 'Cotton-candy clouds in a pink and lilac sky.',
        'GAME_SKIN', 500, 1, 1, 2, 'candy', 261, 'flappy-bird', 'sky'),
    ('FLAPPY_SKY_SAKURA', 'Sakura Sky', 'A pale pink spring sky full of drifting petals.',
        'GAME_SKIN', 700, 1, 1, 3, 'sakura', 262, 'flappy-bird', 'sky'),
    ('FLAPPY_SKY_NIGHT_NEON', 'Night Neon Sky', 'A glowing city skyline under the stars.',
        'GAME_SKIN', 900, 1, 1, 4, 'night-neon', 263, 'flappy-bird', 'sky'),
    ('FLAPPY_SKY_SPACE', 'Space Sky', 'Fly among the stars, past a ringed planet.',
        'GAME_SKIN', 1200, 1, 1, 5, 'space', 264, 'flappy-bird', 'sky');
