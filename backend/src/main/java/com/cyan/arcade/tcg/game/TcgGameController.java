package com.cyan.arcade.tcg.game;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tcg/games")
class TcgGameController {

	private final TcgGameService games;

	TcgGameController(TcgGameService games) {
		this.games = games;
	}

	@GetMapping
	List<TcgGameResponse> list() {
		return this.games.listActive();
	}

	@GetMapping("/{slug}")
	TcgGameResponse get(@PathVariable String slug) {
		return this.games.getActive(slug);
	}

}
