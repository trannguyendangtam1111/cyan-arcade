package com.cyan.arcade.shop;

import java.util.Set;

import com.cyan.arcade.common.security.Role;

/**
 * Which game skins a player may wear without owning them: none for a player, and every skin on sale
 * for the games listed here for an admin. Wearing one this way buys nothing and gives nothing: no
 * purchase, no coins, no ownership. The admin's inventory keeps only a row for the skin they wear in
 * a slot, with a quantity of 0, so it never counts as owned, and the row goes when they take it off.
 *
 * <p>Badges, titles, frames and other games' skins are not included: an admin owns those like
 * anyone else. The role always comes from the account on the server, never from the request.
 */
final class SkinAccess {

	/** The games whose skins every admin may wear for free. */
	static final Set<String> FREE_FOR_ADMINS = Set.of("brick-breaker", "wordle", "sudoku", "dino-run", "chess");

	private SkinAccess() {
	}

	/** Whether someone with this role may wear the item without owning it. */
	static boolean wearsFree(Role role, ShopItem item) {
		return role == Role.ADMIN && item.type() == ItemType.GAME_SKIN && item.active() && item.gameSlug() != null
				&& FREE_FOR_ADMINS.contains(item.gameSlug());
	}

}
