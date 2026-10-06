-- Cosmetics become profile frames: a ring around the player's avatar, worn like a badge or a title
-- (one at a time, shown on the profile and the public profile). Which items are worn is decided in
-- the application; the icon names the frame's look for the frontend.
INSERT INTO shop_items (code, name, description, type, price, quantity, max_owned, min_level, icon, sort_order)
VALUES
    ('FRAME_BUBBLEGUM', 'Bubblegum Frame', 'A sweet pink ring around your avatar.',
        'COSMETIC', 300, 1, 1, 1, 'frame-bubblegum', 100),
    ('FRAME_OCEAN', 'Ocean Frame', 'Cool cyan waves around your avatar.',
        'COSMETIC', 600, 1, 1, 2, 'frame-ocean', 110),
    ('FRAME_RAINBOW', 'Rainbow Frame', 'Every colour of the arcade, all at once.',
        'COSMETIC', 1500, 1, 1, 4, 'frame-rainbow', 120),
    ('FRAME_GOLD', 'Golden Frame', 'A gleaming gold ring for true champions.',
        'COSMETIC', 2500, 1, 1, 6, 'frame-gold', 130);
