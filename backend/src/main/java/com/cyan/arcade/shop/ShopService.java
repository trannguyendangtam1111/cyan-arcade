package com.cyan.arcade.shop;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinService;
import com.cyan.arcade.economy.CoinTransactionType;
import com.cyan.arcade.progression.Levels;
import com.cyan.arcade.shop.ShopStore.Owned;
import com.cyan.arcade.shop.ShopStore.Purchase;
import com.cyan.arcade.user.UserService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The shop: what is on sale, buying it, and what players own. Everything is paid in coins through
 * {@link CoinService}; what an item does once bought is up to the {@link ItemHandler} for its type.
 */
@Service
public class ShopService {

	public static final String LEVEL_TOO_LOW = "LEVEL_TOO_LOW";

	public static final String ITEM_LIMIT_REACHED = "ITEM_LIMIT_REACHED";

	public static final String ITEM_NOT_EQUIPPABLE = "ITEM_NOT_EQUIPPABLE";

	static final String PURCHASE = "PURCHASE";

	private final ShopStore store;

	private final CoinService coins;

	private final UserService users;

	private final Map<ItemType, ItemHandler> handlers = new EnumMap<>(ItemType.class);

	private final PackItems packs;

	private final Clock clock;

	ShopService(ShopStore store, CoinService coins, UserService users, List<ItemHandler> handlers, PackItems packs,
			Clock clock) {
		this.store = store;
		this.coins = coins;
		this.users = users;
		this.packs = packs;
		this.clock = clock;
		for (ItemHandler handler : handlers) {
			handler.types().forEach((type) -> this.handlers.put(type, handler));
		}
		for (ItemType type : ItemType.values()) {
			if (!this.handlers.containsKey(type)) {
				throw new IllegalStateException("No ItemHandler for " + type);
			}
		}
	}

	/**
	 * What is on sale.
	 * @param userId the signed-in player, whose balance and possessions are included, or {@code null}
	 */
	@Transactional(readOnly = true)
	public ShopResponse catalog(Long userId) {
		List<ShopItem> items = this.store.findActiveItems();
		if (userId == null) {
			return new ShopResponse(null, null,
					items.stream().map((item) -> toItem(item, null, null)).toList());
		}
		int level = levelOf(userId);
		Map<Long, Integer> owned = this.store.quantitiesOf(userId);
		return new ShopResponse(this.coins.balanceOf(userId), level,
				items.stream().map((item) -> toItem(item, owned.getOrDefault(item.id(), 0), level)).toList());
	}

	/**
	 * Buys an item: checks the player may have it, takes its price, records the purchase and hands
	 * the item over, all in one transaction. Any failure (too few coins, too low a level, already
	 * owned) changes nothing.
	 *
	 * <p>The player's wallet is locked first, so their purchases happen one at a time and two at once
	 * cannot both pass the checks. A request id that was used before returns that purchase again
	 * without charging.
	 */
	@Transactional
	public PurchaseResponse purchase(Long userId, Long itemId, UUID requestId) {
		this.coins.lock(userId);
		Optional<Purchase> earlier = this.store.findPurchase(userId, requestId);
		if (earlier.isPresent()) {
			return repeated(userId, earlier.get());
		}

		ShopItem item = this.store.findItem(itemId)
			.filter(ShopItem::active)
			.orElseThrow(() -> new NotFoundException("Shop item", itemId));
		int level = levelOf(userId);
		if (level < item.minLevel()) {
			throw new ApiException(HttpStatus.FORBIDDEN, LEVEL_TOO_LOW,
					"%s unlocks at level %d".formatted(item.name(), item.minLevel()));
		}
		int owned = this.store.quantitiesOf(userId).getOrDefault(item.id(), 0);
		if (item.maxOwned() != null && owned + item.quantity() > item.maxOwned()) {
			throw new ConflictException(ITEM_LIMIT_REACHED, "You already own %s".formatted(item.name()));
		}

		Instant now = this.clock.instant();
		Long purchaseId = this.store.insertPurchase(userId, item, requestId, now);
		long balance = this.coins
			.debit(userId, CoinTransactionType.SHOP_PURCHASE, item.price(), CoinReference.of(PURCHASE, purchaseId),
					"Bought " + item.name())
			.balanceAfter();
		this.handlers.get(item.type()).give(userId, item, item.quantity(), now);

		return new PurchaseResponse(purchaseId, toItem(item, owned + item.quantity(), level), item.price(),
				item.quantity(), balance, owned + item.quantity(), false, now);
	}

	/** Everything a player owns. */
	@Transactional(readOnly = true)
	public InventoryResponse inventoryOf(Long userId) {
		return new InventoryResponse(
				this.store.inventoryOf(userId).stream().map(this::toEntry).toList(), this.packs.countOf(userId));
	}

	/** What a player wears on their profile: at most one item of each equippable type. */
	@Transactional(readOnly = true)
	public List<InventoryResponse.Entry> equippedOf(Long userId) {
		return this.store.inventoryOf(userId).stream().filter(Owned::equipped).map(this::toEntry).toList();
	}

	/** Puts on an item the player owns, taking off the one of the same type they wore. */
	@Transactional
	public InventoryResponse equip(Long userId, Long itemId) {
		ShopItem item = this.store.findItem(itemId).orElseThrow(() -> new NotFoundException("Shop item", itemId));
		if (!this.handlers.get(item.type()).isEquippable(item.type())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ITEM_NOT_EQUIPPABLE,
					"%s cannot be worn".formatted(item.name()));
		}
		if (!this.store.equip(userId, item, this.clock.instant())) {
			throw new NotFoundException("Owned item", itemId);
		}
		return inventoryOf(userId);
	}

	@Transactional
	public InventoryResponse unequip(Long userId, Long itemId) {
		this.store.unequip(userId, itemId, this.clock.instant());
		return inventoryOf(userId);
	}

	/**
	 * Gives a player units of an item without a purchase, e.g. a pack won with the daily login reward.
	 * @throws IllegalStateException when there is no item with that code: a configuration mistake
	 */
	@Transactional
	public void give(Long userId, String itemCode, int units) {
		ShopItem item = this.store.findItemByCode(itemCode)
			.orElseThrow(() -> new IllegalStateException("No shop item with code " + itemCode));
		this.handlers.get(item.type()).give(userId, item, units, this.clock.instant());
	}

	/** The name of an item, for telling a player what they won; {@code null} when there is none. */
	@Transactional(readOnly = true)
	public String nameOf(String itemCode) {
		return this.store.findItemByCode(itemCode).map(ShopItem::name).orElse(null);
	}

	private PurchaseResponse repeated(Long userId, Purchase purchase) {
		ShopItem item = this.store.findItem(purchase.itemId()).orElseThrow();
		int owned = this.store.quantitiesOf(userId).getOrDefault(item.id(), 0);
		return new PurchaseResponse(purchase.id(), toItem(item, owned, levelOf(userId)), purchase.price(),
				purchase.quantity(), this.coins.balanceOf(userId), owned, true, purchase.createdAt());
	}

	private int levelOf(Long userId) {
		return Levels.levelFor(this.users.get(userId).xp());
	}

	private ShopResponse.Item toItem(ShopItem item, Integer owned, Integer level) {
		Boolean unlocked = (level != null) ? level >= item.minLevel() : null;
		Boolean soldOut = (owned != null) ? item.maxOwned() != null && owned + item.quantity() > item.maxOwned()
				: null;
		return new ShopResponse.Item(item.id(), item.code(), item.name(), item.description(), item.type(),
				item.price(), item.quantity(), item.maxOwned(), item.minLevel(), item.icon(), owned, unlocked, soldOut);
	}

	private InventoryResponse.Entry toEntry(Owned owned) {
		ShopItem item = owned.item();
		return new InventoryResponse.Entry(item.id(), item.code(), item.name(), item.description(), item.type(),
				item.icon(), owned.quantity(), this.handlers.get(item.type()).isEquippable(item.type()),
				owned.equipped(), owned.acquiredAt());
	}

}
