-- The launch line-up. Gameplay ships later; being in the catalog only means the game is listed.
INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, display_order)
VALUES ('snake', 'Snake',
        'Guide a hungry snake around the board, gobble up snacks and try not to bite your own tail.',
        'ARCADE', '/thumbnails/snake.svg', '#22c55e', 10),
       ('2048', '2048',
        'Slide the tiles, merge matching numbers and keep doubling until you reach the 2048 tile.',
        'PUZZLE', '/thumbnails/2048.svg', '#f59e0b', 20),
       ('tetris', 'Tetris',
        'Rotate and drop falling blocks to clear lines before the stack reaches the top.',
        'PUZZLE', '/thumbnails/tetris.svg', '#8b5cf6', 30);
