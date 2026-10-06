package com.cyan.arcade.tcg.collection;

import com.cyan.arcade.common.security.AuthenticatedUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in player's own collection. Read-only: there is deliberately no way to add, change or
 * remove a card through the API.
 */
@RestController
@RequestMapping("/api/tcg/collection")
class CollectionController {

	/** Enough for every card of the largest real set (a few hundred), which the set page asks for at once. */
	static final int MAX_PAGE_SIZE = 500;

	private final CollectionService collections;

	CollectionController(CollectionService collections) {
		this.collections = collections;
	}

	@GetMapping
	CollectionResponse mine(@AuthenticationPrincipal AuthenticatedUser user,
			@RequestParam(required = false) String game, @RequestParam(required = false) Long set,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "60") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return this.collections.collectionOf(user.id(), game, set, page, size);
	}

}
