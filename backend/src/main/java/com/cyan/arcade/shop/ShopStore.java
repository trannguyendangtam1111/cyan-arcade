package com.cyan.arcade.shop;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The shop's items, what players own, and what they bought. */
@Repository
class ShopStore {

	private static final String ITEM_COLUMNS = """
			i.id, i.code, i.name, i.description, i.type, i.price, i.quantity, i.max_owned, i.min_level, i.icon,
			i.active, i.game_slug, i.slot""";

	/**
	 * Items worn together with {@code i}: of its type and, for a game skin, of its game and slot.
	 * Badges, titles and frames have neither, so for them this is just the type.
	 */
	private static final String SAME_KIND = """
			i.type = :type AND i.game_slug IS NOT DISTINCT FROM CAST(:gameSlug AS VARCHAR)
			AND i.slot IS NOT DISTINCT FROM CAST(:slot AS VARCHAR)""";

	private final JdbcClient jdbc;

	ShopStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** One row of a player's inventory, with its item. */
	record Owned(ShopItem item, int quantity, boolean equipped, Instant acquiredAt) {
	}

	record Purchase(Long id, Long itemId, int price, int quantity, Instant createdAt) {
	}

	/** What the shop has on sale, in display order. */
	List<ShopItem> findActiveItems() {
		return this.jdbc.sql("SELECT " + ITEM_COLUMNS + " FROM shop_items i WHERE i.active ORDER BY i.sort_order, i.id")
			.query(ShopStore::toItem)
			.list();
	}

	Optional<ShopItem> findItem(Long id) {
		return this.jdbc.sql("SELECT " + ITEM_COLUMNS + " FROM shop_items i WHERE i.id = :id")
			.param("id", id)
			.query(ShopStore::toItem)
			.optional();
	}

	Optional<ShopItem> findItemByCode(String code) {
		return this.jdbc.sql("SELECT " + ITEM_COLUMNS + " FROM shop_items i WHERE i.code = :code")
			.param("code", code)
			.query(ShopStore::toItem)
			.optional();
	}

	/** How many of each item a player owns, by item id. Items they never had are absent. */
	Map<Long, Integer> quantitiesOf(Long userId) {
		return this.jdbc.sql("SELECT item_id, quantity FROM user_inventory WHERE user_id = :userId")
			.param("userId", userId)
			.query((row, index) -> Map.entry(row.getLong("item_id"), row.getInt("quantity")))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	/** A player's inventory, in the shop's display order. Items they used up are left out. */
	List<Owned> inventoryOf(Long userId) {
		// The item has a quantity too (units per purchase): the one owned needs a name of its own.
		return this.jdbc.sql("SELECT " + ITEM_COLUMNS + """
				, inv.quantity AS owned_quantity, inv.equipped, inv.acquired_at
				FROM user_inventory inv
				JOIN shop_items i ON i.id = inv.item_id
				WHERE inv.user_id = :userId AND inv.quantity > 0
				ORDER BY i.sort_order, i.id
				""")
			.param("userId", userId)
			.query((row, index) -> new Owned(toItem(row, index), row.getInt("owned_quantity"),
					row.getBoolean("equipped"), row.getObject("acquired_at", OffsetDateTime.class).toInstant()))
			.list();
	}

	/** Adds units of an item to a player's inventory, atomically, creating the row on the first one. */
	void add(Long userId, Long itemId, int units, Instant now) {
		this.jdbc.sql("""
				INSERT INTO user_inventory (user_id, item_id, quantity, equipped, acquired_at, updated_at)
				VALUES (:userId, :itemId, :units, FALSE, :now, :now)
				ON CONFLICT (user_id, item_id)
				DO UPDATE SET quantity = user_inventory.quantity + :units, updated_at = :now
				""")
			.param("userId", userId)
			.param("itemId", itemId)
			.param("units", units)
			.param("now", at(now))
			.update();
	}

	/** How many units a player owns across every item of a type. */
	int countOfType(Long userId, ItemType type) {
		return this.jdbc.sql("""
				SELECT coalesce(sum(inv.quantity), 0)
				FROM user_inventory inv
				JOIN shop_items i ON i.id = inv.item_id
				WHERE inv.user_id = :userId AND i.type = :type
				""")
			.param("userId", userId)
			.param("type", type.name())
			.query(Integer.class)
			.single();
	}

	/**
	 * Takes one unit of any item of a type from a player, atomically: never below zero, even when two
	 * requests try at once.
	 * @return {@code false} when they have none
	 */
	boolean takeOneOfType(Long userId, ItemType type, Instant now) {
		return this.jdbc.sql("""
				UPDATE user_inventory SET quantity = quantity - 1, updated_at = :now
				WHERE (user_id, item_id) = (
				    SELECT inv.user_id, inv.item_id
				    FROM user_inventory inv
				    JOIN shop_items i ON i.id = inv.item_id
				    WHERE inv.user_id = :userId AND i.type = :type AND inv.quantity > 0
				    ORDER BY i.quantity, i.id
				    LIMIT 1
				    FOR UPDATE OF inv)
				AND quantity > 0
				""")
			.param("userId", userId)
			.param("type", type.name())
			.param("now", at(now))
			.update() == 1;
	}

	/**
	 * Makes one owned item the one the player wears, and takes off the others of its kind (its type
	 * and, for a game skin, its game's slot), in one statement.
	 * @return {@code false} when the player does not own that item
	 */
	boolean equip(Long userId, ShopItem item, Instant now) {
		if (this.jdbc.sql("SELECT count(*) FROM user_inventory WHERE user_id = :userId AND item_id = :itemId AND quantity > 0")
			.param("userId", userId)
			.param("itemId", item.id())
			.query(Integer.class)
			.single() == 0) {
			return false;
		}
		this.jdbc.sql("""
				UPDATE user_inventory inv SET equipped = (inv.item_id = :itemId), updated_at = :now
				FROM shop_items i
				WHERE i.id = inv.item_id AND inv.user_id = :userId AND\s""" + SAME_KIND)
			.param("userId", userId)
			.param("itemId", item.id())
			.param("type", item.type().name())
			.param("gameSlug", item.gameSlug())
			.param("slot", item.slot())
			.param("now", at(now))
			.update();
		return true;
	}

	void unequip(Long userId, Long itemId, Instant now) {
		this.jdbc.sql("""
				UPDATE user_inventory SET equipped = FALSE, updated_at = :now
				WHERE user_id = :userId AND item_id = :itemId
				""").param("userId", userId).param("itemId", itemId).param("now", at(now)).update();
	}

	/** Whether the player wears any item of the same kind as this one (see {@link #equip}). */
	boolean wearsAnyLike(Long userId, ShopItem item) {
		return this.jdbc.sql("""
				SELECT count(*) FROM user_inventory inv JOIN shop_items i ON i.id = inv.item_id
				WHERE inv.user_id = :userId AND inv.equipped AND\s""" + SAME_KIND)
			.param("userId", userId)
			.param("type", item.type().name())
			.param("gameSlug", item.gameSlug())
			.param("slot", item.slot())
			.query(Integer.class)
			.single() > 0;
	}

	Optional<Purchase> findPurchase(Long userId, UUID requestId) {
		return this.jdbc.sql("""
				SELECT id, item_id, price, quantity, created_at FROM purchases
				WHERE user_id = :userId AND request_id = :requestId
				""")
			.param("userId", userId)
			.param("requestId", requestId)
			.query((row, index) -> new Purchase(row.getLong("id"), row.getLong("item_id"), row.getInt("price"),
					row.getInt("quantity"), row.getObject("created_at", OffsetDateTime.class).toInstant()))
			.optional();
	}

	Long insertPurchase(Long userId, ShopItem item, UUID requestId, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO purchases (user_id, item_id, price, quantity, request_id, created_at)
				VALUES (:userId, :itemId, :price, :quantity, :requestId, :now)
				RETURNING id
				""")
			.param("userId", userId)
			.param("itemId", item.id())
			.param("price", item.price())
			.param("quantity", item.quantity())
			.param("requestId", requestId)
			.param("now", at(now))
			.query(Long.class)
			.single();
	}

	private static ShopItem toItem(ResultSet row, int index) throws SQLException {
		return new ShopItem(row.getLong("id"), row.getString("code"), row.getString("name"),
				row.getString("description"), ItemType.valueOf(row.getString("type")), row.getInt("price"),
				row.getInt("quantity"), row.getObject("max_owned", Integer.class), row.getInt("min_level"),
				row.getString("icon"), row.getBoolean("active"), row.getString("game_slug"), row.getString("slot"));
	}

	private static OffsetDateTime at(Instant instant) {
		return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
	}

}
