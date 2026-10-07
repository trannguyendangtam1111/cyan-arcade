package com.cyan.arcade.shop;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.common.security.Role;
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
	 * @param type only items of this type, or {@code null} for all
	 */
	@Transactional(readOnly = true)
	public ShopResponse catalog(Long userId, ItemType type) {
		List<ShopItem> items = this.store.findActiveItems()
			.stream()
			.filter((item) -> type == null || item.type() == type)
			.toList();
		Viewer viewer = (userId != null) ? viewerOf(userId) : null;
		return new ShopResponse((viewer != null) ? viewer.balance() : null, (viewer != null) ? viewer.level() : null,
				items.stream().map((item) -> toItem(item, viewer)).toList());
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

		return new PurchaseResponse(purchaseId, toItem(item, viewerOf(userId)), item.price(), item.quantity(), balance,
				owned + item.quantity(), false, now);
	}

	/** Everything a player owns. */
	@Transactional(readOnly = true)
	public InventoryResponse inventoryOf(Long userId) {
		return new InventoryResponse(
				this.store.inventoryOf(userId).stream().map(this::toEntry).toList(), this.packs.countOf(userId));
	}

	/**
	 * What a player wears: at most one item of each equippable type on the profile, and one game skin
	 * per slot of a game, owned or (for an admin) worn without owning it.
	 */
	@Transactional(readOnly = true)
	public List<InventoryResponse.Entry> equippedOf(Long userId) {
		Role role = roleOf(userId);
		return Stream
			.concat(this.store.inventoryOf(userId).stream().filter(Owned::equipped),
					this.store.wornWithoutOwning(userId).stream().filter((worn) -> SkinAccess.wearsFree(role, worn.item())))
			.map(this::toEntry)
			.toList();
	}

	/**
	 * Puts on an item, taking off the one of the same kind they wore (the same type or, for a game
	 * skin, the same slot of the same game). The player must own it, except for the skins an admin may
	 * wear without owning ({@link SkinAccess}): those are worn at once, with no purchase and no coins.
	 * The role is the account's on the server. Anything else they do not own cannot be worn.
	 */
	@Transactional
	public InventoryResponse equip(Long userId, Long itemId) {
		ShopItem item = this.store.findItem(itemId).orElseThrow(() -> new NotFoundException("Shop item", itemId));
		if (!this.handlers.get(item.type()).isEquippable(item.type())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ITEM_NOT_EQUIPPABLE,
					"%s cannot be worn".formatted(item.name()));
		}
		Instant now = this.clock.instant();
		if (!this.store.equip(userId, item, now)) {
			if (!SkinAccess.wearsFree(roleOf(userId), item)) {
				throw new NotFoundException("Owned item", itemId);
			}
			this.store.wearWithoutOwning(userId, item, now);
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
		Viewer viewer = viewerOf(userId);
		return new PurchaseResponse(purchase.id(), toItem(item, viewer), purchase.price(), purchase.quantity(),
				viewer.balance(), viewer.quantityOf(item), true, purchase.createdAt());
	}

	private int levelOf(Long userId) {
		return Levels.levelFor(this.users.get(userId).xp());
	}

	private Role roleOf(Long userId) {
		return this.users.get(userId).role();
	}

	/** What the shop needs to know about the player looking at it. */
	private Viewer viewerOf(Long userId) {
		Map<Long, Owned> owned = this.store.inventoryOf(userId)
			.stream()
			.collect(Collectors.toMap((entry) -> entry.item().id(), Function.identity()));
		Set<Long> wornWithoutOwning = this.store.wornWithoutOwning(userId)
			.stream()
			.map((worn) -> worn.item().id())
			.collect(Collectors.toSet());
		return new Viewer(levelOf(userId), this.coins.balanceOf(userId), roleOf(userId), owned, wornWithoutOwning);
	}

	/**
	 * A signed-in player as the shop sees them.
	 * @param owned what they own, by item id
	 * @param wornWithoutOwning the skins they wear without owning them, by item id
	 */
	private record Viewer(int level, long balance, Role role, Map<Long, Owned> owned, Set<Long> wornWithoutOwning) {

		int quantityOf(ShopItem item) {
			Owned entry = this.owned.get(item.id());
			return (entry != null) ? entry.quantity() : 0;
		}

		boolean wears(ShopItem item) {
			Owned entry = this.owned.get(item.id());
			return (entry != null && entry.equipped())
					|| (this.wornWithoutOwning.contains(item.id()) && SkinAccess.wearsFree(this.role, item));
		}

		/** Whether they may put it on now: they own it, or may wear it without owning it. */
		boolean mayWear(ShopItem item, boolean equippable) {
			return equippable && (quantityOf(item) > 0 || SkinAccess.wearsFree(this.role, item));
		}

	}

	/** An item as someone sees it: with what they own and may do for a player, without for a guest. */
	private ShopResponse.Item toItem(ShopItem item, Viewer viewer) {
		ItemHandler handler = this.handlers.get(item.type());
		boolean equippable = handler.isEquippable(item.type());
		boolean consumable = handler.isConsumable(item.type());
		if (viewer == null) {
			return new ShopResponse.Item(item.id(), item.code(), item.name(), item.description(), item.type(),
					item.price(), item.quantity(), item.maxOwned(), item.minLevel(), item.icon(), equippable,
					consumable, null, null, null, null, null, item.gameSlug(), item.slot(), null);
		}
		int owned = viewer.quantityOf(item);
		boolean soldOut = item.maxOwned() != null && owned + item.quantity() > item.maxOwned();
		return new ShopResponse.Item(item.id(), item.code(), item.name(), item.description(), item.type(),
				item.price(), item.quantity(), item.maxOwned(), item.minLevel(), item.icon(), equippable, consumable,
				owned, viewer.level() >= item.minLevel(), soldOut, viewer.wears(item), viewer.balance() >= item.price(),
				item.gameSlug(), item.slot(), viewer.mayWear(item, equippable));
	}

	private InventoryResponse.Entry toEntry(Owned owned) {
		ShopItem item = owned.item();
		ItemHandler handler = this.handlers.get(item.type());
		return new InventoryResponse.Entry(item.id(), item.code(), item.name(), item.description(), item.type(),
				item.icon(), owned.quantity(), handler.isEquippable(item.type()), owned.equipped(),
				handler.isConsumable(item.type()), owned.acquiredAt(), item.gameSlug(), item.slot());
	}

}
