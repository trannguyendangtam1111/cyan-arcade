package com.cyan.arcade.shop;

import com.cyan.arcade.common.security.AuthenticatedUser;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The shop and the signed-in player's inventory. A request names an item and nothing else: the
 * price, the player and their balance always come from the server.
 */
@RestController
class ShopController {

	private final ShopService shop;

	ShopController(ShopService shop) {
		this.shop = shop;
	}

	/** Public: guests can see what there is to buy. */
	@GetMapping("/api/shop/items")
	ShopResponse items(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.shop.catalog((user != null) ? user.id() : null);
	}

	@PostMapping("/api/shop/purchases")
	@ResponseStatus(HttpStatus.CREATED)
	PurchaseResponse purchase(@AuthenticationPrincipal AuthenticatedUser user,
			@Valid @RequestBody PurchaseRequest request) {
		return this.shop.purchase(user.id(), request.itemId(), request.requestId());
	}

	@GetMapping("/api/users/me/inventory")
	InventoryResponse inventory(@AuthenticationPrincipal AuthenticatedUser user) {
		return this.shop.inventoryOf(user.id());
	}

	/** Wears a badge or title the player owns. */
	@PutMapping("/api/users/me/inventory/{itemId}/equipped")
	InventoryResponse equip(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long itemId) {
		return this.shop.equip(user.id(), itemId);
	}

	@DeleteMapping("/api/users/me/inventory/{itemId}/equipped")
	InventoryResponse unequip(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long itemId) {
		return this.shop.unequip(user.id(), itemId);
	}

}
