package com.cyan.arcade.shop;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;

import com.cyan.arcade.common.platform.BonusPacks;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Card packs bought in the shop (or won). They are kept as a count in the inventory and are the
 * platform's {@link BonusPacks}: the card game uses one when a player's daily allowance is gone.
 * The card game never sees the shop, and the shop never sees the card game.
 */
@Component
class PackItems implements ItemHandler, BonusPacks {

	private final ShopStore store;

	private final Clock clock;

	PackItems(ShopStore store, Clock clock) {
		this.store = store;
		this.clock = clock;
	}

	@Override
	public Set<ItemType> types() {
		return Set.of(ItemType.PACK);
	}

	@Override
	public boolean isEquippable(ItemType type) {
		return false;
	}

	@Override
	public void give(Long userId, ShopItem item, int units, Instant now) {
		this.store.add(userId, item.id(), units, now);
	}

	@Override
	@Transactional(readOnly = true)
	public int countOf(Long userId) {
		return this.store.countOfType(userId, ItemType.PACK);
	}

	@Override
	@Transactional
	public boolean useOne(Long userId) {
		return this.store.takeOneOfType(userId, ItemType.PACK, this.clock.instant());
	}

}
