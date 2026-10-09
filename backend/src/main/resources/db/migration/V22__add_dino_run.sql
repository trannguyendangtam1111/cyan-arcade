-- Dino Run joins the catalog. Its rules live in the application (gamerules.DinoRunRunRules); here
-- is what the hub shows, and a ceiling on scores far above any real run (the run's time is what
-- really bounds a score: the server checks it against the speed curve).
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order, max_score)
VALUES ('dino-run', 'Dino Run',
        'Run with Pip the little dino through eight pixel worlds: jump mounds and pillars, duck under bats, and see how far you get as the world speeds up.',
        'ARCADE', '/thumbnails/dino-run.svg', '#14b8a6', 90, 500000);

-- A few looks for Pip, the obstacles and the world, sold as game skins like the other games'.
-- Colours and the arcade's existing pixel worlds only: no new pictures. Mint Pip, the world's own
-- obstacle colours and the Journey through every world are the game's own and free.
INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order,
                        game_slug, slot)
VALUES
    ('DINO_RUNNER_SAKURA', 'Sakura Pip', 'Pip in cherry-blossom pink.',
        'GAME_SKIN', 250, 1, 1, 1, 'sakura', 600, 'dino-run', 'runner'),
    ('DINO_RUNNER_MIDNIGHT', 'Midnight Pip', 'A deep-blue Pip with glowing cyan spikes.',
        'GAME_SKIN', 500, 1, 1, 2, 'midnight', 601, 'dino-run', 'runner'),
    ('DINO_OBSTACLES_CANDY', 'Candy Pop', 'Mounds, pillars and bats in sweet candy colours.',
        'GAME_SKIN', 300, 1, 1, 1, 'candy', 620, 'dino-run', 'obstacles'),
    ('DINO_WORLD_GALAXY', 'Magical Galaxy', 'Run under the stars of the Magical Galaxy all the way.',
        'GAME_SKIN', 400, 1, 1, 2, 'galaxy', 640, 'dino-run', 'world'),
    ('DINO_WORLD_MOON', 'Dark Moon', 'Run by moonlight through the Dark Moon all the way.',
        'GAME_SKIN', 600, 1, 1, 3, 'moon', 641, 'dino-run', 'world');
