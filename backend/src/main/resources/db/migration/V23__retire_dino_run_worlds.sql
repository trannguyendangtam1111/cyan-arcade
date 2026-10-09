-- Dino Run's world is no longer a skin: every run goes through all eight worlds in turn, so the two
-- world skins leave the shop. Anything bought stays in its owner's inventory, no longer worn; the
-- empty rows an admin's free wear leaves behind go.

UPDATE shop_items SET active = FALSE
WHERE code IN ('DINO_WORLD_GALAXY', 'DINO_WORLD_MOON');

DELETE FROM user_inventory
WHERE quantity = 0
  AND item_id IN (SELECT id FROM shop_items WHERE code IN ('DINO_WORLD_GALAXY', 'DINO_WORLD_MOON'));

UPDATE user_inventory SET equipped = FALSE
WHERE item_id IN (SELECT id FROM shop_items WHERE code IN ('DINO_WORLD_GALAXY', 'DINO_WORLD_MOON'));
