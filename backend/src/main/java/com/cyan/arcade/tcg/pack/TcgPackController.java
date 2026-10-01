package com.cyan.arcade.tcg.pack;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Browsing packs. Opening one is the business of {@code tcg.opening}. */
@RestController
@RequestMapping("/api/tcg/packs")
class TcgPackController {

	private final TcgPackService packs;

	TcgPackController(TcgPackService packs) {
		this.packs = packs;
	}

	@GetMapping
	List<PackResponse> ofSet(@RequestParam("set") Long setId) {
		return this.packs.packsOfSet(setId);
	}

	@GetMapping("/{id}")
	PackResponse get(@PathVariable Long id) {
		return this.packs.getAvailable(id);
	}

}
