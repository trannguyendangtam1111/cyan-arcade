package com.cyan.arcade.tcg.card;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tcg/cards")
class TcgCardController {

	private final TcgCardService cards;

	TcgCardController(TcgCardService cards) {
		this.cards = cards;
	}

	/** The cards of one set. Which of them a player owns is part of their collection, not of this. */
	@GetMapping
	List<CardResponse> ofSet(@RequestParam("set") Long setId) {
		return this.cards.cardsOfSet(setId);
	}

}
