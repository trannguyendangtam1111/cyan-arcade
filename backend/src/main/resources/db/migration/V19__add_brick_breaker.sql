-- Brick Breaker joins the catalog. Its rules live in the application (gamerules.BrickBreakerRunRules);
-- here is only what the hub shows, and a ceiling for the score far above any real run.
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
VALUES ('brick-breaker', 'Brick Breaker',
        'Smash through eight handcrafted levels and an endless arcade, chain combos and catch power-ups that rain from the bricks.',
        'ARCADE', '/thumbnails/brick-breaker.svg', '#f97316', 60, 5000000);

-- Its skins, through the game skins added for Flappy Bird: a paddle, a ball and a brick theme
-- (which dresses the arena too). The Cyan Default paddle, the Cyan Orb and Classic Arcade bricks are
-- the game's own and free for everyone, so they are not sold.
INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order,
                        game_slug, slot)
VALUES
    ('BRICK_PADDLE_CANDY', 'Candy Paddle', 'A stick of striped candy.',
        'GAME_SKIN', 300, 1, 1, 1, 'candy', 300, 'brick-breaker', 'paddle'),
    ('BRICK_PADDLE_MOCHI', 'Mochi Paddle', 'Soft and squishy, in three flavours.',
        'GAME_SKIN', 300, 1, 1, 1, 'mochi', 301, 'brick-breaker', 'paddle'),
    ('BRICK_PADDLE_NEON', 'Neon Paddle', 'A bar of humming pink light.',
        'GAME_SKIN', 700, 1, 1, 3, 'neon', 302, 'brick-breaker', 'paddle'),
    ('BRICK_PADDLE_SAKURA', 'Sakura Paddle', 'A lacquered branch in full blossom.',
        'GAME_SKIN', 700, 1, 1, 3, 'sakura', 303, 'brick-breaker', 'paddle'),
    ('BRICK_PADDLE_CYBER', 'Cyber Paddle', 'Dark steel with cyan circuitry.',
        'GAME_SKIN', 1000, 1, 1, 4, 'cyber', 304, 'brick-breaker', 'paddle'),
    ('BRICK_PADDLE_GALAXY', 'Galaxy Paddle', 'A slice of the night sky, stars included.',
        'GAME_SKIN', 1200, 1, 1, 5, 'galaxy', 305, 'brick-breaker', 'paddle'),
    ('BRICK_PADDLE_DRAGON', 'Dragon Paddle', 'Green scales and a golden edge.',
        'GAME_SKIN', 1800, 1, 1, 6, 'dragon', 306, 'brick-breaker', 'paddle'),

    ('BRICK_BALL_BUBBLE', 'Bubble Ball', 'A bubble that refuses to pop.',
        'GAME_SKIN', 250, 1, 1, 1, 'bubble', 320, 'brick-breaker', 'ball'),
    ('BRICK_BALL_FIRE', 'Ember Ball', 'A glowing coal that leaves sparks behind.',
        'GAME_SKIN', 500, 1, 1, 2, 'fire', 321, 'brick-breaker', 'ball'),
    ('BRICK_BALL_ICE', 'Ice Ball', 'A frosty marble that never melts.',
        'GAME_SKIN', 500, 1, 1, 2, 'ice', 322, 'brick-breaker', 'ball'),
    ('BRICK_BALL_STAR', 'Star Ball', 'A lucky little star.',
        'GAME_SKIN', 600, 1, 1, 3, 'star', 323, 'brick-breaker', 'ball'),
    ('BRICK_BALL_PLASMA', 'Plasma Ball', 'Crackling purple energy in a bottle.',
        'GAME_SKIN', 900, 1, 1, 4, 'plasma', 324, 'brick-breaker', 'ball'),
    ('BRICK_BALL_GALAXY', 'Galaxy Ball', 'A whole galaxy, spinning on the spot.',
        'GAME_SKIN', 1500, 1, 1, 5, 'galaxy', 325, 'brick-breaker', 'ball'),

    ('BRICK_THEME_CANDY', 'Candy Bricks', 'Wrapped sweets in a sugar-pink arena.',
        'GAME_SKIN', 400, 1, 1, 1, 'candy', 340, 'brick-breaker', 'bricks'),
    ('BRICK_THEME_NEON', 'Neon Bricks', 'Glowing tubes in a dark city night.',
        'GAME_SKIN', 800, 1, 1, 3, 'neon', 341, 'brick-breaker', 'bricks'),
    ('BRICK_THEME_SAKURA', 'Sakura Bricks', 'Blossom tiles under a spring sky.',
        'GAME_SKIN', 800, 1, 1, 3, 'sakura', 342, 'brick-breaker', 'bricks'),
    ('BRICK_THEME_SPACE', 'Space Bricks', 'Planets and moonrock among the stars.',
        'GAME_SKIN', 1200, 1, 1, 5, 'space', 343, 'brick-breaker', 'bricks'),
    ('BRICK_THEME_FANTASY', 'Fantasy Bricks', 'Castle stone, emeralds and gold in a misty keep.',
        'GAME_SKIN', 1800, 1, 1, 6, 'fantasy', 344, 'brick-breaker', 'bricks');
