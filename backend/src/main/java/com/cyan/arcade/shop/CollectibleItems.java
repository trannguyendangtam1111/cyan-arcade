package com.cyan.arcade.shop;

import java.time.Instant;
import java.util.Set;

import org.springframework.stereotype.Component;

/**
 * Badges, titles and cosmetics (profile frames): owned once and shown on the profile, one of each
 * type at a time. The first of a type a player gets is put on straight away, so buying one shows at
 * once.
 */
@Component
class CollectibleItems implements ItemHandler {

	private static final Set<ItemType> EQUIPPABLE = Set.of(ItemType.BADGE, ItemType.TITLE, ItemType.COSMETIC);

	private final ShopStore store;

	CollectibleItems(ShopStore store) {
		this.store = store;
	}

	@Override
	public Set<ItemType> types() {
		return Set.of(ItemType.BADGE, ItemType.TITLE, ItemType.COSMETIC);
	}

	@Override
	public boolean isEquippable(ItemType type) {
		return EQUIPPABLE.contains(type);
	}

	@Override
	public void give(Long userId, ShopItem item, int units, Instant now) {
		boolean wearsOne = this.store.wearsAny(userId, item.type());
		this.store.add(userId, item.id(), units, now);
		if (isEquippable(item.type()) && !wearsOne) {
			this.store.equip(userId, item, now);
		}
	}

}
