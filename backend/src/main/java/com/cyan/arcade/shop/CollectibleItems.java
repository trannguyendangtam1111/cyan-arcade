package com.cyan.arcade.shop;

import java.time.Instant;
import java.util.Set;

import org.springframework.stereotype.Component;

/**
 * Badges, titles, cosmetics (profile frames) and game skins: owned once and worn one of a kind at a
 * time: one badge, one title and one frame on the profile, and one skin per slot of a game. The
 * first of a kind a player gets is put on straight away, so buying one shows at once.
 */
@Component
class CollectibleItems implements ItemHandler {

	private static final Set<ItemType> EQUIPPABLE = Set.of(ItemType.BADGE, ItemType.TITLE, ItemType.COSMETIC,
			ItemType.GAME_SKIN);

	private final ShopStore store;

	CollectibleItems(ShopStore store) {
		this.store = store;
	}

	@Override
	public Set<ItemType> types() {
		return EQUIPPABLE;
	}

	@Override
	public boolean isEquippable(ItemType type) {
		return EQUIPPABLE.contains(type);
	}

	@Override
	public void give(Long userId, ShopItem item, int units, Instant now) {
		boolean wearsOne = this.store.wearsAnyLike(userId, item);
		this.store.add(userId, item.id(), units, now);
		if (isEquippable(item.type()) && !wearsOne) {
			this.store.equip(userId, item, now);
		}
	}

}
